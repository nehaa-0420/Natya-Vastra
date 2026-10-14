const express = require('express');
const cors = require('cors');
const fs = require('fs');

const { UPLOAD_DIR } = require('./lib/config');
const db = require('./db');
const { isMongoConnected } = require('./db/mongo');

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);

// CORS configuration supporting production Vercel frontend, local development, and preview deployments
if (process.env.NODE_ENV === 'production' && !process.env.CORS_ORIGIN) {
  console.warn('[Security] CORS_ORIGIN is not set: set this to your Vercel site domain (e.g. https://natya-vastra.vercel.app).');
}

const allowedOrigins = (process.env.CORS_ORIGIN || '*')
  .split(',')
  .map((s) => s.trim().replace(/\/+$/, ''))
  .filter(Boolean);

const corsOptions = {
  origin: (origin, callback) => {
    // Permit server-to-server, health check, mobile or curl requests with no origin header
    if (!origin) return callback(null, true);

    const cleanOrigin = origin.replace(/\/+$/, '');

    // Allow wildcard if configured
    if (allowedOrigins.includes('*') || allowedOrigins.includes(cleanOrigin)) {
      return callback(null, true);
    }

    // Always permit local development origins
    if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(cleanOrigin)) {
      return callback(null, true);
    }

    // Allow Vercel preview deployments if explicitly enabled
    if (process.env.ALLOW_VERCEL_PREVIEWS === 'true') {
      try {
        const parsed = new URL(cleanOrigin);
        if (parsed.hostname.endsWith('.vercel.app')) {
          return callback(null, true);
        }
      } catch {
        // Invalid URL format
      }
    }

    return callback(new Error(`Origin ${origin} is not allowed by CORS.`));
  },
  methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  credentials: false
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

app.use(express.json({ limit: '100kb' }));
app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '7d' }));

// Health check endpoint verifying database connectivity
app.get('/api/health', (req, res) => {
  let sqliteOk = false;
  try {
    const row = db.prepare('SELECT 1 as ok').get();
    sqliteOk = Boolean(row && row.ok === 1);
  } catch {
    sqliteOk = false;
  }

  const mongoConnected = isMongoConnected();
  const healthy = sqliteOk;

  res.status(healthy ? 200 : 503).json({
    status: healthy ? 'ok' : 'degraded',
    services: {
      database: sqliteOk ? 'connected' : 'error',
      documentStore: mongoConnected ? 'connected' : 'file_store'
    },
    timestamp: new Date().toISOString()
  });
});

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

// Safe centralized error middleware
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.message && err.message.includes('CORS')) {
    return res.status(403).json({ error: 'CORS request rejected: Origin not permitted.' });
  }
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Request body was not valid JSON.' });
  if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: 'That photo is too large (max 5 MB).' });
  if (err.message && (/Only JPG/.test(err.message) || /allowed/.test(err.message))) return res.status(400).json({ error: err.message });

  console.error('[Unhandled API Error]', err.message || err);
  res.status(500).json({ error: 'Something went wrong on our end.' });
});

module.exports = app;
