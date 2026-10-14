const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { DamageReport, Complaint } = require('../models');

const router = express.Router();

// GET /api/damage-reports/mine - Damage reports for customer's bookings
router.get('/mine', requireAuth, async (req, res) => {
  try {
    const list = await DamageReport.find({ userId: req.user.id }).sort({ createdAt: -1 });
    res.json(list.map((d) => (d.toObject ? d.toObject() : d)));
  } catch (err) {
    console.error('[damage-reports] Error fetching customer damage reports:', err);
    res.status(500).json({ error: 'Could not load damage reports.' });
  }
});

// GET /api/damage-reports/:id - Single damage report
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const isObjectId = /^[0-9a-fA-F]{24}$/.test(req.params.id);
    const filter = isObjectId ? { _id: req.params.id } : { reportRef: req.params.id };
    const report = await DamageReport.findOne(filter);
    if (!report) return res.status(404).json({ error: 'Damage report not found.' });

    if (report.userId !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'You do not have permission to view this damage report.' });
    }
    res.json(report.toObject ? report.toObject() : report);
  } catch (err) {
    console.error('[damage-reports] Error fetching damage report:', err);
    res.status(500).json({ error: 'Could not load damage report.' });
  }
});

// POST /api/damage-reports/:id/respond - Customer submits response or dispute
router.post('/:id/respond', requireAuth, async (req, res) => {
  try {
    const isObjectId = /^[0-9a-fA-F]{24}$/.test(req.params.id);
    const filter = isObjectId ? { _id: req.params.id } : { reportRef: req.params.id };
    const report = await DamageReport.findOne(filter);
    if (!report) return res.status(404).json({ error: 'Damage report not found.' });

    if (report.userId !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'You do not have permission to respond to this report.' });
    }

    const responseText = String(req.body.response || '').trim();
    if (!responseText || responseText.length < 5) {
      return res.status(400).json({ error: 'Please enter your response (at least 5 characters).' });
    }

    const updated = await DamageReport.findOneAndUpdate(
      filter,
      {
        customerResponse: responseText,
        customerResponseDate: new Date(),
        status: 'DISPUTED'
      },
      { new: true }
    );

    res.json(updated.toObject ? updated.toObject() : updated);
  } catch (err) {
    console.error('[damage-reports] Error updating customer response:', err);
    res.status(500).json({ error: 'Could not submit your response.' });
  }
});

module.exports = router;
