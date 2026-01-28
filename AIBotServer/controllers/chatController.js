import axios from 'axios';
import mongoose from 'mongoose';
import { UserContext, GlobalContext } from '../models/AiBotDbSchema.js';

// ===============================
// MONGODB ATLAS VECTOR SEARCH SCHEMA
// ===============================
const conversationVectorSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  message: { type: String, required: true },
  response: { type: String, required: true },
  embedding: { type: [Number], required: true }, // 384 dimensions for HuggingFace model
  timestamp: { type: Date, default: Date.now },
  conversationId: { type: Number, required: true }
});

conversationVectorSchema.index({ userId: 1, timestamp: -1 });

const ConversationVector = mongoose.model('ConversationVector', conversationVectorSchema);

// ===============================
// FREE EMBEDDING - HUGGINGFACE ONLY
// ===============================
/**
 * HuggingFace Free Inference API
 * Model: sentence-transformers/all-MiniLM-L6-v2
 * NO API KEY NEEDED! (but optional token gives better rate limits)
 * Rate Limit: 1000 req/hour without token, 3000 req/hour with token
 */
async function generateEmbedding(text) {
  try {
    const response = await axios.post(
      'https://api-inference.huggingface.co/models/sentence-transformers/all-MiniLM-L6-v2',
      { inputs: text.substring(0, 500) },
      { 
        headers: { 
          'Content-Type': 'application/json',
          ...(process.env.HUGGINGFACE_TOKEN && {
            'Authorization': `Bearer ${process.env.HUGGINGFACE_TOKEN}`
          })
        },
        timeout: 10000 
      }
    );
    
    return response.data; // 384-dimensional array
  } catch (err) {
    // If model is loading, retry once
    if (err.response?.data?.error?.includes('loading')) {
      console.log('Model loading, retrying in 2s...');
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      try {
        const response = await axios.post(
          'https://api-inference.huggingface.co/models/sentence-transformers/all-MiniLM-L6-v2',
          { inputs: text.substring(0, 500) },
          { 
            headers: { 
              'Content-Type': 'application/json',
              ...(process.env.HUGGINGFACE_TOKEN && {
                'Authorization': `Bearer ${process.env.HUGGINGFACE_TOKEN}`
              })
            },
            timeout: 10000 
          }
        );
        return response.data;
      } catch (retryErr) {
        console.error("HF Embedding retry failed:", retryErr.message);
        return null;
      }
    }
    
    console.error("HF Embedding error:", err.message);
    return null;
  }
}

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
// GEMINI HELPER (FALLBACK - FREE)
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
 * STORE IN MONGODB VECTOR COLLECTION
 * ===============================
 */
async function storeConversationVector(userId, message, response, conversationId) {
  try {
    const combinedText = `User: ${message}\nBot: ${response}`;
    const embedding = await generateEmbedding(combinedText);
    
    if (!embedding) {
      console.warn("Skipping vector storage - embedding generation failed");
      return;
    }

    await ConversationVector.create({
      userId,
      message,
      response,
      embedding,
      conversationId,
      timestamp: new Date()
    });
    
  } catch (err) {
    console.error("Vector storage error:", err.message);
  }
}

/**
 * ===============================
 * MONGODB ATLAS VECTOR SEARCH
 * ===============================
 */
async function retrieveRelevantContext(userId, message, topK = 2) {
  try {
    const queryEmbedding = await generateEmbedding(message);
    
    if (!queryEmbedding) {
      console.warn("Could not generate query embedding, using fallback");
      return [];
    }

    // MongoDB Atlas Vector Search
    const results = await ConversationVector.aggregate([
      {
        $vectorSearch: {
          index: "vector_index",
          path: "embedding",
          queryVector: queryEmbedding,
          numCandidates: 50,
          limit: topK,
          filter: { userId: userId }
        }
      },
      {
        $project: {
          message: 1,
          response: 1,
          score: { $meta: "vectorSearchScore" },
          _id: 0
        }
      }
    ]);

    return results.map(r => ({
      message: r.message,
      response: r.response,
      score: r.score
    }));
    
  } catch (err) {
    console.error("Vector search error:", err.message);
    return [];
  }
}

/**
 * ===============================
 * OPTIMIZED CONTEXT RETRIEVAL
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

    // Get last 2 messages for recency
    const recentHistory = conversationHistory.slice(-2);

    // Get 2 most semantically relevant from vector search
    const relevantHistory = await retrieveRelevantContext(userId, message, 2);

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
    const result = await UserContext.findOneAndUpdate(
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
      { upsert: true, new: true }
    );

    const conversationId = result.conversationHistory.length;
    
    // Fire and forget - don't wait for vector storage
    storeConversationVector(userId, message, response, conversationId)
      .catch(err => console.error("Background vector storage failed:", err));

  } catch (e) {
    console.error("Context update failed", e);
  }
}

/**
 * ===============================
 * UTILITIES
 * ===============================
 */
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

    const seenMessages = new Set();
    const allContext = [...relevantHistory, ...recentHistory].filter(c => {
      const key = c.message?.substring(0, 50);
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
      botResponse = "Hmm.";
    }

    botResponse = removeAllEmojisAndEmoticons(botResponse.trim());

    await updateUserContext(userId, effectiveUserName, message, botResponse);

    res.json({ message: botResponse });

  } catch (err) {
    console.error("chatController critical failure:", err);
    res.status(500).json({ error: "Chat failed" });
  }
};

export { ConversationVector };
