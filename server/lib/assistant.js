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
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new AssistantError('NOT_CONFIGURED', 'The assistant is not set up.');

  const model = process.env.GEMINI_MODEL || 'gemini-3.6-flash';
  const base = process.env.GEMINI_API_URL || 'https://generativelanguage.googleapis.com';
  // Gemini 3 models "think" by default and thinking tokens use up the output limit,
  // so keep thinking low and leave plenty of room. Set GEMINI_THINKING_LEVEL= (empty) to omit it.
  const thinking = process.env.GEMINI_THINKING_LEVEL ?? 'low';

  let res;
  try {
    res = await fetch(`${base}/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: buildSystemPrompt() }] },
        contents: messages.map((m) => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }]
        })),
        generationConfig: {
          responseMimeType: 'application/json',
          maxOutputTokens: 4000,
          ...(thinking && { thinkingConfig: { thinkingLevel: thinking } })
        }
      }),
      signal: AbortSignal.timeout(25000)
    });
  } catch (err) {
    throw new AssistantError('UPSTREAM', `Could not reach the AI service: ${err.message}`);
  }
  if (!res.ok) {
    const detail = (await res.text().catch(() => '')).slice(0, 300);
    throw new AssistantError('UPSTREAM', `AI service returned ${res.status}: ${detail}`);
  }

  const data = await res.json();
  const candidate = data.candidates?.[0];
  const text = (candidate?.content?.parts || []).filter((p) => p.text && !p.thought).map((p) => p.text).join('');
  if (!text) {
    const why = candidate?.finishReason || data.promptFeedback?.blockReason || 'unknown reason';
    throw new AssistantError('UPSTREAM', `The AI service sent no text (${why}).`);
  }
  return parseReply(text);
}

module.exports = { askAssistant, buildSystemPrompt, parseReply, AssistantError };
