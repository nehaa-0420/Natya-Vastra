const jwt = require('jsonwebtoken');
const db = require('../db');

const isProd = process.env.NODE_ENV === 'production';
if (isProd && !process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET must be set in production.');
}
const SECRET = process.env.JWT_SECRET || 'dev-only-secret-change-me';

const signToken = (user) => jwt.sign({ sub: user.id, role: user.role }, SECRET, { expiresIn: '7d' });

const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email, phone: u.phone, role: u.role });

function readUser(req) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return null;
  try {
    const payload = jwt.verify(header.slice(7), SECRET);
    // Load from the database so deleted users or changed roles take effect immediately.
    return db.prepare('SELECT * FROM users WHERE id = ?').get(payload.sub) || null;
  } catch {
    return null;
  }
}

function requireAuth(req, res, next) {
  const user = readUser(req);
  if (!user) return res.status(401).json({ error: 'Please log in to continue.' });
  req.user = user;
  next();
}

function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access only.' });
    next();
  });
}

module.exports = { signToken, publicUser, requireAuth, requireAdmin };
