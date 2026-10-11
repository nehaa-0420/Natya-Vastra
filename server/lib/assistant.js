const db = require('../db');
const { stockMap, serializeCostume, COSTUME_SELECT } = require('./serialize');

// The costumes the assistant is allowed to talk about, taken live from the database.
function catalogForPrompt() {
  const stocks = stockMap(db);
  const rows = db.prepare(`${COSTUME_SELECT} WHERE c.active = 1 ORDER BY cat.sort_order, c.sort_order, c.id`).all();
  return rows.map((r) => {
    const c = serializeCostume(r, stocks.get(r.id) || []);
    let sizes = 'on request';
    if (c.pooled) sizes = `any size from ${c.sizeMin} to ${c.sizeMax} inches`;
    else if (c.sizes.length) sizes = `${c.sizes.map((s) => s.size).join(', ')} inches`;
    return {
      id: c.id,
      title: c.name || `${c.categoryName} · Design ${c.designNo}`,
      category: c.categoryName,
      sizes,
      rentPerDay: c.rentPrice ?? 'price on request',
      bookableOnline: c.bookable
    };
  });
}

function buildSystemPrompt() {
  return `You are the costume assistant for Natya Vastra (Chiguru Costumes), a Bengaluru business that RENTS and sells Bharatanatyam and classical dance costumes.
Help customers choose a costume. Ask briefly about the dancer's size or age, the occasion (performance, exam, arangetram, class) and dates when that helps.

Rules:
- Recommend ONLY costumes from the CATALOG below, using their id. Never invent costumes, sizes, prices, discounts or availability.
- You cannot see what is booked. Live availability for dates is checked on each costume's page, so tell customers to pick their dates there.
- If a price is "price on request", say the price is shared on request on WhatsApp (+91 99005 99872). Do not guess prices.
- Saree Sets and the Devi costume are arranged personally, and practice sarees can be pre-ordered: send those customers to WhatsApp.
- If you do not know something (delivery, deposits, policies), say so and point to WhatsApp (+91 99005 99872). Do not guess.
- Keep replies warm, plain and short (2 to 4 sentences). Recommend at most 4 costumes.
- Reply with ONLY a JSON object, no other text: {"reply": "<message for the customer>", "costumeIds": [<ids from the catalog>]}. Use [] when you recommend nothing.

CATALOG:
${JSON.stringify(catalogForPrompt())}`;
}

// The model is asked for JSON, but fall back gracefully if it answers in plain text.
function parseReply(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start !== -1 && end > start) {
    try {
      const obj = JSON.parse(text.slice(start, end + 1));
      if (typeof obj.reply === 'string') {
        return { reply: obj.reply, costumeIds: Array.isArray(obj.costumeIds) ? obj.costumeIds : [] };
      }
    } catch { /* fall through */ }
  }
  return { reply: text.trim(), costumeIds: [] };
}

class AssistantError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

async function askAssistant(messages) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new AssistantError('NOT_CONFIGURED', 'The assistant is not set up.');

  const base = process.env.ANTHROPIC_API_URL || 'https://api.anthropic.com';
  let res;
  try {
    res = await fetch(`${base}/v1/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || 'claude-haiku-5-5',
        // Haiku 5.5 "thinks" by default and thinking tokens count toward max_tokens,
        // so a small limit can be used up before any answer text is written.
        max_tokens: 4000,
        output_config: { effort: process.env.ANTHROPIC_EFFORT || 'low' }, // low = fast and cheap, plenty for this chat
        system: buildSystemPrompt(),
        messages
      }),
      signal: AbortSignal.timeout(25000)
    });
  } catch (err) {
    throw new AssistantError('UPSTREAM', `Could not reach the AI service: ${err.message}`);
  }
  if (!res.ok) throw new AssistantError('UPSTREAM', `AI service returned ${res.status}`);

  const data = await res.json();
  const text = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
  if (!text) throw new AssistantError('UPSTREAM', `The AI service sent no text (stop_reason: ${data.stop_reason}).`);
  return parseReply(text);
}

module.exports = { askAssistant, buildSystemPrompt, parseReply, AssistantError };
