require('dotenv').config();
const app = require('./app');
const { seedIfEmpty, ensureAdmin } = require('./db/seed');

seedIfEmpty(); // first run: load the catalog automatically
const admin = ensureAdmin();
if (admin) {
  console.log(`Created admin account: ${admin.email}`);
  if (admin.usingDefaultPassword) console.warn('  Using the default admin password. Set ADMIN_PASSWORD in .env and delete the database to change it.');
}

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Natya Vastra API running on http://localhost:${PORT}`));
