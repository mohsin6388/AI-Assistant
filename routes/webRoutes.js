const express = require("express");
const businessConfig = require("../config/businessConfig");
const { getAIReply, extractLead } = require("../services/aiService");
const { getOrCreateConversation } = require("../models/conversations");
const { addMessage } = require("../models/messages");
const { createLead } = require("../models/leads");

const router = express.Router();

// In-memory conversation history per sessionId (mirrors utils/sessions.js pattern)
const webSessions = new Map();
function getMessages(sessionId) {
  if (!webSessions.has(sessionId)) webSessions.set(sessionId, []);
  return webSessions.get(sessionId);
}

// POST /web/start  { sessionId }
// Creates the conversation row and returns the greeting to speak first.
router.post("/start", async (req, res) => {
  try {
    const { sessionId } = req.body;
    if (!sessionId) return res.status(400).json({ error: "sessionId is required" });

    await getOrCreateConversation(sessionId);

    const messages = getMessages(sessionId);
    messages.push({ role: "assistant", content: businessConfig.greeting });

    await logTurn(sessionId, "assistant", businessConfig.greeting);

    res.json({ reply: businessConfig.greeting });
  } catch (err) {
    console.error("[/web/start] error:", err);
    res.status(500).json({ error: err.message });
  }
});

async function logTurn(sessionId, role, text) {
  const conversationId = await getOrCreateConversation(sessionId);
  await addMessage(conversationId, role, text);
}

// POST /web/chat  { sessionId, message }
// message = the text the browser's speech recognition transcribed from the mic.
router.post("/chat", async (req, res) => {
  try {
    const { sessionId, message } = req.body;
    if (!sessionId || !message) {
      return res.status(400).json({ error: "sessionId and message are required" });
    }

    const messages = getMessages(sessionId);
    messages.push({ role: "user", content: message });
    await logTurn(sessionId, "user", message);

    const rawReply = await getAIReply(messages);
    const { speech, lead } = extractLead(rawReply);

    messages.push({ role: "assistant", content: speech });
    await logTurn(sessionId, "assistant", speech);

    let leadCaptured = false;
    if (lead) {
      await createLead(lead);
      leadCaptured = true;
    }

    res.json({ reply: speech, leadCaptured });
  } catch (err) {
    console.error("[/web/chat] error:", err);
    res.status(500).json({ error: "AI service error. Check server logs (likely GROQ_API_KEY)." });
  }
});

module.exports = router;
