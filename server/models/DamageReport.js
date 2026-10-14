const { mongoose, createAdaptiveModel } = require('../db/mongo');

const DamageReportSchema = new mongoose.Schema(
  {
    reportRef: { type: String, required: true, unique: true, index: true },
    inspectionId: { type: String, required: true },
    bookingId: { type: Number, required: true, index: true },
    bookingRef: { type: String, required: true },
    userId: { type: Number, required: true, index: true },
    customerName: { type: String, required: true },
    customerEmail: { type: String, required: true },
    costumeId: { type: Number, required: true },
    costumeName: { type: String, required: true },
    inspectionDate: { type: String, required: true },
    condition: { type: String, required: true },
    description: { type: String, required: true },
    evidencePhotos: [{ type: String }],
    proposedCharge: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ['PROPOSED', 'UNDER_REVIEW', 'APPROVED', 'DISPUTED', 'RESOLVED', 'WAIVED'],
      default: 'PROPOSED'
    },
    submittedByAdminId: { type: Number },
    submittedByAdminEmail: { type: String, required: true },
    customerResponse: { type: String },
    customerResponseDate: { type: Date },
    emailDeliveryStatus: {
      type: String,
      enum: ['sent', 'failed', 'pending'],
      default: 'pending'
    },
    emailDeliveryError: { type: String },
    emailSentAt: { type: Date }
  },
  {
    timestamps: true,
    collection: 'damage_reports'
  }
);

module.exports = createAdaptiveModel('DamageReport', DamageReportSchema);
