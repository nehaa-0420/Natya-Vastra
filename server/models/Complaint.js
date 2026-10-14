const { mongoose, createAdaptiveModel } = require('../db/mongo');

const ComplaintSchema = new mongoose.Schema(
  {
    complaintRef: { type: String, required: true, unique: true, index: true },
    bookingId: { type: Number, index: true },
    bookingRef: { type: String },
    userId: { type: Number, required: true, index: true },
    customerName: { type: String, required: true },
    customerEmail: { type: String, required: true },
    customerPhone: { type: String },
    category: {
      type: String,
      required: true,
      enum: [
        'late_return_fee',
        'damage_report',
        'payment',
        'booking_cancellation',
        'missing_item',
        'delivery_collection',
        'website_problem',
        'other'
      ]
    },
    subject: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    attachmentUrl: { type: String },
    status: {
      type: String,
      required: true,
      default: 'OPEN',
      enum: ['OPEN', 'IN_REVIEW', 'WAITING_FOR_CUSTOMER', 'RESOLVED', 'CLOSED']
    },
    adminResponse: { type: String },
    resolution: { type: String },
    actionTaken: { type: String },
    internalNotes: [
      {
        note: { type: String, required: true },
        adminId: { type: Number },
        adminEmail: { type: String, required: true },
        createdAt: { type: Date, default: Date.now }
      }
    ],
    statusHistory: [
      {
        fromStatus: { type: String, required: true },
        toStatus: { type: String, required: true },
        action: { type: String },
        changedBy: { type: String, required: true },
        comment: { type: String },
        createdAt: { type: Date, default: Date.now }
      }
    ],
    reopenedCount: { type: Number, default: 0 },
    emailDeliveryStatus: {
      type: String,
      enum: ['sent', 'failed', 'pending', 'skipped'],
      default: 'pending'
    },
    emailDeliveryError: { type: String }
  },
  {
    timestamps: true,
    collection: 'complaints'
  }
);

module.exports = createAdaptiveModel('Complaint', ComplaintSchema);
