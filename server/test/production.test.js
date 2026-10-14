process.env.DB_PATH = ':memory:';
process.env.NODE_ENV = 'production';
process.env.JWT_SECRET = 'a-long-random-test-secret';
delete process.env.ADMIN_PASSWORD;
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const app = require('../app');
const { ensureAdmin } = require('../db/seed');

test('in production the admin is never created with the default password', () => {
  assert.throws(() => ensureAdmin(), /ADMIN_PASSWORD/);
  process.env.ADMIN_PASSWORD = 'a-strong-password-123';
  process.env.ADMIN_EMAIL = 'owner@example.com';
  assert.equal(ensureAdmin().email, 'owner@example.com');
});

test('health endpoint returns 200 and operational database status', async () => {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/health`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, 'ok');
    assert.equal(body.services.database, 'connected');
    assert.ok(body.timestamp);
    // Ensure no secrets or filesystem paths are leaked
    const raw = JSON.stringify(body);
    assert.ok(!raw.includes('password'));
    assert.ok(!raw.includes('secret'));
    assert.ok(!raw.includes('natya_vastra.db'));
  } finally {
    server.close();
  }
});
