import axios from "axios";
import OpenAI from "openai";
import { UserContext } from "../models/AiBotDbSchema.js";

/* =======================
   OPENAI CLIENT
======================= */
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

/* =======================
   RATE LIMITING
======================= */
const userCooldown = new Map();
const COOLDOWN_MS = 6000;

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
       PERSONA
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

    const finalPrompt = `
${persona}

Conversation:
${historyPrompt}

${effectiveUserName}: ${message}
Sakura:
`;

    /* =======================
       TRY GEMINI FIRST
    ======================= */
    let botResponse;

    try {
      const geminiResponse = await axios.post(
        `${process.env.GEMINI_API_URL}?key=${process.env.GEMINI_API_KEY}`,
        {
          contents: [
            {
              parts: [{ text: finalPrompt }]
            }
          ]
        }
      );

      botResponse =
        geminiResponse.data?.candidates?.[0]?.content?.parts
          ?.map(p => p.text)
          .join(" ");

    } catch (err) {
      /* =======================
         GEMINI FAILED → OPENAI
      ======================= */
      if (err.response?.status === 429) {
        console.warn("Gemini rate limit hit → falling back to OpenAI");
      } else {
        console.warn("Gemini error → falling back to OpenAI");
      }

      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: persona
          },
          {
            role: "user",
            content: `
Conversation:
${historyPrompt}

${effectiveUserName}: ${message}
`
          }
        ],
        max_tokens: 150
      });

      botResponse = completion.choices[0].message.content;
    }

    if (!botResponse) botResponse = "Hmm.";

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

    /* ---- Trim history ---- */
    await UserContext.updateOne(
      { userId },
      { $push: { conversationHistory: { $each: [], $slice: -20 } } }
    );

    return res.json({ message: botResponse });

  } catch (err) {
    console.error("Chat error:", err.message);
    return res.status(500).json({
      error: "Failed to process chat"
    });
  }
};
