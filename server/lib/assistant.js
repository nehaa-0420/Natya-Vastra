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
- If you do not know something (delivery, policies), say so and point to WhatsApp (+91 99005 99872). Do not guess.
- For bookings & payments: Explain that online booking requests are submitted first for store review. Once confirmed by our administrator, the 50% deposit can be paid securely via Razorpay under 'My Account'. Never invent fake payment links or pretend payment has already succeeded.
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

  const isCustomApiUrl = Boolean(process.env.GEMINI_API_URL);
  const base = process.env.GEMINI_API_URL || 'https://generativelanguage.googleapis.com';
  const thinking = process.env.GEMINI_THINKING_LEVEL ?? 'low';

  // If a mock API is specified (e.g. in automated tests), test only the primary model.
  // Otherwise, use a resilient fallback sequence for high-demand / unavailable models.
  const primaryModel = process.env.GEMINI_MODEL || 'gemini-flash-lite-latest';
  const models = isCustomApiUrl
    ? [primaryModel]
    : [...new Set([primaryModel, 'gemini-flash-lite-latest', 'gemini-2.5-flash-lite', 'gemini-3.5-flash'])];

  let lastErr = null;
  for (const model of models) {
    try {
      const timeoutMs = isCustomApiUrl ? 25000 : 12000;
      const res = await fetch(`${base}/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
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
        signal: AbortSignal.timeout(timeoutMs)
      });

      if (!res.ok) {
        const detail = (await res.text().catch(() => '')).slice(0, 300);
        // If 503 (model experiencing high demand) or 404 (model retired) and we have fallbacks, try next
        if ((res.status === 503 || res.status === 404) && !isCustomApiUrl && model !== models[models.length - 1]) {
          console.warn(`[assistant] Model ${model} returned ${res.status}, attempting fallback model...`);
          continue;
        }
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
    } catch (err) {
      lastErr = err;
      if (err instanceof AssistantError && err.code === 'UPSTREAM' && !isCustomApiUrl) {
        // If this was an explicit upstream error that wasn't 503/404, we rethrow
        if (!err.message.includes('503') && !err.message.includes('404')) {
          throw err;
        }
      }
      // If timed out and we have another model candidate, try next
      if (err.name === 'TimeoutError' && !isCustomApiUrl && model !== models[models.length - 1]) {
        console.warn(`[assistant] Model ${model} timed out, attempting fallback model...`);
        continue;
      }
      if (isCustomApiUrl) {
        throw err instanceof AssistantError ? err : new AssistantError('UPSTREAM', `Could not reach the AI service: ${err.message}`);
      }
    }
  }

  throw lastErr instanceof AssistantError ? lastErr : new AssistantError('UPSTREAM', `Could not reach the AI service: ${lastErr?.message || 'Timeout'}`);
}

module.exports = { askAssistant, buildSystemPrompt, parseReply, AssistantError };
