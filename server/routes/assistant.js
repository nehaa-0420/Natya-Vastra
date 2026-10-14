const express = require('express');
const db = require('../db');
const { rateLimit } = require('../middleware/rateLimit');
const { readUser } = require('../middleware/auth');
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
    const user = readUser(req);
    let payableBooking = null;
    if (user) {
      try {
        const row = db.prepare(`
          SELECT b.id, b.rental_price, b.start_date, b.end_date, c.name, c.rent_price, cat.name as category_name
          FROM bookings b
          JOIN costumes c ON c.id = b.costume_id
          JOIN categories cat ON cat.id = c.category_id
          WHERE b.user_id = ? AND b.status = 'confirmed' AND b.deposit_status != 'paid'
          ORDER BY b.id DESC LIMIT 1
        `).get(user.id);
        if (row) {
          const depositAmount = row.rental_price
            ? Math.ceil(row.rental_price / 2)
            : (row.rent_price ? Math.ceil(row.rent_price / 2) : 325);
          payableBooking = {
            id: row.id,
            title: row.name || `${row.category_name} Costume`,
            dates: `${row.start_date} to ${row.end_date}`,
            depositAmount
          };
        }
      } catch (e) {
        console.warn('[assistant] User booking lookup error:', e.message);
      }
    }

    res.json({ reply: out.reply.slice(0, 1500), costumes, payableBooking });
  } catch (err) {
    if (err.code === 'NOT_CONFIGURED') {
      return res.status(503).json({ error: 'The assistant is not available yet. Please message us on WhatsApp.' });
    }
    console.error('[assistant]', err.message);
    const userMessage = err.message.includes('429') || err.message.includes('quota')
      ? 'The AI assistant has reached its rate limit. Please try again in a moment, or message us on WhatsApp.'
      : (err.message.includes('timeout')
        ? 'The AI assistant took too long to respond. Please try asking again with a shorter message.'
        : 'The assistant is currently busy. Please try again in a moment, or message us on WhatsApp.');
    res.status(502).json({ error: userMessage });
  }
});

module.exports = router;
