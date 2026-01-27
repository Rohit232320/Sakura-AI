import axios from "axios";
import { UserContext } from "../models/AiBotDbSchema.js";

/* =======================
   RATE LIMITING (CRITICAL)
======================= */
const userCooldown = new Map();
const COOLDOWN_MS = 6000; // 6 seconds

/* =======================
   MAIN CONTROLLER
======================= */
export const chatController = async (req, res) => {
  const { message, userName } = req.body;
  const userId = req.params.userId;

  if (!message) {
    return res.status(400).json({ error: "Message required" });
  }

  /* ---- Cooldown ---- */
  const now = Date.now();
  const lastCall = userCooldown.get(userId) || 0;
  if (now - lastCall < COOLDOWN_MS) {
    return res.json({ message: "Slow down 😏" });
  }
  userCooldown.set(userId, now);

  try {
    /* =======================
       LOAD USER CONTEXT
    ======================= */
    const userContext = await UserContext.findOne({ userId }).lean();
    const history = userContext?.conversationHistory || [];

    const effectiveUserName =
      userName ||
      userContext?.username ||
      "User";

    /* =======================
       LAST 2 MESSAGES ONLY
    ======================= */
    const recentHistory = history.slice(-2);

    let historyPrompt = "";
    for (const conv of recentHistory) {
      historyPrompt += `${effectiveUserName}: ${conv.message}\nYou: ${conv.response}\n`;
    }

    /* =======================
       SHORT PERSONA (TOKEN SAFE)
    ======================= */
    const persona = `
You are Sakura.
Personality: playful, flirty, sassy, human-like.
Rules:
- Short replies (1–3 sentences)
- Never mention being an AI
- Match user's tone (English / Hinglish)
- Remember recent messages
- No emojis
`;

    /* =======================
       FINAL PROMPT
    ======================= */
    const finalPrompt = `
${persona}

Conversation:
${historyPrompt}

${effectiveUserName}: ${message}
Sakura:
`;

    /* =======================
       GEMINI API CALL (ONCE)
    ======================= */
    const response = await axios.post(
      `${process.env.GEMINI_API_URL}?key=${process.env.GEMINI_API_KEY}`,
      {
        contents: [
          {
            parts: [{ text: finalPrompt }]
          }
        ]
      }
    );

    let botResponse =
      response.data?.candidates?.[0]?.content?.parts
        ?.map(p => p.text)
        .join(" ") || "Hmm.";

    /* =======================
       SAVE CONTEXT
    ======================= */
    await UserContext.findOneAndUpdate(
      { userId },
      {
        $set: {
          username: effectiveUserName,
          lastActive: new Date()
        },
        $push: {
          conversationHistory: {
            message,
            response: botResponse,
            timestamp: new Date()
          }
        }
      },
      { upsert: true }
    );

    /* ---- Trim history to last 20 ---- */
    await UserContext.updateOne(
      { userId },
      { $push: { conversationHistory: { $each: [], $slice: -20 } } }
    );

    return res.json({ message: botResponse });

  } catch (err) {
    /* =======================
       HARD STOP ON RATE LIMIT
    ======================= */
    if (err.response?.status === 429) {
      console.error("Gemini rate limit hit");
      return res.status(429).json({
        message: "I'm tired rn 😴 try again later"
      });
    }

    console.error("Chat error:", err.message);
    return res.status(500).json({
      error: "Failed to process chat"
    });
  }
};
