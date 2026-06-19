/**
 * Chat controller — translates HTTP <-> the AI service.
 * Keeps all request/response handling out of the service layer.
 */
const { generateAIResponse } = require('../services/ai-service');

const MAX_MESSAGE_LENGTH = 2000;

async function handleChat(req, res) {
  const body = req.body || {};
  const message = String(body.message || '').trim();
  const history = Array.isArray(body.history) ? body.history : [];

  if (!message) {
    return res.status(400).json({ error: 'Message is required.' });
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    return res.status(413).json({ error: 'Message too long.' });
  }

  try {
    const { reply, suggestions, cards } = await generateAIResponse(message, history);
    return res.json({
      reply,
      suggestions: suggestions || [],
      cards: cards || [],
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[nabih-chat] generation failed:', err.message);
    return res.status(502).json({
      error: 'تعذّر الوصول للمساعد حالياً، يرجى المحاولة لاحقاً.',
    });
  }
}

module.exports = { handleChat };
