process.env.DB_PATH = ':memory:';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { makeCostume } = require('./helpers');
const app = require('../app');

// A tiny fake of the Gemini API so tests never need a real key or internet.
let mode = 'ok';
let lastRequest = null;
let costumeId;
const gemini = (text, extra = {}) => ({ candidates: [{ content: { role: 'model', parts: [{ text }] }, finishReason: 'STOP', ...extra }] });
const fakeAI = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    lastRequest = { url: req.url, headers: req.headers, body: JSON.parse(body) };
    if (mode === 'error') { res.writeHead(429); return res.end('{"error":{"message":"quota"}}'); }
    const replies = {
      ok: gemini(JSON.stringify({ reply: 'Try this one for an arangetram.', costumeIds: [costumeId, 99999, costumeId] })),
      fenced: gemini('```json\n' + JSON.stringify({ reply: 'Fenced reply', costumeIds: [costumeId] }) + '\n```'),
      plain: gemini('Just plain words, no JSON.'),
      thought: { candidates: [{ content: { parts: [{ text: 'internal reasoning', thought: true }, { text: JSON.stringify({ reply: 'After thinking', costumeIds: [] }) }] } }] },
      blocked: { promptFeedback: { blockReason: 'SAFETY' } }
    };
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(replies[mode]));
  });
});

let server, base;
test.before(async () => {
  costumeId = makeCostume({ stock: [{ size: 36, qty: 2 }], rentPrice: 450 });
  await new Promise((r) => fakeAI.listen(0, r));
  process.env.GEMINI_API_URL = `http://127.0.0.1:${fakeAI.address().port}`;
  process.env.GEMINI_API_KEY = 'test-gemini-key';
  server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => { server.close(); fakeAI.close(); });

const ask = (messages) => fetch(`${base}/api/assistant`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages })
}).then(async (r) => ({ status: r.status, json: await r.json() }));
const user = (content) => ({ role: 'user', content });

test('returns the reply plus only real, de-duplicated costumes', async () => {
  mode = 'ok';
  const r = await ask([user('I need a costume for an arangetram, size 36')]);
  assert.equal(r.status, 200);
  assert.equal(r.json.reply, 'Try this one for an arangetram.');
  assert.deepEqual(r.json.costumes.map((c) => c.id), [costumeId]); // 99999 and the duplicate are dropped
  assert.equal(r.json.costumes[0].rentPrice, 450);
});

test('calls the Gemini endpoint with the key, JSON mode, low thinking and a prompt grounded in the real catalog', async () => {
  mode = 'ok';
  await ask([user('hello'), { role: 'assistant', content: 'Namaste' }, user('size 36 please')]);
  assert.match(lastRequest.url, /^\/v1beta\/models\/gemini-[\w.-]+:generateContent$/);
  assert.equal(lastRequest.headers['x-goog-api-key'], 'test-gemini-key');
  const { generationConfig, systemInstruction, contents } = lastRequest.body;
  assert.equal(generationConfig.responseMimeType, 'application/json');
  assert.ok(generationConfig.maxOutputTokens >= 2000);             // room for thinking tokens as well as the answer
  assert.deepEqual(generationConfig.thinkingConfig, { thinkingLevel: 'low' });
  assert.deepEqual(contents.map((c) => c.role), ['user', 'model', 'user']); // "assistant" becomes "model"
  const system = systemInstruction.parts[0].text;
  assert.match(system, /Never invent/);
  assert.match(system, new RegExp(`"id":${costumeId}`));
  assert.match(system, /"rentPerDay":450/);
});

test('copes with fenced JSON, plain text, and thinking parts', async () => {
  mode = 'fenced';
  assert.equal((await ask([user('hi')])).json.reply, 'Fenced reply');
  mode = 'plain';
  const plain = await ask([user('hi')]);
  assert.equal(plain.json.reply, 'Just plain words, no JSON.');
  assert.deepEqual(plain.json.costumes, []);
  mode = 'thought';
  assert.equal((await ask([user('hi')])).json.reply, 'After thinking'); // the "thought" part is never shown
});

test('rejects malformed conversations', async () => {
  assert.equal((await ask([])).status, 400);
  assert.equal((await ask([{ role: 'system', content: 'x' }])).status, 400);
  assert.equal((await ask([{ role: 'assistant', content: 'hi' }])).status, 400);
  assert.equal((await ask([user('x'.repeat(1001))])).status, 400);
  assert.equal((await ask([user('  ')])).status, 400);
});

test('quota errors and blocked answers give a friendly 502, a missing key a 503', async () => {
  mode = 'error';
  assert.equal((await ask([user('hi')])).status, 502);
  mode = 'blocked';
  assert.equal((await ask([user('hi')])).status, 502);
  const key = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  assert.equal((await ask([user('hi')])).status, 503);
  process.env.GEMINI_API_KEY = key;
});
