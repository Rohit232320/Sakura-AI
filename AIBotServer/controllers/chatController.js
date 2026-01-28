import axios from 'axios';
import mongoose from 'mongoose';
import { UserContext, GlobalContext } from '../models/AiBotDbSchema.js';
import natural from 'natural';

// ===============================
// NLP SETUP (FALLBACK)
// ===============================
const tokenizer = new natural.WordTokenizer();
const stemmer = natural.PorterStemmer;
const TfIdf = natural.TfIdf;

// ===============================
// GROQ HELPER (FREE)
// ===============================
async function callGroq(systemPrompt, userMessage) {
  try {
    const res = await axios.post(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        model: "llama-3.1-8b-instant",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage }
        ],
        temperature: 0.7,
        max_tokens: 120,
      },
      {
        headers: { 
          "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
          "Content-Type": "application/json"
        },
        timeout: 10000
      }
    );

    return res.data.choices[0]?.message?.content || null;
  } catch (err) {
    console.warn("Groq Error:", err.response?.data?.error?.message || err.message);
    return null;
  }
}

// ===============================
// GEMINI HELPER (FALLBACK)
// ===============================
async function callGemini(fullPrompt) {
  try {
    const apiUrl = process.env.GEMINI_API_URL || 
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent";
    
    const res = await axios.post(
      `${apiUrl}?key=${process.env.GEMINI_API_KEY}`,
      {
        contents: [{ parts: [{ text: fullPrompt }] }],
        generationConfig: {
          maxOutputTokens: 120,
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
 * CONTEXT RETRIEVAL (TF-IDF METHOD)
 * ===============================
 */
async function retrieveUserContext(userId, message) {
  try {
    const userContext = await UserContext.findOne({ userId })
      .select('username conversationHistory')
      .lean();

    if (!userContext) {
      return {
        userInfo: { userId, username: "User" },
        relevantHistory: [],
        recentHistory: [],
        botPersonality: "sassy AI",
        previousBotMessage: null
      };
    }

    const globalContext = await GlobalContext.findOne({})
      .select('botPersonality')
      .lean();
    
    const botPersonality = globalContext?.botPersonality || 
      "toxic, sassy, and slightly unhinged girlfriend AI";

    const conversationHistory = userContext.conversationHistory || [];
    const previousBotMessage = conversationHistory.length > 0
      ? conversationHistory[conversationHistory.length - 1].response
      : null;

    // Get last 2 messages for recency - FILTER OUT NULLS
    const recentHistory = conversationHistory
      .slice(-2)
      .filter(conv => conv && conv.message && conv.response);

    // TF-IDF for relevant history
    let relevantHistory = [];
    if (conversationHistory.length > 0) {
      const tfidf = new TfIdf();
      tfidf.addDocument(preprocessText(message));

      const map = new Map();
      conversationHistory.forEach((conv, idx) => {
        // NULL CHECK HERE
        if(conv && conv.message && conv.message.length > 5) {
          const combined = preprocessText(`${conv.message} ${conv.response || ''}`);
          tfidf.addDocument(combined);
          map.set(idx + 1, conv);
        }
      });

      const scored = [];
      tfidf.tfidfs(preprocessText(message), (i, score) => {
        if (i > 0 && map.has(i)) {
          scored.push({ conv: map.get(i), score });
        }
      });

      relevantHistory = scored
        .sort((a, b) => b.score - a.score)
        .slice(0, 2)
        .map(v => v.conv)
        .filter(conv => conv && conv.message && conv.response); // FILTER NULLS
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
 * UPDATE CONTEXT
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
            $each: [{
              message,
              response,
              timestamp: new Date()
            }],
            $slice: -100
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
  try {
    // Validate request body
    if (!req.body) {
      console.error("Request body is undefined");
      return res.status(400).json({ 
        error: "Request body is missing" 
      });
    }

    const { message, userName } = req.body;
    const userId = req.params.userId;

    // Validate required fields
    if (!message) {
      console.error("Message is missing from request");
      return res.status(400).json({ error: "Message is required" });
    }

    if (!userId) {
      console.error("UserId is missing");
      return res.status(400).json({ error: "UserId is required" });
    }

    const {
      userInfo,
      relevantHistory,
      recentHistory,
      botPersonality,
      previousBotMessage
    } = await retrieveUserContext(userId, message);

    const effectiveUserName = userName || userInfo.username || "User";

    const persona = `You are Sakura AI, a ${botPersonality}.
Rules: 1-2 sentences max. Never mention being AI. Use Hinglish if user does. No emojis.
${previousBotMessage ? `Last: "${previousBotMessage.substring(0, 80)}"` : ""}`;

    // Combine relevant + recent context with NULL SAFETY
    const seenMessages = new Set();
    const allContext = [...relevantHistory, ...recentHistory]
      .filter(c => c && c.message && c.response) // NULL CHECK FIRST!
      .filter(c => {
        const key = c.message.substring(0, 50);
        if (seenMessages.has(key)) return false;
        seenMessages.add(key);
        return true;
      });

    const contextString = allContext
      .slice(-4)
      .map(c => `${effectiveUserName}: ${c.message}\nYou: ${c.response}`)
      .join('\n');

    const finalUserPrompt = contextString 
      ? `Context:\n${contextString}\n\n${effectiveUserName}: ${message}\nSakura:`
      : `${effectiveUserName}: ${message}\nSakura:`;

    let botResponse = null;

    // Try Groq first
    botResponse = await callGroq(persona, finalUserPrompt);

    // Fallback to Gemini
    if (!botResponse) {
      console.warn("⚠️ Groq failed. Switching to Gemini...");
      botResponse = await callGemini(`${persona}\n${finalUserPrompt}`);
    }

    if (!botResponse) {
      botResponse = "Sorry, I am having trouble responding right now. Please try again later.";
    }

    botResponse = removeAllEmojisAndEmoticons(botResponse.trim());

    await updateUserContext(userId, effectiveUserName, message, botResponse);

    res.json({ message: botResponse });

  } catch (err) {
    console.error("chatController critical failure:", err);
    console.error("Error stack:", err.stack);
    res.status(500).json({ 
      error: "Chat failed",
      details: err.message 
    });
  }
};
