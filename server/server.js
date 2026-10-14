require('dotenv').config();
const app = require('./app');
const { seedIfEmpty, ensureAdmin } = require('./db/seed');
const { connectMongo } = require('./db/mongo');
const { DB_PATH, UPLOAD_DIR } = require('./lib/config');

async function startServer() {
  console.log('==================================================');
  console.log('   Natya Vastra Full-Stack API Server Starting   ');
  console.log('==================================================');
  console.log(`Node.js Version  : ${process.version}`);
  console.log(`Environment      : ${process.env.NODE_ENV || 'development'}`);
  console.log(`Primary Database : ${DB_PATH}`);
  console.log(`Uploads Directory: ${UPLOAD_DIR}`);

  // Seed catalog if empty (first run on a new database)
  try {
    seedIfEmpty();
  } catch (err) {
    console.error('[Startup Warning] Catalog seed check note:', err.message);
  }

  // Ensure admin account exists
  try {
    const admin = ensureAdmin();
    if (admin) {
      console.log(`[Admin] Initialized admin account: ${admin.email}`);
      if (admin.usingDefaultPassword && process.env.NODE_ENV !== 'production') {
        console.warn('  [Notice] Using default admin credentials in development.');
      }
    }
  } catch (err) {
    console.error(`[Admin Configuration Error] ${err.message}`);
    if (process.env.NODE_ENV === 'production') {
      console.error('FATAL: Production start aborted due to missing ADMIN_PASSWORD.');
      process.exit(1);
    }
  }

  // Production check for JWT secret security
  if (process.env.NODE_ENV === 'production') {
    if (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'change-me-to-a-long-random-string') {
      console.error('FATAL: JWT_SECRET must be set to a secure random string in production.');
      process.exit(1);
    }
  }

  // Connect to MongoDB if URI is provided
  if (process.env.MONGODB_URI) {
    await connectMongo(process.env.MONGODB_URI).catch((e) => {
      console.warn('[MongoDB] Initial connection note:', e.message);
    });
  } else if (process.env.NODE_ENV === 'production') {
    console.warn('[MongoDB] Notice: MONGODB_URI not provided. Running document store on persistent disk fallback.');
  }

  const PORT = process.env.PORT || 4000;
  const HOST = process.env.HOST || '0.0.0.0';

  const server = app.listen(PORT, HOST, () => {
    console.log(`Natya Vastra API listening on http://${HOST}:${PORT}`);
    console.log(`Health endpoint: http://${HOST}:${PORT}/api/health`);
    console.log('Server is ready to accept requests.');
  });

  const shutdown = (signal) => {
    console.log(`Received ${signal}. Gracefully stopping server...`);
    server.close(() => {
      console.log('Natya Vastra API stopped.');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

startServer().catch((err) => {
  console.error('[Fatal Server Startup Error]', err);
  process.exit(1);
});
