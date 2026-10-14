const { mongoose, createAdaptiveModel } = require('../db/mongo');

const AuditLogSchema = new mongoose.Schema(
  {
    entityType: {
      type: String,
      required: true,
      enum: ['inspection', 'late_fee', 'booking', 'complaint', 'damage_report']
    },
    entityId: { type: String, required: true },
    bookingId: { type: Number },
    action: { type: String, required: true },
    performedBy: { type: String, required: true },
    reason: { type: String, required: true },
    previousData: { type: mongoose.Schema.Types.Mixed },
    newData: { type: mongoose.Schema.Types.Mixed }
  },
  {
    timestamps: true,
    collection: 'audit_logs'
  }
);

module.exports = createAdaptiveModel('AuditLog', AuditLogSchema);
