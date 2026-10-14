const { mongoose, createAdaptiveModel } = require('../db/mongo');

const ReturnInspectionSchema = new mongoose.Schema(
  {
    bookingId: { type: Number, required: true, index: true },
    bookingRef: { type: String, required: true },
    userId: { type: Number, required: true, index: true },
    customerName: { type: String, required: true },
    customerEmail: { type: String, required: true },
    costumeId: { type: Number, required: true },
    costumeName: { type: String, required: true },
    costumeQuantity: { type: Number, default: 1 },
    items: [
      {
        size: { type: Number, required: true },
        quantity: { type: Number, required: true, default: 1 },
        returnedQuantity: { type: Number, default: 0 }
      }
    ],
    sizeSummary: { type: String },
    expectedReturnDate: { type: String, required: true }, // e.g. YYYY-MM-DD
    expectedReturnTime: { type: String, required: true }, // e.g. 2026-10-15T20:00:00
    actualReturnTime: { type: String }, // e.g. 2026-10-15T21:30:00
    returnStatus: {
      type: String,
      enum: ['returned_on_time', 'returned_late', 'not_returned'],
      default: 'not_returned'
    },
    costumeCondition: {
      type: String,
      enum: ['good', 'minor_damage', 'major_damage', 'missing_parts', 'other'],
      default: 'good'
    },
    damageDescription: { type: String, default: '' },
    evidencePhotos: [{ type: String }],
    originalRentalPrice: { type: Number, required: true },
    latePenalty: { type: Number, default: 0 },
    isLate: { type: Boolean, default: false },
    proposedDamageCharge: { type: Number, default: 0 },
    approvedDamageCharge: { type: Number, default: 0 },
    damageChargeStatus: {
      type: String,
      enum: ['none', 'proposed', 'approved', 'waived', 'paid'],
      default: 'none'
    },
    totalAmount: { type: Number, required: true },
    adminNotes: { type: String, default: '' },
    inspectionDate: { type: String, default: () => new Date().toISOString().slice(0, 10) },
    inspectedBy: { type: String }, // Admin email or identifier
    inspectionStatus: {
      type: String,
      enum: ['pending', 'completed', 'requires_follow_up'],
      default: 'pending'
    },
    damageReportSubmitted: { type: Boolean, default: false },
    damageReportRef: { type: String },
    auditHistory: [
      {
        action: { type: String, required: true },
        reason: { type: String },
        performedBy: { type: String, required: true },
        changes: { type: mongoose.Schema.Types.Mixed },
        timestamp: { type: Date, default: Date.now }
      }
    ],
    lateFeeEmailSent: { type: Boolean, default: false },
    lateFeeEmailFailed: { type: Boolean, default: false },
    lateFeeEmailError: { type: String },
    damageReportEmailSent: { type: Boolean, default: false },
    damageReportEmailFailed: { type: Boolean, default: false }
  },
  {
    timestamps: true,
    collection: 'return_inspections'
  }
);

module.exports = createAdaptiveModel('ReturnInspection', ReturnInspectionSchema);
