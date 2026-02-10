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
// TEXT SANITIZERS
// ===============================
function sanitizeContext(text) {
  if (!text) return '';
  return text.replace(/\bbeta\b/gi, '');
}

function removeAllEmojisAndEmoticons(text) {
  return text.replace(/[\u{1F600}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '');
}

function removeBannedWords(text) {
  if (!text) return '';
  return text
    .replace(/\bbeta\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// ===============================
// GROQ HELPER
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
    const apiUrl =
      process.env.GEMINI_API_URL ||
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

// ===============================
// CONTEXT RETRIEVAL
// ===============================
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

    const botPersonality =
      globalContext?.botPersonality ||
      "sharp-tongued, witty, dominant Hinglish conversationalist";

    const conversationHistory = userContext.conversationHistory || [];
    const previousBotMessage =
      conversationHistory.length > 0
        ? conversationHistory[conversationHistory.length - 1].response
        : null;

    const recentHistory = conversationHistory.slice(-2);

    let relevantHistory = [];
    if (conversationHistory.length > 0) {
      const tfidf = new TfIdf();
      tfidf.addDocument(preprocessText(message));

      const map = new Map();
      conversationHistory.forEach((conv, idx) => {
        if (conv.message && conv.message.length > 5) {
          const combined = preprocessText(
            sanitizeContext(`${conv.message} ${conv.response || ''}`)
          );
          tfidf.addDocument(combined);
          map.set(idx + 1, conv);
        }
      });

      const scored = [];
      tfidf.tfidfs(preprocessText(message), (i, score) => {
        if (i > 0) scored.push({ conv: map.get(i), score });
      });

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

// ===============================
// UPDATE CONTEXT
// ===============================
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

// ===============================
// UTILITIES
// ===============================
function preprocessText(text) {
  if (!text) return '';
  return tokenizer
    .tokenize(text.toLowerCase())
    .filter(t => t.length > 2)
    .map(t => stemmer.stem(t))
    .join(' ');
}

// ===============================
// MAIN CONTROLLER
// ===============================
export const chatController = async (req, res) => {
  try {
    if (!req.body) {
      return res.status(400).json({ error: "Request body missing" });
    }

    const { message, userName } = req.body;
    const userId = req.params.userId;

    if (!message || !userId) {
      return res.status(400).json({ error: "Message and userId required" });
    }

    const {
      userInfo,
      relevantHistory,
      recentHistory,
      botPersonality,
      previousBotMessage
    } = await retrieveUserContext(userId, message);

    const effectiveUserName = userName || userInfo.username || "User";

    const persona = `
You are Sakura.
Personality: ${botPersonality}

Rules:
- 1–2 sentences max
- Never say you are an AI
- Use Hinglish if user does
- Address user as "tum", their username, or nothing
- Never use parental, diminutive, or ownership terms
- No emojis
`;

    const seen = new Set();
    const allContext = [...relevantHistory, ...recentHistory].filter(c => {
      const key = c.message?.substring(0, 40);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const contextString = sanitizeContext(
      allContext
        .slice(-4)
        .map(c => `${effectiveUserName}: ${c.message}\nSakura: ${c.response}`)
        .join('\n')
    );

    const finalPrompt = contextString
      ? `Context:\n${contextString}\n\n${effectiveUserName}: ${message}\nSakura:`
      : `${effectiveUserName}: ${message}\nSakura:`;

    let botResponse = await callGroq(persona, finalPrompt);

    if (!botResponse) {
      botResponse = await callGemini(`${persona}\n${finalPrompt}`);
    }

    if (!botResponse) {
      botResponse = "Abhi response nahi ban pa raha, thodi der baad try karo.";
    }

    botResponse = removeAllEmojisAndEmoticons(botResponse);
    botResponse = removeBannedWords(botResponse);

    await updateUserContext(userId, effectiveUserName, message, botResponse);

    res.json({ message: botResponse });

  } catch (err) {
    console.error("chatController failure:", err);
    res.status(500).json({ error: "Chat failed", details: err.message });
  }
};
