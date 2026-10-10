const express = require('express');
const db = require('../db');
const { rateLimit } = require('../middleware/rateLimit');
const { askAssistant } = require('../lib/assistant');
const { stockMap, serializeCostume, COSTUME_SELECT } = require('../lib/serialize');

const router = express.Router();
const limiter = rateLimit({ windowMs: 10 * 60 * 1000, max: 30 });

function validMessages(messages) {
  if (!Array.isArray(messages) || messages.length < 1 || messages.length > 20) return false;
  const shape = messages.every((m) => m && ['user', 'assistant'].includes(m.role)
    && typeof m.content === 'string' && m.content.trim() && m.content.length <= 1000);
  return shape && messages[0].role === 'user' && messages[messages.length - 1].role === 'user';
}

// POST /api/assistant   body: { messages: [{ role: 'user' | 'assistant', content }] }
router.post('/', limiter, async (req, res) => {
  const { messages } = req.body;
  if (!validMessages(messages)) {
    return res.status(400).json({ error: 'Please send a short question to the assistant.' });
  }
  try {
    const out = await askAssistant(messages.map((m) => ({ role: m.role, content: m.content.trim() })));

    // Only costumes that really exist (and are listed) can be shown, whatever the model says.
    const ids = [...new Set(out.costumeIds.map(Number))].filter(Number.isInteger).slice(0, 4);
    const stocks = stockMap(db);
    const costumes = ids
      .map((id) => db.prepare(`${COSTUME_SELECT} WHERE c.id = ? AND c.active = 1`).get(id))
      .filter(Boolean)
      .map((row) => serializeCostume(row, stocks.get(row.id) || []));

    res.json({ reply: out.reply.slice(0, 1500), costumes });
  } catch (err) {
    if (err.code === 'NOT_CONFIGURED') {
      return res.status(503).json({ error: 'The assistant is not available yet. Please message us on WhatsApp.' });
    }
    console.error('[assistant]', err.message);
    res.status(502).json({ error: 'The assistant is busy right now. Please try again, or message us on WhatsApp.' });
  }
});

module.exports = router;
