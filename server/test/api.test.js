process.env.DB_PATH = ':memory:';
process.env.ADMIN_EMAIL = 'boss@example.com';
process.env.ADMIN_PASSWORD = 'AdminPass123';
const test = require('node:test');
const assert = require('node:assert/strict');
const { db, inDays, makeCostume } = require('./helpers');
const { ensureAdmin } = require('../db/seed');
const app = require('../app');

let base;
let server;
test.before(async () => {
  ensureAdmin();
  server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => server.close());

async function call(method, path, { body, token, form } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers['Content-Type'] = 'application/json';
  const res = await fetch(base + path, { method, headers, body: form || (body ? JSON.stringify(body) : undefined) });
  let json = null;
  try { json = await res.json(); } catch { /* not JSON */ }
  return { status: res.status, json };
}

const customer = { name: 'Asha', email: 'Asha@Example.com', phone: '+91 99999 11111', password: 'password123' };
let token;
let adminToken;
let costumeId;
let bookingId;

test('registration validates input, hashes the password and returns a token', async () => {
  assert.equal((await call('POST', '/api/auth/register', { body: { ...customer, password: 'short' } })).status, 400);
  assert.equal((await call('POST', '/api/auth/register', { body: { ...customer, email: 'nope' } })).status, 400);
  const ok = await call('POST', '/api/auth/register', { body: customer });
  assert.equal(ok.status, 201);
  assert.equal(ok.json.user.email, 'asha@example.com');
  assert.equal(ok.json.user.role, 'customer');
  assert.equal(ok.json.user.password_hash, undefined);
  token = ok.json.token;
  assert.equal((await call('POST', '/api/auth/register', { body: customer })).status, 409);
  const stored = db.prepare('SELECT password_hash FROM users WHERE email = ?').get('asha@example.com').password_hash;
  assert.ok(stored.startsWith('scrypt$') && !stored.includes('password123'));
});

test('login accepts the right password only; /me needs a token', async () => {
  assert.equal((await call('POST', '/api/auth/login', { body: { email: customer.email, password: 'wrongwrong' } })).status, 401);
  const ok = await call('POST', '/api/auth/login', { body: { email: customer.email, password: customer.password } });
  assert.equal(ok.status, 200);
  assert.equal((await call('GET', '/api/auth/me')).status, 401);
  assert.equal((await call('GET', '/api/auth/me', { token: ok.json.token })).json.user.name, 'Asha');
  const admin = await call('POST', '/api/auth/login', { body: { email: 'boss@example.com', password: 'AdminPass123' } });
  assert.equal(admin.json.user.role, 'admin');
  adminToken = admin.json.token;
});

test('search filters by text, category, size and date availability', async () => {
  db.prepare("INSERT INTO categories (id, name, description, accent_color, sort_order) VALUES ('sixpiece', 'Six Piece', 'd', '#000', 2)").run();
  costumeId = makeCostume({ stock: [{ size: 34, qty: 1 }, { size: 38, qty: 1 }], category: 'sixpiece' });
  makeCostume({ stock: [{ size: 0, qty: 3 }], sizeMin: 20, sizeMax: 26, category: 'test' });
  makeCostume({ stock: [], category: 'test' });

  assert.equal((await call('GET', '/api/costumes')).json.length, 3);
  assert.equal((await call('GET', '/api/costumes?q=six')).json.length, 1);
  assert.equal((await call('GET', '/api/costumes?category=test')).json.length, 2);
  assert.equal((await call('GET', '/api/costumes?size=38')).json.length, 1);   // exact stock size
  assert.equal((await call('GET', '/api/costumes?size=22')).json.length, 1);   // inside a pooled range
  assert.equal((await call('GET', '/api/costumes?size=99')).json.length, 0);
  const free = await call('GET', `/api/costumes?from=${inDays(5)}&to=${inDays(6)}`);
  assert.equal(free.json.length, 2); // the costume with no stock is not bookable
  assert.equal((await call('GET', '/api/costumes?from=2001-01-01&to=2001-01-02')).status, 400);
});

test('booking needs a login, then reserves stock and blocks double booking', async () => {
  const dates = { startDate: inDays(5), endDate: inDays(7) };
  assert.equal((await call('POST', '/api/bookings', { body: { costumeId, size: 38, ...dates } })).status, 401);

  const made = await call('POST', '/api/bookings', { token, body: { costumeId, size: 38, ...dates, notes: 'Arangetram' } });
  assert.equal(made.status, 201);
  assert.equal(made.json.status, 'pending');
  assert.equal(made.json.days, 3);
  bookingId = made.json.id;

  const clash = await call('POST', '/api/bookings', { token, body: { costumeId, size: 38, startDate: inDays(6), endDate: inDays(9) } });
  assert.equal(clash.status, 409);

  const avail = await call('GET', `/api/costumes/${costumeId}/availability?start=${inDays(5)}&end=${inDays(7)}`);
  assert.deepEqual(avail.json.map((a) => [a.size, a.remaining]), [[34, 1], [38, 0]]);

  const mine = await call('GET', '/api/bookings/mine', { token });
  assert.equal(mine.json.length, 1);
});

test('a customer can cancel only their own booking', async () => {
  const other = await call('POST', '/api/auth/register', { body: { name: 'Ravi', email: 'ravi@example.com', password: 'password123' } });
  assert.equal((await call('POST', `/api/bookings/${bookingId}/cancel`, { token: other.json.token })).status, 404);
  const cancelled = await call('POST', `/api/bookings/${bookingId}/cancel`, { token });
  assert.equal(cancelled.json.status, 'cancelled');
  assert.equal((await call('POST', `/api/bookings/${bookingId}/cancel`, { token })).status, 400);
});

test('wishlist add, list and remove', async () => {
  assert.equal((await call('GET', '/api/wishlist')).status, 401);
  assert.equal((await call('POST', `/api/wishlist/${costumeId}`, { token })).status, 201);
  assert.equal((await call('POST', `/api/wishlist/${costumeId}`, { token })).status, 201); // idempotent
  assert.equal((await call('GET', '/api/wishlist', { token })).json.length, 1);
  await call('DELETE', `/api/wishlist/${costumeId}`, { token });
  assert.equal((await call('GET', '/api/wishlist', { token })).json.length, 0);
  assert.equal((await call('POST', '/api/wishlist/9999', { token })).status, 404);
});

test('admin routes reject visitors and customers', async () => {
  for (const path of ['/api/admin/stats', '/api/admin/bookings', '/api/admin/costumes', '/api/admin/enquiries']) {
    assert.equal((await call('GET', path)).status, 401, path);
    assert.equal((await call('GET', path, { token })).status, 403, path);
    assert.equal((await call('GET', path, { token: adminToken })).status, 200, path);
  }
});

test('admin can confirm bookings, and re-opening a taken slot is refused', async () => {
  const dates = { startDate: inDays(10), endDate: inDays(12) };
  const a = await call('POST', '/api/bookings', { token, body: { costumeId, size: 34, ...dates } });
  assert.equal((await call('PATCH', `/api/admin/bookings/${a.json.id}`, { token: adminToken, body: { status: 'confirmed' } })).json.status, 'confirmed');
  assert.equal((await call('PATCH', `/api/admin/bookings/${a.json.id}`, { token: adminToken, body: { status: 'nonsense' } })).status, 400);

  await call('PATCH', `/api/admin/bookings/${a.json.id}`, { token: adminToken, body: { status: 'cancelled' } });
  const b = await call('POST', '/api/bookings', { token, body: { costumeId, size: 34, ...dates } });
  assert.equal(b.status, 201); // the cancelled one freed the piece
  const reopen = await call('PATCH', `/api/admin/bookings/${a.json.id}`, { token: adminToken, body: { status: 'confirmed' } });
  assert.equal(reopen.status, 409);

  const list = await call('GET', '/api/admin/bookings?status=pending', { token: adminToken });
  assert.ok(list.json.every((x) => x.status === 'pending' && x.user.email));
});

test('enquiries can be sent by anyone but only read by admin', async () => {
  const sent = await call('POST', '/api/enquiries', { body: { name: 'Meera', phone: '99999', costume_type: 'Saree Sets' } });
  assert.equal(sent.status, 201);
  assert.equal((await call('POST', '/api/enquiries', { body: { name: 'No phone' } })).status, 400);
  assert.equal((await call('GET', '/api/enquiries')).status, 404); // listing is no longer public
  const list = await call('GET', '/api/admin/enquiries', { token: adminToken });
  assert.equal(list.json[0].name, 'Meera');
});

test('admin can add a costume with a photo and edit its stock and price', async () => {
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  const form = new FormData();
  form.append('image', new Blob([png], { type: 'image/png' }), 'new.png');
  form.append('categoryId', 'sixpiece');
  form.append('name', 'Peacock Blue');
  form.append('rentPrice', '450');
  form.append('sizes', JSON.stringify([{ size: 36, qty: 2 }, { size: 38, qty: 1 }]));
  const created = await call('POST', '/api/admin/costumes', { token: adminToken, form });
  assert.equal(created.status, 201);
  assert.equal(created.json.name, 'Peacock Blue');
  assert.equal(created.json.rentPrice, 450);
  assert.deepEqual(created.json.sizes, [{ size: 36, count: 2 }, { size: 38, count: 1 }]);
  assert.equal((await fetch(base + created.json.src)).status, 200);

  const edited = await call('PUT', `/api/admin/costumes/${created.json.id}`, {
    token: adminToken, body: { rentPrice: 500, sizes: [{ size: 36, qty: 5 }] }
  });
  assert.equal(edited.json.rentPrice, 500);
  assert.equal(edited.json.total, 5);

  const hidden = await call('PUT', `/api/admin/costumes/${created.json.id}`, { token: adminToken, body: { active: false } });
  assert.equal(hidden.json.active, false);
  assert.equal((await call('GET', `/api/costumes/${created.json.id}`)).status, 404);

  const bad = new FormData();
  bad.append('image', new Blob(['not an image'], { type: 'text/plain' }), 'x.txt');
  bad.append('categoryId', 'sixpiece');
  assert.equal((await call('POST', '/api/admin/costumes', { token: adminToken, form: bad })).status, 400);
});
