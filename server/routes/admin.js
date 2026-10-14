const express = require('express');
const crypto = require('crypto');
const path = require('path');
const multer = require('multer');
const db = require('../db');
const { requireAdmin } = require('../middleware/auth');
const { remainingFor } = require('../lib/availability');
const { stockMap, serializeCostume, COSTUME_SELECT } = require('../lib/serialize');
const { serializeBooking, BOOKING_SELECT } = require('./bookings');
const {
  notify, sendMail, bookingConfirmedEmail, bookingCancelledEmail,
  lateReturnPenaltyEmail, damageReportSubmittedEmail,
  complaintStatusUpdatedEmail, complaintResolvedEmail
} = require('../lib/email');
const {
  ReturnInspection, DamageReport, Complaint, ComplaintStatusHistory, AuditLog
} = require('../models');
const {
  calculateReturnStatusAndFees, computeReturnDeadline, LATE_RETURN_PENALTY, STANDARD_RENT_PER_DAY
} = require('../lib/rentalPolicy');
const { eachDay } = require('../lib/dates');

const router = express.Router();
router.use(requireAdmin);

const { UPLOAD_DIR } = require('../lib/config');
const EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };
const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (req, file, cb) => cb(null, crypto.randomUUID() + EXT[file.mimetype])
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) =>
    EXT[file.mimetype] ? cb(null, true) : cb(new Error('Only JPG, PNG or WebP images are allowed.'))
});

// ---------- overview ----------
router.get('/stats', async (req, res) => {
  const count = (sql) => db.prepare(sql).get().n;
  const openComplaints = await Complaint.countDocuments({ status: { $in: ['OPEN', 'IN_REVIEW'] } }).catch(() => 0);
  const damageReports = await DamageReport.countDocuments({}).catch(() => 0);
  res.json({
    costumes: count('SELECT COUNT(*) n FROM costumes WHERE active = 1'),
    customers: count("SELECT COUNT(*) n FROM users WHERE role = 'customer'"),
    pendingBookings: count("SELECT COUNT(*) n FROM bookings WHERE status = 'pending'"),
    confirmedBookings: count("SELECT COUNT(*) n FROM bookings WHERE status = 'confirmed'"),
    enquiries: count('SELECT COUNT(*) n FROM enquiries'),
    openComplaints,
    damageReports
  });
});

// ---------- evidence photo upload ----------
router.post('/upload-evidence', upload.single('evidence'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Please choose an image file.' });
  res.status(201).json({ url: `/uploads/${req.file.filename}` });
});

// ---------- inspections ----------
router.get('/inspections', async (req, res) => {
  try {
    const list = await ReturnInspection.find({}).sort({ createdAt: -1 });
    res.json(list.map((d) => (d.toObject ? d.toObject() : d)));
  } catch (err) {
    console.error('[admin] Error fetching inspections:', err);
    res.status(500).json({ error: 'Could not load inspections.' });
  }
});

router.get('/inspections/booking/:bookingId', async (req, res) => {
  try {
    const bookingId = Number(req.params.bookingId);
    let bookingItems = [];
    try {
      bookingItems = db.prepare('SELECT size, quantity FROM booking_items WHERE booking_id = ? ORDER BY size').all(bookingId);
    } catch { /* fallback */ }

    let inspection = await ReturnInspection.findOne({ bookingId });
    if (inspection) {
      const obj = inspection.toObject ? inspection.toObject() : inspection;
      if (!obj.items || !obj.items.length) {
        obj.items = bookingItems.length ? bookingItems : [{ size: 0, quantity: obj.costumeQuantity || 1 }];
      }
      return res.json(obj);
    }

    const row = db.prepare(
      `SELECT b.*, c.name AS costume_name, c.sort_order, c.rent_price, cat.name AS category_name,
              u.name AS user_name, u.email AS user_email, u.phone AS user_phone
       FROM bookings b
       JOIN costumes c ON c.id = b.costume_id
       JOIN categories cat ON cat.id = c.category_id
       JOIN users u ON u.id = b.user_id
       WHERE b.id = ?`
    ).get(bookingId);

    if (!row) return res.status(404).json({ error: 'Booking not found.' });

    const totalQty = row.total_quantity || (bookingItems.length ? bookingItems.reduce((s, i) => s + i.quantity, 0) : 1);
    const items = bookingItems.length ? bookingItems : [{ size: row.size, quantity: totalQty }];
    const sizeSummary = items.map((i) => `Size ${i.size} (×${i.quantity})`).join(', ');

    const days = eachDay(row.start_date, row.end_date).length;
    const baseRental = row.rental_price != null ? row.rental_price : (row.rent_price ? row.rent_price * days * totalQty : STANDARD_RENT_PER_DAY * days * totalQty);
    const returnDeadline = row.return_deadline || `${row.end_date}T20:00:00`;
    const costumeName = row.costume_name || `${row.category_name} · Design ${row.sort_order + 1}`;

    const draft = {
      bookingId,
      bookingRef: `#${bookingId}`,
      userId: row.user_id,
      customerName: row.user_name,
      customerEmail: row.user_email,
      customerPhone: row.user_phone,
      costumeId: row.costume_id,
      costumeName,
      costumeQuantity: totalQty,
      items,
      sizeSummary,
      expectedReturnDate: row.end_date,
      expectedReturnTime: returnDeadline,
      actualReturnTime: row.actual_return_time || null,
      returnStatus: row.is_late ? 'returned_late' : (row.actual_return_time ? 'returned_on_time' : 'not_returned'),
      costumeCondition: 'good',
      damageDescription: '',
      evidencePhotos: [],
      originalRentalPrice: baseRental,
      latePenalty: row.late_penalty || 0,
      isLate: Boolean(row.is_late),
      proposedDamageCharge: 0,
      approvedDamageCharge: row.damage_charge || 0,
      totalAmount: row.total_amount || baseRental,
      adminNotes: '',
      inspectionStatus: row.status === 'returned' ? 'completed' : 'pending',
      inspectionDate: new Date().toISOString().slice(0, 10),
      isDraft: true
    };

    res.json(draft);
  } catch (err) {
    console.error('[admin] Error getting inspection for booking:', err);
    res.status(500).json({ error: 'Could not load inspection.' });
  }
});

router.post('/inspections', async (req, res) => {
  try {
    const {
      bookingId,
      actualReturnTime,
      returnStatus,
      costumeCondition,
      damageDescription,
      evidencePhotos,
      proposedDamageCharge,
      approvedDamageCharge,
      adminNotes,
      inspectionStatus,
      manualLatePenalty,
      items
    } = req.body;

    const bId = Number(bookingId);
    const bookingRow = db.prepare(
      `SELECT b.*, c.name AS costume_name, c.sort_order, c.rent_price, cat.name AS category_name,
              u.name AS user_name, u.email AS user_email, u.phone AS user_phone
       FROM bookings b
       JOIN costumes c ON c.id = b.costume_id
       JOIN categories cat ON cat.id = c.category_id
       JOIN users u ON u.id = b.user_id
       WHERE b.id = ?`
    ).get(bId);

    if (!bookingRow) return res.status(404).json({ error: 'Booking not found.' });

    const days = eachDay(bookingRow.start_date, bookingRow.end_date).length;
    const baseRental = bookingRow.rental_price != null ? bookingRow.rental_price : (bookingRow.rent_price ? bookingRow.rent_price * days : STANDARD_RENT_PER_DAY * days);
    const returnDeadline = bookingRow.return_deadline || `${bookingRow.end_date}T20:00:00`;
    const costumeName = bookingRow.costume_name || `${bookingRow.category_name} · Design ${bookingRow.sort_order + 1}`;

    const feeCalc = calculateReturnStatusAndFees({
      rentalPrice: baseRental,
      returnDeadline,
      actualReturnTime,
      approvedDamageCharge,
      manualLatePenalty
    });

    const finalReturnStatus = returnStatus || feeCalc.returnStatus;
    const existing = await ReturnInspection.findOne({ bookingId: bId });

    const inspectionData = {
      bookingId: bId,
      bookingRef: `#${bId}`,
      userId: bookingRow.user_id,
      customerName: bookingRow.user_name,
      customerEmail: bookingRow.user_email,
      costumeId: bookingRow.costume_id,
      costumeName,
      costumeQuantity: bookingRow.total_quantity || (Array.isArray(items) && items.length > 0 ? items.reduce((s, i) => s + (Number(i.quantity) || 1), 0) : 1),
      items: Array.isArray(items) && items.length > 0 ? items : (bookingRow.size ? [{ size: bookingRow.size, quantity: bookingRow.total_quantity || 1 }] : []),
      expectedReturnDate: bookingRow.end_date,
      expectedReturnTime: returnDeadline,
      actualReturnTime: actualReturnTime || null,
      returnStatus: finalReturnStatus,
      costumeCondition: costumeCondition || 'good',
      damageDescription: damageDescription || '',
      evidencePhotos: Array.isArray(evidencePhotos) ? evidencePhotos : [],
      originalRentalPrice: baseRental,
      latePenalty: feeCalc.latePenalty,
      isLate: feeCalc.isLate,
      proposedDamageCharge: Number(proposedDamageCharge) || 0,
      approvedDamageCharge: Number(approvedDamageCharge) || 0,
      damageChargeStatus: (Number(approvedDamageCharge) > 0) ? 'approved' : ((Number(proposedDamageCharge) > 0) ? 'proposed' : 'none'),
      totalAmount: feeCalc.totalAmount,
      adminNotes: adminNotes || '',
      inspectionStatus: inspectionStatus || 'completed',
      inspectionDate: new Date().toISOString().slice(0, 10),
      inspectedBy: req.user.email
    };

    let saved;
    if (existing) {
      const audit = {
        action: 'UPDATE_INSPECTION',
        performedBy: req.user.email,
        timestamp: new Date()
      };
      saved = await ReturnInspection.findOneAndUpdate(
        { bookingId: bId },
        { ...inspectionData, $push: { auditHistory: audit } },
        { new: true }
      );
    } else {
      saved = await ReturnInspection.create({
        ...inspectionData,
        auditHistory: [{ action: 'CREATE_INSPECTION', performedBy: req.user.email, timestamp: new Date() }]
      });
    }

    // Update SQLite booking status and amounts
    db.prepare(
      `UPDATE bookings SET
         status = ?,
         actual_return_time = ?,
         late_penalty = ?,
         damage_charge = ?,
         total_amount = ?,
         is_late = ?
       WHERE id = ?`
    ).run(
      inspectionStatus === 'pending' ? bookingRow.status : 'returned',
      actualReturnTime || null,
      feeCalc.latePenalty,
      Number(approvedDamageCharge) || 0,
      feeCalc.totalAmount,
      feeCalc.isLate ? 1 : 0,
      bId
    );

    // If late fee recorded and email not sent yet, notify customer
    if (feeCalc.isLate && !saved.lateFeeEmailSent) {
      const emailPayload = lateReturnPenaltyEmail({
        booking: {
          id: bId,
          costumeName,
          customerEmail: bookingRow.user_email,
          user: { name: bookingRow.user_name, email: bookingRow.user_email }
        },
        penaltyAmount: feeCalc.latePenalty,
        rentalAmount: baseRental,
        totalAmount: feeCalc.totalAmount,
        returnDeadline,
        actualReturnTime
      });
      const sendRes = await sendMail(emailPayload);
      if (sendRes.success) {
        await ReturnInspection.updateOne({ bookingId: bId }, { lateFeeEmailSent: true });
        saved.lateFeeEmailSent = true;
      } else {
        await ReturnInspection.updateOne(
          { bookingId: bId },
          { lateFeeEmailFailed: true, lateFeeEmailError: sendRes.error }
        );
        saved.lateFeeEmailFailed = true;
      }
    }

    res.json(saved.toObject ? saved.toObject() : saved);
  } catch (err) {
    console.error('[admin] Error saving inspection:', err);
    res.status(500).json({ error: 'Could not save inspection.' });
  }
});

router.post('/inspections/:id/damage-report', async (req, res) => {
  try {
    const isObjectId = /^[0-9a-fA-F]{24}$/.test(req.params.id);
    const filter = isObjectId ? { _id: req.params.id } : { bookingId: Number(req.params.id) };
    const inspection = await ReturnInspection.findOne(filter);
    if (!inspection) return res.status(404).json({ error: 'Inspection not found.' });

    // Idempotent: check if report already created
    let existingReport = await DamageReport.findOne({ inspectionId: String(inspection._id) });
    if (existingReport) {
      return res.json(existingReport.toObject ? existingReport.toObject() : existingReport);
    }

    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const rand = Math.floor(1000 + Math.random() * 9000);
    const reportRef = `DR-${dateStr}-${rand}`;

    const report = await DamageReport.create({
      reportRef,
      inspectionId: String(inspection._id),
      bookingId: inspection.bookingId,
      bookingRef: inspection.bookingRef,
      userId: inspection.userId,
      customerName: inspection.customerName,
      customerEmail: inspection.customerEmail,
      costumeId: inspection.costumeId,
      costumeName: inspection.costumeName,
      inspectionDate: inspection.inspectionDate,
      condition: inspection.costumeCondition,
      description: inspection.damageDescription || req.body.description || 'Damage identified during return inspection.',
      evidencePhotos: inspection.evidencePhotos || [],
      proposedCharge: inspection.proposedDamageCharge || Number(req.body.proposedCharge) || 0,
      status: 'PROPOSED',
      submittedByAdminId: req.user.id,
      submittedByAdminEmail: req.user.email
    });

    // Email customer with report
    const emailData = damageReportSubmittedEmail(report);
    const emailResult = await sendMail(emailData);
    if (emailResult.success) {
      await DamageReport.updateOne({ reportRef }, { emailDeliveryStatus: 'sent', emailSentAt: new Date() });
      await ReturnInspection.updateOne(
        filter,
        { damageReportSubmitted: true, damageReportRef: reportRef, damageReportEmailSent: true }
      );
      report.emailDeliveryStatus = 'sent';
    } else {
      await DamageReport.updateOne(
        { reportRef },
        { emailDeliveryStatus: 'failed', emailDeliveryError: emailResult.error }
      );
      await ReturnInspection.updateOne(
        filter,
        { damageReportSubmitted: true, damageReportRef: reportRef, damageReportEmailFailed: true }
      );
      report.emailDeliveryStatus = 'failed';
    }

    res.status(201).json(report.toObject ? report.toObject() : report);
  } catch (err) {
    console.error('[admin] Error submitting damage report:', err);
    res.status(500).json({ error: 'Could not submit damage report.' });
  }
});

router.post('/inspections/:id/correct-penalty', async (req, res) => {
  try {
    const { newPenalty, actualReturnTime, reason } = req.body;
    if (!reason || String(reason).trim().length < 4) {
      return res.status(400).json({ error: 'Please provide a clear reason for the audit log.' });
    }

    const isObjectId = /^[0-9a-fA-F]{24}$/.test(req.params.id);
    const filter = isObjectId ? { _id: req.params.id } : { bookingId: Number(req.params.id) };
    const inspection = await ReturnInspection.findOne(filter);
    if (!inspection) return res.status(404).json({ error: 'Inspection not found.' });

    const prevPenalty = inspection.latePenalty;
    const prevTime = inspection.actualReturnTime;
    const adjustedPenalty = Math.max(0, Number(newPenalty) || 0);
    const adjustedTime = actualReturnTime || inspection.actualReturnTime;
    const adjustedLate = adjustedPenalty > 0;
    const newTotal = inspection.originalRentalPrice + adjustedPenalty + inspection.approvedDamageCharge;

    const auditEntry = {
      action: 'CORRECT_PENALTY',
      reason: String(reason).trim(),
      performedBy: req.user.email,
      changes: {
        previousPenalty: prevPenalty,
        newPenalty: adjustedPenalty,
        previousReturnTime: prevTime,
        newReturnTime: adjustedTime
      },
      timestamp: new Date()
    };

    const updated = await ReturnInspection.findOneAndUpdate(
      filter,
      {
        latePenalty: adjustedPenalty,
        isLate: adjustedLate,
        actualReturnTime: adjustedTime,
        returnStatus: adjustedLate ? 'returned_late' : 'returned_on_time',
        totalAmount: newTotal,
        $push: { auditHistory: auditEntry }
      },
      { new: true }
    );

    // Update AuditLog model
    await AuditLog.create({
      entityType: 'late_fee',
      entityId: String(inspection._id),
      bookingId: inspection.bookingId,
      action: 'CORRECT_PENALTY',
      performedBy: req.user.email,
      reason: String(reason).trim(),
      previousData: { latePenalty: prevPenalty, actualReturnTime: prevTime },
      newData: { latePenalty: adjustedPenalty, actualReturnTime: adjustedTime }
    });

    // Update SQLite booking
    db.prepare('UPDATE bookings SET late_penalty = ?, total_amount = ?, is_late = ?, actual_return_time = ? WHERE id = ?').run(
      adjustedPenalty,
      newTotal,
      adjustedLate ? 1 : 0,
      adjustedTime,
      inspection.bookingId
    );

    res.json(updated.toObject ? updated.toObject() : updated);
  } catch (err) {
    console.error('[admin] Error correcting penalty:', err);
    res.status(500).json({ error: 'Could not correct penalty.' });
  }
});

// ---------- damage reports ----------
router.get('/damage-reports', async (req, res) => {
  try {
    const list = await DamageReport.find({}).sort({ createdAt: -1 });
    res.json(list.map((d) => (d.toObject ? d.toObject() : d)));
  } catch (err) {
    console.error('[admin] Error fetching damage reports:', err);
    res.status(500).json({ error: 'Could not load damage reports.' });
  }
});

router.post('/damage-reports/:id/retry-email', async (req, res) => {
  try {
    const isObjectId = /^[0-9a-fA-F]{24}$/.test(req.params.id);
    const filter = isObjectId ? { _id: req.params.id } : { reportRef: req.params.id };
    const report = await DamageReport.findOne(filter);
    if (!report) return res.status(404).json({ error: 'Damage report not found.' });

    const emailData = damageReportSubmittedEmail(report);
    const emailResult = await sendMail(emailData);
    if (emailResult.success) {
      await DamageReport.updateOne(filter, { emailDeliveryStatus: 'sent', emailDeliveryError: null, emailSentAt: new Date() });
      res.json({ success: true, message: 'Email sent successfully.' });
    } else {
      await DamageReport.updateOne(filter, { emailDeliveryStatus: 'failed', emailDeliveryError: emailResult.error });
      res.status(502).json({ error: emailResult.error || 'SMTP delivery failed.' });
    }
  } catch (err) {
    console.error('[admin] Error retrying damage report email:', err);
    res.status(500).json({ error: 'Could not retry sending email.' });
  }
});

// ---------- complaints ----------
router.get('/complaints', async (req, res) => {
  try {
    const { q, status, category, bookingId } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (category) filter.category = category;
    if (bookingId) filter.bookingId = Number(bookingId);
    if (q) {
      const regex = new RegExp(String(q).trim(), 'i');
      filter.$or = [
        { complaintRef: regex },
        { customerName: regex },
        { customerEmail: regex },
        { subject: regex }
      ];
    }
    const list = await Complaint.find(filter).sort({ createdAt: -1 });
    res.json(list.map((c) => (c.toObject ? c.toObject() : c)));
  } catch (err) {
    console.error('[admin] Error fetching complaints:', err);
    res.status(500).json({ error: 'Could not load complaints.' });
  }
});

router.get('/complaints/:id', async (req, res) => {
  try {
    const isObjectId = /^[0-9a-fA-F]{24}$/.test(req.params.id);
    const filter = isObjectId ? { _id: req.params.id } : { complaintRef: req.params.id };
    const complaint = await Complaint.findOne(filter);
    if (!complaint) return res.status(404).json({ error: 'Complaint not found.' });
    res.json(complaint.toObject ? complaint.toObject() : complaint);
  } catch (err) {
    console.error('[admin] Error fetching complaint:', err);
    res.status(500).json({ error: 'Could not load complaint.' });
  }
});

router.post('/complaints/:id/notes', async (req, res) => {
  try {
    const noteText = String(req.body.note || '').trim();
    if (!noteText) return res.status(400).json({ error: 'Note cannot be empty.' });

    const isObjectId = /^[0-9a-fA-F]{24}$/.test(req.params.id);
    const filter = isObjectId ? { _id: req.params.id } : { complaintRef: req.params.id };

    const newNote = {
      note: noteText,
      adminId: req.user.id,
      adminEmail: req.user.email,
      createdAt: new Date()
    };

    const updated = await Complaint.findOneAndUpdate(
      filter,
      { $push: { internalNotes: newNote } },
      { new: true }
    );
    if (!updated) return res.status(404).json({ error: 'Complaint not found.' });
    res.status(201).json(updated.toObject ? updated.toObject() : updated);
  } catch (err) {
    console.error('[admin] Error adding note:', err);
    res.status(500).json({ error: 'Could not add note.' });
  }
});

router.patch('/complaints/:id', async (req, res) => {
  try {
    const { status, adminResponse, resolution, actionTaken, comment } = req.body;
    const isObjectId = /^[0-9a-fA-F]{24}$/.test(req.params.id);
    const filter = isObjectId ? { _id: req.params.id } : { complaintRef: req.params.id };

    const existing = await Complaint.findOne(filter);
    if (!existing) return res.status(404).json({ error: 'Complaint not found.' });

    const updates = {};
    const fromStatus = existing.status;
    let statusChanged = false;

    if (status && status !== existing.status) {
      const VALID_STATUSES = ['OPEN', 'IN_REVIEW', 'WAITING_FOR_CUSTOMER', 'RESOLVED', 'CLOSED'];
      if (!VALID_STATUSES.includes(status)) {
        return res.status(400).json({ error: 'Invalid complaint status.' });
      }
      updates.status = status;
      statusChanged = true;
      if (['RESOLVED', 'CLOSED'].includes(existing.status) && ['OPEN', 'IN_REVIEW'].includes(status)) {
        updates.$inc = { reopenedCount: 1 };
      }
    }

    if (adminResponse !== undefined) updates.adminResponse = String(adminResponse || '').trim() || null;
    if (resolution !== undefined) updates.resolution = String(resolution || '').trim() || null;
    if (actionTaken !== undefined) updates.actionTaken = String(actionTaken || '').trim() || null;

    const actionText = statusChanged
      ? `Status changed from ${fromStatus} to ${status}`
      : 'Admin response / resolution updated';

    const historyItem = {
      fromStatus,
      toStatus: status || fromStatus,
      action: actionText,
      changedBy: req.user.email,
      comment: comment || adminResponse || null,
      createdAt: new Date()
    };

    if (!updates.$push) updates.$push = {};
    updates.$push.statusHistory = historyItem;

    const updated = await Complaint.findOneAndUpdate(filter, updates, { new: true });

    await ComplaintStatusHistory.create({
      complaintRef: existing.complaintRef,
      bookingId: existing.bookingId,
      fromStatus,
      toStatus: status || fromStatus,
      action: actionText,
      changedBy: req.user.email,
      comment: comment || adminResponse || null,
      customerNotified: statusChanged || Boolean(adminResponse),
      emailStatus: 'sent'
    });

    // Notify customer by email
    const emailFn = (status === 'RESOLVED') ? complaintResolvedEmail : complaintStatusUpdatedEmail;
    const emailPayload = emailFn(updated, {
      status: status || fromStatus,
      adminResponse: updated.adminResponse,
      resolution: updated.resolution,
      actionTaken: updated.actionTaken
    });
    const emailResult = await sendMail(emailPayload);
    if (!emailResult.success) {
      await Complaint.updateOne(filter, { emailDeliveryStatus: 'failed', emailDeliveryError: emailResult.error });
    } else {
      await Complaint.updateOne(filter, { emailDeliveryStatus: 'sent' });
    }

    res.json(updated.toObject ? updated.toObject() : updated);
  } catch (err) {
    console.error('[admin] Error updating complaint:', err);
    res.status(500).json({ error: 'Could not update complaint.' });
  }
});

router.post('/complaints/:id/retry-email', async (req, res) => {
  try {
    const isObjectId = /^[0-9a-fA-F]{24}$/.test(req.params.id);
    const filter = isObjectId ? { _id: req.params.id } : { complaintRef: req.params.id };
    const complaint = await Complaint.findOne(filter);
    if (!complaint) return res.status(404).json({ error: 'Complaint not found.' });

    const emailFn = (complaint.status === 'RESOLVED') ? complaintResolvedEmail : complaintStatusUpdatedEmail;
    const emailPayload = emailFn(complaint, {
      status: complaint.status,
      adminResponse: complaint.adminResponse,
      resolution: complaint.resolution,
      actionTaken: complaint.actionTaken
    });
    const emailResult = await sendMail(emailPayload);
    if (emailResult.success) {
      await Complaint.updateOne(filter, { emailDeliveryStatus: 'sent', emailDeliveryError: null });
      res.json({ success: true, message: 'Email sent successfully.' });
    } else {
      await Complaint.updateOne(filter, { emailDeliveryStatus: 'failed', emailDeliveryError: emailResult.error });
      res.status(502).json({ error: emailResult.error || 'SMTP delivery failed.' });
    }
  } catch (err) {
    console.error('[admin] Error retrying complaint email:', err);
    res.status(500).json({ error: 'Could not retry sending email.' });
  }
});

// ---------- audit logs ----------
router.get('/audit-logs', async (req, res) => {
  try {
    const list = await AuditLog.find({}).sort({ createdAt: -1 });
    res.json(list.map((a) => (a.toObject ? a.toObject() : a)));
  } catch (err) {
    console.error('[admin] Error fetching audit logs:', err);
    res.status(500).json({ error: 'Could not load audit logs.' });
  }
});

// ---------- bookings ----------
router.get('/bookings', (req, res) => {
  const status = String(req.query.status || '');
  const rows = db.prepare(
    `SELECT b.*, c.image_path, c.name AS costume_name, c.sort_order, c.rent_price, cat.name AS category_name,
            u.name AS user_name, u.email AS user_email, u.phone AS user_phone
     FROM bookings b
     JOIN costumes c ON c.id = b.costume_id
     JOIN categories cat ON cat.id = c.category_id
     JOIN users u ON u.id = b.user_id
     ${status ? 'WHERE b.status = ?' : ''}
     ORDER BY b.start_date DESC, b.id DESC`
  ).all(...(status ? [status] : []));
  res.json(rows.map(serializeBooking));
});

router.patch('/bookings/:id', (req, res) => {
  const status = String(req.body.status || '');
  if (!['pending', 'confirmed', 'cancelled', 'returned'].includes(status)) {
    return res.status(400).json({ error: 'Unknown status.' });
  }
  const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(req.params.id);
  if (!booking) return res.status(404).json({ error: 'Booking not found.' });

  // Re-opening a cancelled/returned booking takes stock again, so make sure it is still free.
  const reopening = ['cancelled', 'returned'].includes(booking.status) && ['pending', 'confirmed'].includes(status);
  if (reopening) {
    let bItems = [];
    try {
      bItems = db.prepare('SELECT size, quantity FROM booking_items WHERE booking_id = ?').all(booking.id);
    } catch { /* fallback */ }
    const itemsToCheck = bItems.length ? bItems : [{ size: booking.size, quantity: booking.total_quantity || 1 }];
    for (const item of itemsToCheck) {
      const { remaining } = remainingFor(db, booking.costume_id, item.size, booking.start_date, booking.end_date);
      if (remaining < item.quantity) {
        return res.status(409).json({ error: `Size ${item.size} has since been booked for these dates.` });
      }
    }
  }
  db.prepare('UPDATE bookings SET status = ? WHERE id = ?').run(status, booking.id);
  const updated = serializeBooking(db.prepare(`${BOOKING_SELECT} WHERE b.id = ?`).get(booking.id));

  // Tell the customer when their booking is confirmed or cancelled (only if the status really changed).
  if (status !== booking.status && ['confirmed', 'cancelled'].includes(status)) {
    const customer = db.prepare('SELECT name, email FROM users WHERE id = ?').get(booking.user_id);
    if (customer) notify((status === 'confirmed' ? bookingConfirmedEmail : bookingCancelledEmail)(updated, customer));
  }
  res.json(updated);
});

// ---------- costumes ----------
function parseStock(raw, sizeMinIn, sizeMaxIn) {
  let list;
  try { list = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return { error: 'Sizes were not understood.' }; }
  if (!Array.isArray(list)) return { error: 'Sizes were not understood.' };

  const seen = new Set();
  const stock = [];
  for (const item of list) {
    const size = Number(item.size);
    const qty = Number(item.qty);
    if (!Number.isInteger(size) || size < 0 || size > 60 || !Number.isInteger(qty) || qty < 0 || qty > 999) {
      return { error: 'Each size needs a whole size in inches and a stock count.' };
    }
    if (seen.has(size)) return { error: `Size ${size} is listed twice.` };
    seen.add(size);
    stock.push({ size, qty });
  }
  const pooled = stock.length === 1 && stock[0].size === 0;
  if (stock.some((s) => s.size === 0) && !pooled) {
    return { error: 'A pooled count (size 0) cannot be mixed with individual sizes.' };
  }
  let sizeMin = null;
  let sizeMax = null;
  if (pooled) {
    sizeMin = Number(sizeMinIn);
    sizeMax = Number(sizeMaxIn);
    if (!Number.isInteger(sizeMin) || !Number.isInteger(sizeMax) || sizeMin <= 0 || sizeMax < sizeMin) {
      return { error: 'Enter the smallest and largest size for this costume.' };
    }
  } else {
    const sizes = stock.filter((s) => s.qty > 0).map((s) => s.size).sort((a, b) => a - b);
    sizeMin = sizes[0] ?? null;
    sizeMax = sizes[sizes.length - 1] ?? null;
  }
  return { stock, sizeMin, sizeMax };
}

function writeStock(costumeId, parsed) {
  db.prepare('DELETE FROM costume_stock WHERE costume_id = ?').run(costumeId);
  const insert = db.prepare('INSERT INTO costume_stock (costume_id, size, qty) VALUES (?, ?, ?)');
  for (const s of parsed.stock) insert.run(costumeId, s.size, s.qty);
  db.prepare('UPDATE costumes SET size_min = ?, size_max = ? WHERE id = ?').run(parsed.sizeMin, parsed.sizeMax, costumeId);
}

const parsePrice = (v) => (v === '' || v === null || v === undefined ? null : Number(v));
const validPrice = (p) => p === null || (Number.isInteger(p) && p >= 0 && p <= 1000000);

const detail = (id) => serializeCostume(
  db.prepare(`${COSTUME_SELECT} WHERE c.id = ?`).get(id),
  stockMap(db).get(Number(id)) || []
);

router.get('/costumes', (req, res) => {
  const stocks = stockMap(db);
  const rows = db.prepare(`${COSTUME_SELECT} ORDER BY cat.sort_order, c.sort_order, c.id`).all();
  res.json(rows.map((r) => serializeCostume(r, stocks.get(r.id) || [])));
});

router.post('/costumes', upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Please choose a photo of the costume.' });
  const category = db.prepare('SELECT id FROM categories WHERE id = ?').get(String(req.body.categoryId || ''));
  if (!category) return res.status(400).json({ error: 'Please choose a category.' });
  const price = parsePrice(req.body.rentPrice);
  if (!validPrice(price)) return res.status(400).json({ error: 'Rent per day must be a whole number of rupees.' });
  const parsed = parseStock(req.body.sizes || '[]', req.body.sizeMin, req.body.sizeMax);
  if (parsed.error) return res.status(400).json({ error: parsed.error });

  const next = db.prepare('SELECT COALESCE(MAX(sort_order), 0) + 1 AS n FROM costumes WHERE category_id = ?').get(category.id).n;
  const result = db.prepare(
    `INSERT INTO costumes (category_id, image_path, name, label, rent_price, sort_order) VALUES (?, ?, ?, ?, ?, ?)`
  ).run(category.id, `/uploads/${req.file.filename}`, (req.body.name || '').trim() || null,
        (req.body.label || '').trim() || null, price, next);
  writeStock(result.lastInsertRowid, parsed);
  res.status(201).json(detail(result.lastInsertRowid));
});

router.put('/costumes/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM costumes WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Costume not found.' });
  const b = req.body;

  const price = 'rentPrice' in b ? parsePrice(b.rentPrice) : existing.rent_price;
  if (!validPrice(price)) return res.status(400).json({ error: 'Rent per day must be a whole number of rupees.' });
  if ('categoryId' in b && !db.prepare('SELECT id FROM categories WHERE id = ?').get(String(b.categoryId))) {
    return res.status(400).json({ error: 'Unknown category.' });
  }
  let parsed = null;
  if ('sizes' in b) {
    parsed = parseStock(b.sizes, b.sizeMin, b.sizeMax);
    if (parsed.error) return res.status(400).json({ error: parsed.error });
  }

  db.prepare('UPDATE costumes SET name = ?, label = ?, rent_price = ?, category_id = ?, active = ? WHERE id = ?').run(
    'name' in b ? (String(b.name || '').trim() || null) : existing.name,
    'label' in b ? (String(b.label || '').trim() || null) : existing.label,
    price,
    'categoryId' in b ? String(b.categoryId) : existing.category_id,
    'active' in b ? (b.active ? 1 : 0) : existing.active,
    existing.id
  );
  if (parsed) writeStock(existing.id, parsed);
  res.json(detail(existing.id));
});

// ---------- enquiries ----------
router.get('/enquiries', (req, res) => {
  res.json(db.prepare('SELECT * FROM enquiries ORDER BY created_at DESC, id DESC').all());
});

module.exports = router;
