/**
 * lib/email.js
 *
 * Sends transactional emails via nodemailer.
 * - If SMTP_HOST is not configured, all calls are silent no-ops.
 * - Errors are caught and logged; they never bubble up to break a request.
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
 * Send an email. Failures are logged but never thrown.
 * @param {{ to: string, subject: string, text: string, html?: string }} opts
 */
async function sendMail({ to, subject, text, html }) {
  const transporter = getTransporter();
  if (!transporter) return; // silently skip when SMTP is not set up

  try {
    await transporter.sendMail({
      from: process.env.EMAIL_FROM || 'Natya Vastra <noreply@natyavastra.in>',
      to,
      subject,
      text,
      html: html || text
    });
  } catch (err) {
    console.error('[email] Failed to send to', to, ':', err.message);
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
    `  Costume : ${booking.costumeName} (${booking.categoryName})`,
    `  Size    : ${booking.size} inches`,
    `  Dates   : ${booking.startDate} to ${booking.endDate} (${booking.days} day${booking.days > 1 ? 's' : ''})`,
    booking.depositAmount
      ? `  Deposit : ₹${booking.depositAmount} ${booking.depositStatus === 'paid' ? '(paid ✓)' : '(pending)'}`
      : '',
    '',
    `We confirm every booking personally. We'll be in touch soon!`,
    '',
    `— Natya Vastra / Chiguru Costumes`,
    `  WhatsApp: +91 99005 99872`
  ].filter((l) => l !== undefined).join('\n');
  return { to: user.email, subject, text };
}

function bookingConfirmedEmail(booking, user) {
  const subject = `Your booking is confirmed — ${booking.costumeName}`;
  const text = [
    `Hi ${user.name},`,
    '',
    `Great news! Your booking has been confirmed:`,
    '',
    `  Costume : ${booking.costumeName}`,
    `  Size    : ${booking.size} inches`,
    `  Dates   : ${booking.startDate} to ${booking.endDate}`,
    booking.estimatedTotal ? `  Estimated total : ₹${booking.estimatedTotal}` : '',
    '',
    `Please collect the costume at our store. Contact us on WhatsApp if you have any questions.`,
    '',
    `— Natya Vastra / Chiguru Costumes`,
    `  WhatsApp: +91 99005 99872`
  ].filter((l) => l !== undefined).join('\n');
  return { to: user.email, subject, text };
}

function bookingCancelledEmail(booking, user) {
  const subject = `Booking cancelled — ${booking.costumeName}`;
  const text = [
    `Hi ${user.name},`,
    '',
    `Your booking for ${booking.costumeName} (${booking.startDate} to ${booking.endDate}) has been cancelled.`,
    '',
    `If you have already paid a deposit, please contact us on WhatsApp to arrange a refund.`,
    '',
    `— Natya Vastra / Chiguru Costumes`,
    `  WhatsApp: +91 99005 99872`
  ].join('\n');
  return { to: user.email, subject, text };
}

module.exports = { sendMail, bookingCreatedEmail, bookingConfirmedEmail, bookingCancelledEmail };
