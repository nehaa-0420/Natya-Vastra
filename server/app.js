const express = require('express');
const cors = require('cors');
const fs = require('fs');

const { UPLOAD_DIR } = require('./lib/config');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);

if (process.env.NODE_ENV === 'production' && !process.env.CORS_ORIGIN) {
  console.warn('CORS_ORIGIN is not set: any website can call this API. Set it to your site address.');
}
const origins = (process.env.CORS_ORIGIN || '*').split(',').map((s) => s.trim());
app.use(cors({ origin: origins.includes('*') ? '*' : origins }));
app.use(express.json({ limit: '100kb' }));
app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '7d' }));

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/categories', require('./routes/categories'));
app.use('/api/costumes', require('./routes/costumes'));
app.use('/api/gallery', require('./routes/gallery'));
app.use('/api/enquiries', require('./routes/enquiries'));
app.use('/api/bookings', require('./routes/bookings'));
app.use('/api/payments', require('./routes/payments'));
app.use('/api/wishlist', require('./routes/wishlist'));
app.use('/api/assistant', require('./routes/assistant'));
app.use('/api/complaints', require('./routes/complaints'));
app.use('/api/damage-reports', require('./routes/damageReports'));
app.use('/api/admin', require('./routes/admin'));

app.use((req, res) => res.status(404).json({ error: 'Not found.' }));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Request body was not valid JSON.' });
  if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: 'That photo is too large (max 5 MB).' });
  if (err.message && (/Only JPG/.test(err.message) || /allowed/.test(err.message))) return res.status(400).json({ error: err.message });
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on our end.' });
});

module.exports = app;
