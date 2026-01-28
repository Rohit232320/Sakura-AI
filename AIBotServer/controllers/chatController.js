import axios from 'axios';
import mongoose from 'mongoose';
import { UserContext, GlobalContext } from '../models/AiBotDbSchema.js';
import natural from 'natural'; 

// ===============================
// NLP SETUP
// ===============================
const tokenizer = new natural.WordTokenizer();
const stemmer = natural.PorterStemmer;
const TfIdf = natural.TfIdf;

// ===============================
// 1. GROQ HELPER (PRIMARY - FASTEST)
// ===============================
async function callGroq(systemPrompt, userMessage) {
  try {
    const res = await axios.post(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        model: "llama-3.1-8b-instant", // High speed, high limits (14k/day)
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage }
        ],
        temperature: 0.7,
        max_tokens: 150, // Strict limit to save cost/latency
      },
      {
        headers: { 
          "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
          "Content-Type": "application/json"
        },
        timeout: 10000 // 10s timeout is plenty for Groq
      }
    );

    return res.data.choices[0]?.message?.content || null;
  } catch (err) {
    console.warn("Groq Error:", err.response?.data?.error?.message || err.message);
    return null;
  }
}

// ===============================
// 2. GEMINI HELPER (FALLBACK)
// ===============================
async function callGemini(fullPrompt) {
  try {
    // Ensure GEMINI_API_URL in .env points to gemini-2.5-flash-lite for best limits
    const apiUrl = process.env.GEMINI_API_URL || "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent";
    
    const res = await axios.post(
      `${apiUrl}?key=${process.env.GEMINI_API_KEY}`,
      {
        contents: [{ parts: [{ text: fullPrompt }] }],
        generationConfig: {
          maxOutputTokens: 150, // Limit output tokens
          temperature: 0.7
        }
      },
      { timeout: 15000 }
    );

    return res.data.candidates[0].content.parts.map(p => p.text).join(" ");
  } catch (err) {
    console.error("Gemini Error:", err.response?.data?.error?.message || err.message);
    return null;
  }
}

/**
 * ===============================
 * CONTEXT RETRIEVAL (OPTIMIZED RAG)
 * ===============================
 */
async function retrieveUserContext(userId, message) {
  try {
    const userContext = await UserContext.findOne({ userId }).lean();

    if (!userContext) {
      return {
        userInfo: { userId, mood: "neutral" },
        relevantHistory: [],
        recentHistory: [],
        botPersonality: "sassy AI",
        previousBotMessage: null
      };
    }

    const globalContext = await GlobalContext.findOne({}).lean();
    const botPersonality = globalContext?.botPersonality || "toxic, sassy, and slightly unhinged girlfriend AI";

    const conversationHistory = userContext.conversationHistory || [];
    const previousBotMessage = conversationHistory.length > 0
        ? conversationHistory[conversationHistory.length - 1].response
        : null;

    // OPTIMIZATION: Reduce recent history from 5 to 3 to save tokens
    const recentHistory = conversationHistory.slice(-3);

    let relevantHistory = [];
    if (conversationHistory.length > 0) {
      const tfidf = new TfIdf();
      tfidf.addDocument(preprocessText(message));

      const map = new Map();
      conversationHistory.forEach((conv, idx) => {
        // Only index if message is substantial
        if(conv.message && conv.message.length > 5) {
            const combined = preprocessText(`${conv.message} ${conv.response || ''}`);
            tfidf.addDocument(combined);
            map.set(idx + 1, conv);
        }
      });

      const scored = [];
      tfidf.tfidfs(preprocessText(message), (i, score) => {
        if (i > 0) scored.push({ conv: map.get(i), score });
      });

      // OPTIMIZATION: Reduce relevant history from 8 to 2 items
      // We only want the absolutely most relevant past conversations
      relevantHistory = scored
        .sort((a, b) => b.score - a.score)
        .slice(0, 2) 
        .map(v => v.conv);
    }

    return {
      userInfo: {
        userId,
        username: userContext.username || "User",
      },
      relevantHistory,
      recentHistory,
      botPersonality,
      previousBotMessage
    };

  } catch (err) {
    console.error("retrieveUserContext error:", err);
    return {
      userInfo: { userId, username: "User" },
      relevantHistory: [],
      recentHistory: [],
      botPersonality: "friendly",
      previousBotMessage: null
    };
  }
}

/**
 * ===============================
 * CONTEXT UPDATE
 * ===============================
 */
async function updateUserContext(userId, username, message, response) {
  try {
    await UserContext.findOneAndUpdate(
      { userId },
      {
        $set: { username, lastActive: new Date() },
        $push: {
          conversationHistory: {
            message,
            response,
            timestamp: new Date()
          }
        }
      },
      { upsert: true }
    );
  } catch (e) {
    console.error("Context update failed", e);
  }
}

/**
 * ===============================
 * UTILITIES
 * ===============================
 */
function preprocessText(text) {
  if (!text) return '';
  return tokenizer
    .tokenize(text.toLowerCase())
    .filter(t => t.length > 2)
    .map(t => stemmer.stem(t))
    .join(' ');
}

function removeAllEmojisAndEmoticons(text) {
  return text.replace(/[\u{1F600}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '');
}

/**
 * ===============================
 * MAIN CONTROLLER
 * ===============================
 */
export const chatController = async (req, res) => {
  const { message, userName } = req.body;
  const userId = req.params.userId;

  try {
    // 1. Get Context (Reduced Size)
    const {
      userInfo,
      relevantHistory,
      recentHistory,
      botPersonality,
      previousBotMessage
    } = await retrieveUserContext(userId, message);

    const effectiveUserName = userName || userInfo.username || "User";

    // 2. Build Persona (System Prompt)
    const persona = `You are Sakura AI, a ${botPersonality}.
- Reply in 1-2 sentences maximum.
- Never mention being an AI.
- Use Hinglish if the user does.
- No emojis.
${previousBotMessage ? `Your previous reply was: "${previousBotMessage}"` : ""}`;

    // 3. Build Conversation Context
    // Combining relevant (old but similar) + recent (chronological)
    // We filter duplicates roughly by checking timestamps or content logic if needed, 
    // but for now simple concatenation with Set is fine or just relying on their distinct nature.
    const contextItems = [...relevantHistory, ...recentHistory];
    
    // Create a clean text block for context
    const contextString = contextItems.map(c => 
      `${effectiveUserName}: ${c.message}\nYou: ${c.response}`
    ).join('\n');

    const finalUserPrompt = `
CONTEXT:
${contextString}

CURRENT CHAT:
${effectiveUserName}: ${message}
Sakura AI:`;

    let botResponse = null;

    // ===============================
    // ATTEMPT 1: GROQ (Primary)
    // ===============================
    botResponse = await callGroq(persona, finalUserPrompt);

    // ===============================
    // ATTEMPT 2: GEMINI (Fallback)
    // ===============================
    if (!botResponse) {
      console.warn("⚠️ Groq failed or returned empty. Switching to Gemini...");
      const fullGeminiPrompt = `${persona}\n${finalUserPrompt}`;
      botResponse = await callGemini(fullGeminiPrompt);
    }

    // ===============================
    // FINAL FALLBACK
    // ===============================
    if (!botResponse) {
        botResponse = "Hmm.";
    }

    // Clean up
    botResponse = removeAllEmojisAndEmoticons(botResponse);

    // Save
    await updateUserContext(
      userId,
      effectiveUserName,
      message,
      botResponse
    );

    res.json({ message: botResponse });

  } catch (err) {
    console.error("chatController critical failure:", err);
    res.status(500).json({ error: "Chat failed" });
  }
};
