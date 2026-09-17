require('dotenv').config();
const express = require('express');
const cors = require('cors');

const categoriesRouter = require('./routes/categories');
const galleryRouter = require('./routes/gallery');
const enquiriesRouter = require('./routes/enquiries');

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(express.json());

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));
app.use('/api/categories', categoriesRouter);
app.use('/api/gallery', galleryRouter);
app.use('/api/enquiries', enquiriesRouter);

app.use((req, res) => res.status(404).json({ error: 'Not found.' }));
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on our end.' });
});

app.listen(PORT, () => {
  console.log(`Natya Vastra API running on http://localhost:${PORT}`);
});
