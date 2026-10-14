/**
 * lib/email.js
 *
 * Sends transactional emails via nodemailer.
 * - If SMTP_HOST is not configured, returns { success: false, missingConfig: true }.
 * - Errors are caught, logged, and returned with { success: false, error }; they never crash the caller.
 */
const nodemailer = require('nodemailer');

let _transporter = null;

function getTransporter() {
  if (_transporter) return _transporter;
  const host = process.env.SMTP_HOST;
  if (!host) return null; // email not configured

  _transporter = nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined
  });
  return _transporter;
}

/**
 * Send an email. Returns delivery status without throwing.
 * @param {{ to: string, subject: string, text: string, html?: string }} opts
 * @returns {Promise<{ success: boolean, missingConfig?: boolean, error?: string, messageId?: string }>}
 */
async function sendMail({ to, subject, text, html }) {
  try {
    const transporter = getTransporter();
    if (!transporter) {
      return { success: false, missingConfig: true, error: 'SMTP is not configured in environment variables.' };
    }
    const info = await transporter.sendMail({
      from: process.env.EMAIL_FROM || 'Natya Vastra <noreply@natyavastra.in>',
      to,
      subject,
      text,
      html: html || text
    });
    return { success: true, messageId: info?.messageId || 'sent' };
  } catch (err) {
    console.error('[email] Failed to send to', to, ':', err.message);
    return { success: false, error: err.message };
  }
}

// ── Pre-built booking emails ──────────────────────────────────────────────

function bookingCreatedEmail(booking, user) {
  const subject = `Booking request received — ${booking.costumeName}`;
  const text = [
    `Hi ${user.name},`,
    '',
    `Thank you for your booking request! Here are the details:`,
    '',
    `  Booking Ref: #${booking.id}`,
    `  Costume    : ${booking.costumeName} (${booking.categoryName || ''})`,
    `  Size(s)    : ${booking.sizeSummary || `${booking.size} inches`}`,
    `  Pieces     : ${booking.totalQuantity || 1} item(s)`,
    `  Dates      : ${booking.startDate} to ${booking.endDate} (${booking.days} day${booking.days > 1 ? 's' : ''})`,
    booking.returnDeadline ? `  Return By  : ${booking.returnDeadline}` : null,
    booking.depositAmount
      ? `  Deposit    : ₹${booking.depositAmount} ${booking.depositStatus === 'paid' ? '(paid ✓)' : '(pending)'}`
      : null,
    '',
    `Rental terms accepted: Yes (1-day standard ₹650 / ₹250 late return penalty policy)`,
    '',
    `We confirm every booking personally. We'll be in touch soon!`,
    '',
    `— Natya Vastra / Chiguru Costumes`,
    `  WhatsApp: +91 99005 99872`
  ].filter((l) => l !== null).join('\n');
  return { to: user.email, subject, text };
}

function bookingConfirmedEmail(booking, user) {
  const subject = `Your booking is confirmed — ${booking.costumeName}`;
  const text = [
    `Hi ${user.name},`,
    '',
    `Great news! Your booking has been confirmed:`,
    '',
    `  Booking Ref: #${booking.id}`,
    `  Costume    : ${booking.costumeName}`,
    `  Size(s)    : ${booking.sizeSummary || `${booking.size} inches`}`,
    `  Pieces     : ${booking.totalQuantity || 1} item(s)`,
    `  Dates      : ${booking.startDate} to ${booking.endDate}`,
    booking.returnDeadline ? `  Return By  : ${booking.returnDeadline}` : null,
    booking.estimatedTotal ? `  Estimated total : ₹${booking.estimatedTotal}` : null,
    '',
    `Please collect the costume at our store. Please note that returning after the deadline incurs a ₹250 late penalty.`,
    '',
    `— Natya Vastra / Chiguru Costumes`,
    `  WhatsApp: +91 99005 99872`
  ].filter((l) => l !== null).join('\n');
  return { to: user.email, subject, text };
}

function bookingCancelledEmail(booking, user) {
  const subject = `Booking cancelled — ${booking.costumeName}`;
  const text = [
    `Hi ${user.name},`,
    '',
    `Your booking #${booking.id} for ${booking.costumeName} (${booking.startDate} to ${booking.endDate}) has been cancelled.`,
    '',
    `If you have already paid a deposit, please contact us on WhatsApp to arrange a refund.`,
    '',
    `— Natya Vastra / Chiguru Costumes`,
    `  WhatsApp: +91 99005 99872`
  ].join('\n');
  return { to: user.email, subject, text };
}

// ── Rental Policy & Complaint Emails ──────────────────────────────────────

function lateReturnPenaltyEmail({ booking, penaltyAmount, rentalAmount, totalAmount, returnDeadline, actualReturnTime }) {
  const subject = `Late Return Notice & Penalty Recorded — Booking #${booking.id}`;
  const text = [
    `Hi ${booking.user?.name || 'Valued Customer'},`,
    '',
    `This is a notification regarding your costume rental return for Booking #${booking.id} (${booking.costumeName || 'Costume'}).`,
    '',
    `Return Details:`,
    `  Agreed Return Deadline : ${returnDeadline || booking.returnDeadline || 'End of rental period'}`,
    `  Actual Return Recorded : ${actualReturnTime || 'After return deadline'}`,
    `  Status                 : Returned Late`,
    '',
    `Fee Breakdown:`,
    `  Original Rental Amount : ₹${rentalAmount}`,
    `  Late Return Penalty    : ₹${penaltyAmount}`,
    `  Updated Total Amount   : ₹${totalAmount}`,
    '',
    `As stated in our rental policy, standard rentals cover 1 day, and a ₹250 late fee is charged when returned after the agreed return deadline.`,
    '',
    `If you believe there was a clerical error in recording your return time, please reply to this email, contact us on WhatsApp, or submit a complaint through your account dashboard.`,
    '',
    `— Natya Vastra / Chiguru Costumes`,
    `  WhatsApp: +91 99005 99872`
  ].join('\n');
  return { to: booking.user?.email || booking.customerEmail, subject, text };
}

function damageReportSubmittedEmail(report) {
  const subject = `Costume Return Inspection & Damage Report — Booking #${report.bookingId}`;
  const text = [
    `Hi ${report.customerName},`,
    '',
    `An inspection was conducted upon return of your rental costume (${report.costumeName}) for Booking #${report.bookingId}.`,
    '',
    `Inspection Summary:`,
    `  Report Reference : ${report.reportRef}`,
    `  Inspection Date  : ${report.inspectionDate}`,
    `  Condition Found  : ${report.condition}`,
    `  Description      : ${report.description}`,
    report.evidencePhotos && report.evidencePhotos.length
      ? `  Supporting Photos: ${report.evidencePhotos.length} photo(s) attached / available in your account`
      : null,
    '',
    `Proposed Damage Assessment:`,
    `  Proposed Charge  : ₹${report.proposedCharge}`,
    `  Status           : ${report.status}`,
    `  Note             : This is a proposed assessment entered by the administrator for review, NOT an automatic deduction.`,
    '',
    `What to do next:`,
    `You can view the full report with photos in your Natya Vastra account under "Damage Reports".`,
    `If you have questions or disagree with this assessment, you can submit a response or dispute through your account dashboard or contact us directly.`,
    '',
    `— Natya Vastra / Chiguru Costumes`,
    `  WhatsApp: +91 99005 99872`
  ].filter((l) => l !== null).join('\n');
  return { to: report.customerEmail, subject, text };
}

function complaintReceivedEmail(complaint) {
  const subject = `Complaint received — Ref: ${complaint.complaintRef}`;
  const text = [
    `Hi ${complaint.customerName},`,
    '',
    `We have received your problem report / complaint. Our team has been notified and is looking into the matter.`,
    '',
    `Complaint Details:`,
    `  Reference Number : ${complaint.complaintRef}`,
    complaint.bookingId ? `  Booking Ref      : #${complaint.bookingId}` : null,
    `  Category         : ${complaint.category.replace(/_/g, ' ')}`,
    `  Subject          : ${complaint.subject}`,
    `  Current Status   : ${complaint.status}`,
    '',
    `You can track the status and updates for your complaint anytime by logging into your account under "My Complaints".`,
    '',
    `We aim to review and resolve all issues within 24–48 hours.`,
    '',
    `— Natya Vastra / Chiguru Costumes`,
    `  WhatsApp: +91 99005 99872`
  ].filter((l) => l !== null).join('\n');
  return { to: complaint.customerEmail, subject, text };
}

function complaintStatusUpdatedEmail(complaint, { status, adminResponse, resolution, actionTaken } = {}) {
  const subject = `Update on Complaint ${complaint.complaintRef} — Status: ${status || complaint.status}`;
  const text = [
    `Hi ${complaint.customerName},`,
    '',
    `There is an update on your complaint (${complaint.complaintRef}):`,
    '',
    `  Subject        : ${complaint.subject}`,
    `  New Status     : ${status || complaint.status}`,
    adminResponse ? `  Shop Response  : ${adminResponse}` : null,
    resolution ? `  Resolution     : ${resolution}` : null,
    actionTaken ? `  Action Taken   : ${actionTaken}` : null,
    '',
    `You can review the full details and submit any further remarks in your Natya Vastra account.`,
    '',
    `— Natya Vastra / Chiguru Costumes`,
    `  WhatsApp: +91 99005 99872`
  ].filter((l) => l !== null).join('\n');
  return { to: complaint.customerEmail, subject, text };
}

function complaintResolvedEmail(complaint) {
  const subject = `Complaint Resolved — Ref: ${complaint.complaintRef}`;
  const text = [
    `Hi ${complaint.customerName},`,
    '',
    `Your complaint (${complaint.complaintRef}) regarding "${complaint.subject}" has been marked as RESOLVED.`,
    '',
    complaint.resolution ? `Resolution: ${complaint.resolution}` : null,
    complaint.actionTaken ? `Action Taken: ${complaint.actionTaken}` : null,
    complaint.adminResponse ? `Admin Response: ${complaint.adminResponse}` : null,
    '',
    `Thank you for your patience. If this does not fully address your issue, please feel free to reopen the complaint from your account or contact us on WhatsApp.`,
    '',
    `— Natya Vastra / Chiguru Costumes`,
    `  WhatsApp: +91 99005 99872`
  ].filter((l) => l !== null).join('\n');
  return { to: complaint.customerEmail, subject, text };
}

// Fire-and-forget helper
function notify(message) {
  sendMail(message).catch(() => {});
}

module.exports = {
  sendMail,
  notify,
  bookingCreatedEmail,
  bookingConfirmedEmail,
  bookingCancelledEmail,
  lateReturnPenaltyEmail,
  damageReportSubmittedEmail,
  complaintReceivedEmail,
  complaintStatusUpdatedEmail,
  complaintResolvedEmail
};
