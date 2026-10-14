const { mongoose, createAdaptiveModel } = require('../db/mongo');

const ComplaintStatusHistorySchema = new mongoose.Schema(
  {
    complaintRef: { type: String, required: true, index: true },
    bookingId: { type: Number },
    fromStatus: { type: String, required: true },
    toStatus: { type: String, required: true },
    action: { type: String },
    changedBy: { type: String, required: true },
    comment: { type: String },
    customerNotified: { type: Boolean, default: false },
    emailStatus: {
      type: String,
      enum: ['sent', 'failed', 'skipped'],
      default: 'skipped'
    }
  },
  {
    timestamps: true,
    collection: 'complaint_status_histories'
  }
);

module.exports = createAdaptiveModel('ComplaintStatusHistory', ComplaintStatusHistorySchema);
