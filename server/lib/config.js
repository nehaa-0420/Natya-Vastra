const path = require('path');
const fs = require('fs');

/**
 * Safely probe whether a directory exists and can be written to.
 * Returns true if writable, false if permissions fail (e.g. unmounted /var/data).
 */
function ensureDirWritable(dirPath) {
  try {
    fs.mkdirSync(dirPath, { recursive: true });
    const probe = path.join(dirPath, `.probe-${Date.now()}`);
    fs.writeFileSync(probe, 'ok');
    fs.unlinkSync(probe);
    return true;
  } catch {
    return false;
  }
}

function resolveDbPath() {
  const envPath = process.env.DATABASE_PATH || process.env.DB_PATH;
  const fallback = path.join(__dirname, '..', 'db', 'natya_vastra.db');

  if (!envPath) return fallback;
  if (envPath === ':memory:') return ':memory:';

  const dir = path.dirname(path.resolve(envPath));
  if (ensureDirWritable(dir)) {
    return envPath;
  }

  console.warn(`[Storage Warning] Configured database path (${envPath}) is not writable. Falling back to local project storage: ${fallback}`);
  try {
    fs.mkdirSync(path.dirname(fallback), { recursive: true });
  } catch {
    // fallback directory creation
  }
  return fallback;
}

function resolveUploadDir() {
  const envPath = process.env.UPLOAD_DIR;
  const fallback = path.join(__dirname, '..', 'uploads');

  if (!envPath) {
    try { fs.mkdirSync(fallback, { recursive: true }); } catch { /* fallback */ }
    return fallback;
  }

  const dir = path.resolve(envPath);
  if (ensureDirWritable(dir)) {
    return envPath;
  }

  console.warn(`[Storage Warning] Configured upload directory (${envPath}) is not writable. Falling back to local project storage: ${fallback}`);
  try { fs.mkdirSync(fallback, { recursive: true }); } catch { /* fallback */ }
  return fallback;
}

function resolveMongoDataFile(resolvedDbPath) {
  const envPath = process.env.MONGO_DATA_FILE;
  const fallback = path.join(__dirname, '..', 'db', 'mongo_data.json');

  if (envPath) {
    const dir = path.dirname(path.resolve(envPath));
    if (ensureDirWritable(dir)) return envPath;
  }

  if (resolvedDbPath && resolvedDbPath !== ':memory:' && path.isAbsolute(resolvedDbPath)) {
    const candidate = path.join(path.dirname(resolvedDbPath), 'mongo_data.json');
    if (ensureDirWritable(path.dirname(candidate))) return candidate;
  }

  try { fs.mkdirSync(path.dirname(fallback), { recursive: true }); } catch { /* fallback */ }
  return fallback;
}

const DB_PATH = resolveDbPath();
const UPLOAD_DIR = resolveUploadDir();
const MONGO_DATA_FILE = resolveMongoDataFile(DB_PATH);

module.exports = {
  DB_PATH,
  UPLOAD_DIR,
  MONGO_DATA_FILE
};
