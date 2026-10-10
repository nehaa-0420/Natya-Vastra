process.env.DB_PATH = ':memory:';
process.env.NODE_ENV = 'production';
process.env.JWT_SECRET = 'a-long-random-test-secret';
delete process.env.ADMIN_PASSWORD;
const test = require('node:test');
const assert = require('node:assert/strict');
const { ensureAdmin } = require('../db/seed');

test('in production the admin is never created with the default password', () => {
  assert.throws(() => ensureAdmin(), /ADMIN_PASSWORD/);
  process.env.ADMIN_PASSWORD = 'a-strong-password-123';
  process.env.ADMIN_EMAIL = 'owner@example.com';
  assert.equal(ensureAdmin().email, 'owner@example.com');
});
