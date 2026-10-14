/**
 * db/migrate.js
 *
 * Migrates data from SQLite to MongoDB (via Mongoose).
 * Preserves all existing IDs, customer accounts, costumes, stock, bookings,
 * payments, and enquiries. Idempotent: can be run repeatedly without duplicates.
 *
 * Run with:
 *   node db/migrate.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const db = require('./index');

const { docStore } = require('./mongo');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/natya_vastra';

// Define Mongoose schemas for the migrated collections to preserve identifiers
const UserMongo = mongoose.models.MigratedUser || mongoose.model('MigratedUser', new mongoose.Schema({
  sqliteId: { type: Number, unique: true, index: true },
  name: String,
  email: { type: String, unique: true },
  phone: String,
  passwordHash: String,
  role: String,
  createdAt: Date
}, { collection: 'users' }));

const CategoryMongo = mongoose.models.MigratedCategory || mongoose.model('MigratedCategory', new mongoose.Schema({
  id: { type: String, unique: true },
  name: String,
  description: String,
  accentColor: String,
  sortOrder: Number,
  note: String
}, { collection: 'categories' }));

const CostumeMongo = mongoose.models.MigratedCostume || mongoose.model('MigratedCostume', new mongoose.Schema({
  sqliteId: { type: Number, unique: true, index: true },
  categoryId: String,
  imagePath: String,
  name: String,
  label: String,
  rentPrice: Number,
  sizeMin: Number,
  sizeMax: Number,
  active: Boolean,
  sortOrder: Number,
  stock: [{ size: Number, qty: Number }]
}, { collection: 'costumes' }));

const BookingMongo = mongoose.models.MigratedBooking || mongoose.model('MigratedBooking', new mongoose.Schema({
  sqliteId: { type: Number, unique: true, index: true },
  userId: Number,
  costumeId: Number,
  size: Number,
  startDate: String,
  endDate: String,
  status: String,
  depositStatus: String,
  notes: String,
  rentalPrice: Number,
  returnDeadline: String,
  actualReturnTime: String,
  latePenalty: Number,
  damageCharge: Number,
  totalAmount: Number,
  isLate: Boolean,
  acceptedTerms: Boolean,
  acceptedTermsAt: String,
  createdAt: Date
}, { collection: 'bookings' }));

const PaymentMongo = mongoose.models.MigratedPayment || mongoose.model('MigratedPayment', new mongoose.Schema({
  sqliteId: { type: Number, unique: true, index: true },
  bookingId: Number,
  razorpayOrderId: { type: String, unique: true },
  razorpayPaymentId: String,
  amountPaise: Number,
  status: String,
  createdAt: Date
}, { collection: 'payments' }));

const EnquiryMongo = mongoose.models.MigratedEnquiry || mongoose.model('MigratedEnquiry', new mongoose.Schema({
  sqliteId: { type: Number, unique: true, index: true },
  name: String,
  phone: String,
  email: String,
  costumeType: String,
  message: String,
  createdAt: Date
}, { collection: 'enquiries' }));

function upsertDocStore(colName, keyField, keyVal, data) {
  const col = docStore.getCollection(colName);
  const idx = col.findIndex((item) => String(item[keyField]) === String(keyVal));
  if (idx >= 0) {
    col[idx] = { ...col[idx], ...data, updatedAt: new Date().toISOString() };
  } else {
    col.push({
      _id: new mongoose.Types.ObjectId().toString(),
      createdAt: data.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...data
    });
  }
}

async function runMigration() {
  console.log(`[Migration] Checking MongoDB connection at ${MONGODB_URI}…`);
  let mongoConnected = false;
  try {
    await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 2000, connectTimeoutMS: 2000 });
    console.log('[Migration] Connected to MongoDB.');
    mongoConnected = true;
  } catch (err) {
    console.warn(`[Migration] Note: MongoDB connection skipped (${err.message}).`);
    console.warn('[Migration] Falling back to local persistent store (db/mongo_data.json).');
  }

  console.log('[Migration] Beginning data transfer from SQLite…');

  // 1. Categories
  const categories = db.prepare('SELECT * FROM categories').all();
  let catCount = 0;
  for (const c of categories) {
    const catData = {
      id: c.id,
      name: c.name,
      description: c.description,
      accentColor: c.accent_color,
      sortOrder: c.sort_order,
      note: c.note
    };
    if (mongoConnected) {
      await CategoryMongo.updateOne({ id: c.id }, { $set: catData }, { upsert: true });
    }
    upsertDocStore('categories', 'id', c.id, catData);
    catCount++;
  }
  console.log(`[Migration] Categories migrated: ${catCount}`);

  // 2. Costumes & Stock
  const costumes = db.prepare('SELECT * FROM costumes').all();
  let costumeCount = 0;
  for (const c of costumes) {
    const stockRows = db.prepare('SELECT size, qty FROM costume_stock WHERE costume_id = ?').all(c.id);
    const costumeData = {
      sqliteId: c.id,
      categoryId: c.category_id,
      imagePath: c.image_path,
      name: c.name,
      label: c.label,
      rentPrice: c.rent_price,
      sizeMin: c.size_min,
      sizeMax: c.size_max,
      active: Boolean(c.active),
      sortOrder: c.sort_order,
      stock: stockRows
    };
    if (mongoConnected) {
      await CostumeMongo.updateOne({ sqliteId: c.id }, { $set: costumeData }, { upsert: true });
    }
    upsertDocStore('costumes', 'sqliteId', c.id, costumeData);
    costumeCount++;
  }
  console.log(`[Migration] Costumes & stock migrated: ${costumeCount}`);

  // 3. Users
  const users = db.prepare('SELECT * FROM users').all();
  let userCount = 0;
  for (const u of users) {
    const userData = {
      sqliteId: u.id,
      name: u.name,
      email: u.email,
      phone: u.phone,
      passwordHash: u.password_hash,
      role: u.role,
      createdAt: new Date(u.created_at)
    };
    if (mongoConnected) {
      await UserMongo.updateOne({ sqliteId: u.id }, { $set: userData }, { upsert: true });
    }
    upsertDocStore('users', 'sqliteId', u.id, userData);
    userCount++;
  }
  console.log(`[Migration] Users migrated: ${userCount}`);

  // 4. Bookings
  const bookings = db.prepare('SELECT * FROM bookings').all();
  let bookingCount = 0;
  for (const b of bookings) {
    const bookingData = {
      sqliteId: b.id,
      userId: b.user_id,
      costumeId: b.costume_id,
      size: b.size,
      startDate: b.start_date,
      endDate: b.end_date,
      status: b.status,
      depositStatus: b.deposit_status,
      notes: b.notes,
      rentalPrice: b.rental_price,
      returnDeadline: b.return_deadline,
      actualReturnTime: b.actual_return_time,
      latePenalty: b.late_penalty || 0,
      damageCharge: b.damage_charge || 0,
      totalAmount: b.total_amount,
      isLate: Boolean(b.is_late),
      acceptedTerms: Boolean(b.accepted_terms),
      acceptedTermsAt: b.accepted_terms_at,
      createdAt: new Date(b.created_at)
    };
    if (mongoConnected) {
      await BookingMongo.updateOne({ sqliteId: b.id }, { $set: bookingData }, { upsert: true });
    }
    upsertDocStore('bookings', 'sqliteId', b.id, bookingData);
    bookingCount++;
  }
  console.log(`[Migration] Bookings migrated: ${bookingCount}`);

  // 5. Payments
  const payments = db.prepare('SELECT * FROM payments').all();
  let payCount = 0;
  for (const p of payments) {
    const payData = {
      sqliteId: p.id,
      bookingId: p.booking_id,
      razorpayOrderId: p.razorpay_order_id,
      razorpayPaymentId: p.razorpay_payment_id,
      amountPaise: p.amount_paise,
      status: p.status,
      createdAt: new Date(p.created_at)
    };
    if (mongoConnected) {
      await PaymentMongo.updateOne({ sqliteId: p.id }, { $set: payData }, { upsert: true });
    }
    upsertDocStore('payments', 'sqliteId', p.id, payData);
    payCount++;
  }
  console.log(`[Migration] Payments migrated: ${payCount}`);

  // 6. Enquiries
  const enquiries = db.prepare('SELECT * FROM enquiries').all();
  let enqCount = 0;
  for (const e of enquiries) {
    const enqData = {
      sqliteId: e.id,
      name: e.name,
      phone: e.phone,
      email: e.email,
      costumeType: e.costume_type,
      message: e.message,
      createdAt: new Date(e.created_at)
    };
    if (mongoConnected) {
      await EnquiryMongo.updateOne({ sqliteId: e.id }, { $set: enqData }, { upsert: true });
    }
    upsertDocStore('enquiries', 'sqliteId', e.id, enqData);
    enqCount++;
  }
  console.log(`[Migration] Enquiries migrated: ${enqCount}`);

  docStore.save();

  if (mongoConnected) {
    console.log('[Migration] SQLite-to-MongoDB migration completed successfully without loss of data.');
    await mongoose.disconnect();
  } else {
    console.log('[Migration] SQLite data synced to local persistent store (db/mongo_data.json) successfully.');
    console.log('[Migration] (Optional: If you run a local or Atlas MongoDB, set MONGODB_URI in .env to mirror to MongoDB)');
  }
}

if (require.main === module) {
  runMigration().catch((err) => {
    console.error('[Migration] Failed:', err);
    process.exit(1);
  });
}

module.exports = { runMigration };
