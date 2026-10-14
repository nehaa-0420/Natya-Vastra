const express = require('express');
const crypto = require('crypto');
const path = require('path');
const multer = require('multer');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { Complaint, ComplaintStatusHistory } = require('../models');
const { notify, sendMail, complaintReceivedEmail } = require('../lib/email');
const { UPLOAD_DIR } = require('../lib/config');

const router = express.Router();

const ALLOWED_MIME = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'application/pdf': '.pdf'
};

const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (req, file, cb) => {
      const ext = ALLOWED_MIME[file.mimetype] || path.extname(file.originalname).toLowerCase() || '.jpg';
      cb(null, `complaint-${crypto.randomUUID()}${ext}`);
    }
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_MIME[file.mimetype]) {
      cb(null, true);
    } else {
      cb(new Error('Only JPG, PNG, WebP images or PDF documents are allowed (max 5 MB).'));
    }
  }
});

const VALID_CATEGORIES = [
  'late_return_fee',
  'damage_report',
  'payment',
  'booking_cancellation',
  'missing_item',
  'delivery_collection',
  'website_problem',
  'other'
];

function sanitizeForCustomer(doc) {
  if (!doc) return null;
  const raw = doc.toObject ? doc.toObject() : doc;
  const { internalNotes, ...safe } = raw;
  return safe;
}

function generateComplaintRef() {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `CMP-${dateStr}-${rand}`;
}

// POST /api/complaints - Customer submits a complaint
router.post('/', requireAuth, upload.single('attachment'), async (req, res) => {
  try {
    const { bookingId, category, subject, description, contactPhone, contactEmail, contactName } = req.body;

    if (!category || !VALID_CATEGORIES.includes(category)) {
      return res.status(400).json({ error: 'Please choose a valid complaint category.' });
    }
    const cleanSubject = String(subject || '').trim();
    if (!cleanSubject || cleanSubject.length < 3 || cleanSubject.length > 200) {
      return res.status(400).json({ error: 'Subject must be between 3 and 200 characters.' });
    }
    const cleanDesc = String(description || '').trim();
    if (!cleanDesc || cleanDesc.length < 10 || cleanDesc.length > 3000) {
      return res.status(400).json({ error: 'Description must be between 10 and 3,000 characters.' });
    }

    let parsedBookingId = null;
    let bookingRef = null;
    if (bookingId) {
      parsedBookingId = Number(bookingId);
      const booking = db.prepare('SELECT id, user_id FROM bookings WHERE id = ?').get(parsedBookingId);
      if (!booking) {
        return res.status(404).json({ error: 'Referenced booking not found.' });
      }
      if (booking.user_id !== req.user.id && req.user.role !== 'admin') {
        return res.status(403).json({ error: 'You can only link complaints to your own bookings.' });
      }
      bookingRef = `#${booking.id}`;
    }

    const complaintRef = generateComplaintRef();
    const customerName = (contactName || req.user.name).trim();
    const customerEmail = (contactEmail || req.user.email).trim().toLowerCase();
    const customerPhone = (contactPhone || req.user.phone || '').trim();
    const attachmentUrl = req.file ? `/uploads/${req.file.filename}` : null;

    const complaint = await Complaint.create({
      complaintRef,
      bookingId: parsedBookingId,
      bookingRef,
      userId: req.user.id,
      customerName,
      customerEmail,
      customerPhone,
      category,
      subject: cleanSubject,
      description: cleanDesc,
      attachmentUrl,
      status: 'OPEN',
      statusHistory: [
        {
          fromStatus: 'NONE',
          toStatus: 'OPEN',
          action: 'Complaint submitted by customer',
          changedBy: customerEmail,
          comment: 'New complaint created',
          createdAt: new Date()
        }
      ]
    });

    await ComplaintStatusHistory.create({
      complaintRef,
      bookingId: parsedBookingId,
      fromStatus: 'NONE',
      toStatus: 'OPEN',
      action: 'Created',
      changedBy: customerEmail,
      comment: 'Complaint submitted',
      customerNotified: true,
      emailStatus: 'sent'
    });

    // Send confirmation email to customer
    const emailData = complaintReceivedEmail(complaint);
    const emailResult = await sendMail(emailData);
    if (!emailResult.success) {
      await Complaint.updateOne(
        { complaintRef },
        { emailDeliveryStatus: 'failed', emailDeliveryError: emailResult.error || 'SMTP not configured' }
      );
    } else {
      await Complaint.updateOne({ complaintRef }, { emailDeliveryStatus: 'sent' });
    }

    // Optional admin notification
    if (process.env.ADMIN_EMAIL) {
      notify({
        to: process.env.ADMIN_EMAIL,
        subject: `[Admin Alert] New Complaint ${complaintRef} — ${cleanSubject}`,
        text: `New complaint received from ${customerName} (${customerEmail}):\nCategory: ${category}\nSubject: ${cleanSubject}\n\n${cleanDesc}`
      });
    }

    res.status(201).json(sanitizeForCustomer(complaint));
  } catch (err) {
    console.error('[complaints] Error creating complaint:', err);
    res.status(500).json({ error: 'Could not submit your complaint. Please try again.' });
  }
});

// GET /api/complaints/mine - Customer's own complaints
router.get('/mine', requireAuth, async (req, res) => {
  try {
    const list = await Complaint.find({ userId: req.user.id }).sort({ createdAt: -1 });
    res.json(list.map(sanitizeForCustomer));
  } catch (err) {
    console.error('[complaints] Error fetching user complaints:', err);
    res.status(500).json({ error: 'Could not load your complaints.' });
  }
});

// GET /api/complaints/:id - Single complaint
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const isObjectId = /^[0-9a-fA-F]{24}$/.test(req.params.id);
    const filter = isObjectId ? { _id: req.params.id } : { complaintRef: req.params.id };
    const complaint = await Complaint.findOne(filter);
    if (!complaint) return res.status(404).json({ error: 'Complaint not found.' });

    // Authorization: customer can only view their own
    if (complaint.userId !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'You do not have permission to view this complaint.' });
    }

    if (req.user.role === 'admin') {
      return res.json(complaint.toObject ? complaint.toObject() : complaint);
    }
    res.json(sanitizeForCustomer(complaint));
  } catch (err) {
    console.error('[complaints] Error getting complaint:', err);
    res.status(500).json({ error: 'Could not load complaint details.' });
  }
});

module.exports = router;
module.exports.sanitizeForCustomer = sanitizeForCustomer;
