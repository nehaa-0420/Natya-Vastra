process.env.DB_PATH = ':memory:';
process.env.ADMIN_EMAIL = 'boss3@example.com';
process.env.ADMIN_PASSWORD = 'AdminPass123';
process.env.SMTP_HOST = 'smtp.fake.test';

const test = require('node:test');
const assert = require('node:assert/strict');

// Replace nodemailer with a fake that records what would have been sent.
const sent = [];
let failNext = false;
require.cache[require.resolve('nodemailer')] = {
  id: 'nodemailer', filename: 'nodemailer', loaded: true,
  exports: {
    createTransport: () => ({
      sendMail: async (msg) => {
        if (failNext) { failNext = false; throw new Error('SMTP down'); }
        sent.push(msg);
      }
    })
  }
};

const { db, inDays, makeCostume } = require('./helpers');
const { ensureAdmin } = require('../db/seed');
const app = require('../app');

let base, server;
test.before(async () => {
  ensureAdmin();
  server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => server.close());

async function call(method, path, { body, token } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { ...(body && { 'Content-Type': 'application/json' }), ...(token && { Authorization: `Bearer ${token}` }) },
    body: body ? JSON.stringify(body) : undefined
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}
const tick = () => new Promise((r) => setTimeout(r, 30)); // emails are sent in the background

test('customer gets emails when a booking is created, confirmed and cancelled', async () => {
  const costumeId = makeCostume({ stock: [{ size: 36, qty: 2 }], rentPrice: 400 });
  const reg = await call('POST', '/api/auth/register', { body: { name: 'Asha', email: 'asha.mail@example.com', password: 'password123' } });
  const admin = await call('POST', '/api/auth/login', { body: { email: 'boss3@example.com', password: 'AdminPass123' } });

  const made = await call('POST', '/api/bookings', { token: reg.json.token, body: { costumeId, size: 36, startDate: inDays(5), endDate: inDays(6) } });
  assert.equal(made.status, 201);
  await tick();
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, 'asha.mail@example.com');
  assert.match(sent[0].subject, /Booking request received/);
  assert.match(sent[0].text, /₹400/); // 50% deposit of 2 days x 400

  await call('PATCH', `/api/admin/bookings/${made.json.id}`, { token: admin.json.token, body: { status: 'confirmed' } });
  await tick();
  assert.match(sent[1].subject, /confirmed/);

  // setting the same status again must not send a second email
  await call('PATCH', `/api/admin/bookings/${made.json.id}`, { token: admin.json.token, body: { status: 'confirmed' } });
  await tick();
  assert.equal(sent.length, 2);

  await call('POST', `/api/bookings/${made.json.id}/cancel`, { token: reg.json.token });
  await tick();
  assert.match(sent[2].subject, /cancelled/);
});

test('a broken mail server never breaks a booking', async () => {
  const costumeId = makeCostume({ stock: [{ size: 36, qty: 1 }] });
  const reg = await call('POST', '/api/auth/register', { body: { name: 'Ravi', email: 'ravi.mail@example.com', password: 'password123' } });
  failNext = true;
  const made = await call('POST', '/api/bookings', { token: reg.json.token, body: { costumeId, size: 36, startDate: inDays(8), endDate: inDays(9) } });
  assert.equal(made.status, 201);
  await tick();
  assert.equal(db.prepare('SELECT COUNT(*) n FROM bookings WHERE id = ?').get(made.json.id).n, 1);
});

test('a priced costume reports its deposit as awaiting, an unpriced one does not', async () => {
  const priced = makeCostume({ stock: [{ size: 36, qty: 1 }], rentPrice: 300 });
  const free = makeCostume({ stock: [{ size: 36, qty: 1 }] });
  const reg = await call('POST', '/api/auth/register', { body: { name: 'Meena', email: 'meena.mail@example.com', password: 'password123' } });
  const a = await call('POST', '/api/bookings', { token: reg.json.token, body: { costumeId: priced, size: 36, startDate: inDays(20), endDate: inDays(21) } });
  const b = await call('POST', '/api/bookings', { token: reg.json.token, body: { costumeId: free, size: 36, startDate: inDays(20), endDate: inDays(21) } });
  assert.equal(a.json.depositStatus, 'awaiting');
  assert.equal(a.json.depositAmount, 300);
  assert.equal(b.json.depositStatus, 'not_required');
});
