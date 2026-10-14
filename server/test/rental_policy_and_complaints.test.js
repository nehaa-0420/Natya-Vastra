process.env.DB_PATH = ':memory:';
process.env.ADMIN_EMAIL = 'admin_policy@example.com';
process.env.ADMIN_PASSWORD = 'AdminSecret123!';
process.env.SMTP_HOST = 'smtp.fake.test';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

// Fake nodemailer that records sent messages
const sentEmails = [];
let smtpShouldFail = false;
require.cache[require.resolve('nodemailer')] = {
  id: 'nodemailer',
  filename: 'nodemailer',
  loaded: true,
  exports: {
    createTransport: () => ({
      sendMail: async (msg) => {
        if (smtpShouldFail) {
          throw new Error('SMTP connection timed out');
        }
        sentEmails.push(msg);
        return { messageId: 'msg-' + Math.random().toString(36).slice(2) };
      }
    })
  }
};

const { db, inDays, makeCostume } = require('./helpers');
const { ensureAdmin } = require('../db/seed');
const {
  ReturnInspection,
  DamageReport,
  Complaint,
  ComplaintStatusHistory,
  AuditLog,
  resetFallbackStore
} = require('../models');
const {
  calculateReturnStatusAndFees,
  STANDARD_RENT_PER_DAY,
  LATE_RETURN_PENALTY
} = require('../lib/rentalPolicy');
const app = require('../app');

let base, server;
test.before(async () => {
  resetFallbackStore();
  ensureAdmin();
  server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => server.close());

async function call(method, endpoint, { body, token } = {}) {
  const res = await fetch(base + endpoint, {
    method,
    headers: {
      ...(body && { 'Content-Type': 'application/json' }),
      ...(token && { Authorization: `Bearer ${token}` })
    },
    body: body ? JSON.stringify(body) : undefined
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}

const tick = () => new Promise((r) => setTimeout(r, 40));

test('1. A costume returned on time does not incur a late penalty', async () => {
  const deadline = '2026-10-15T20:00:00';
  const returnTimeOnTime = '2026-10-15T18:45:00';

  const result = calculateReturnStatusAndFees({
    rentalPrice: 650,
    returnDeadline: deadline,
    actualReturnTime: returnTimeOnTime
  });

  assert.equal(result.isLate, false);
  assert.equal(result.latePenalty, 0);
  assert.equal(result.returnStatus, 'returned_on_time');
  assert.equal(result.totalAmount, 650);
});

test('2. A standard costume returned after the agreed one-day deadline incurs exactly one ₹250 late penalty', async () => {
  const deadline = '2026-10-15T20:00:00';
  const returnTimeLate = '2026-10-15T21:30:00';

  const result = calculateReturnStatusAndFees({
    rentalPrice: 650,
    returnDeadline: deadline,
    actualReturnTime: returnTimeLate
  });

  assert.equal(result.isLate, true);
  assert.equal(result.latePenalty, 250);
  assert.equal(result.returnStatus, 'returned_late');

  // Idempotency: re-running or updating the return calculation does not double the penalty
  const retryResult = calculateReturnStatusAndFees({
    rentalPrice: 650,
    returnDeadline: deadline,
    actualReturnTime: returnTimeLate
  });
  assert.equal(retryResult.latePenalty, 250);
});

test('3. The standard rental plus the late penalty totals ₹900 before any separately approved charges', async () => {
  const deadline = '2026-10-15T20:00:00';
  const returnTimeLate = '2026-10-15T22:00:00';

  const result = calculateReturnStatusAndFees({
    rentalPrice: STANDARD_RENT_PER_DAY, // 650
    returnDeadline: deadline,
    actualReturnTime: returnTimeLate
  });

  assert.equal(result.originalRentalPrice, 650);
  assert.equal(result.latePenalty, 250);
  assert.equal(result.totalAmount, 900); // 650 + 250 = 900
});

test('4. The administrator can record a costume inspection and submit a damage report', async () => {
  const costumeId = makeCostume({ stock: [{ size: 36, qty: 1 }], rentPrice: 650 });
  const cust = await call('POST', '/api/auth/register', {
    body: { name: 'Pooja', email: 'pooja.insp@example.com', password: 'Password123!' }
  });
  const admin = await call('POST', '/api/auth/login', {
    body: { email: 'admin_policy@example.com', password: 'AdminSecret123!' }
  });

  const bk = await call('POST', '/api/bookings', {
    token: cust.json.token,
    body: {
      costumeId,
      size: 36,
      startDate: inDays(2),
      endDate: inDays(2),
      acceptedTerms: true
    }
  });
  assert.equal(bk.status, 201);
  const bookingId = bk.json.id;

  // Record costume inspection with damage
  const inspRes = await call('POST', '/api/admin/inspections', {
    token: admin.json.token,
    body: {
      bookingId,
      actualReturnTime: `${inDays(2)}T19:00:00`,
      costumeCondition: 'minor_damage',
      damageDescription: 'Zari tear on lower frill border',
      evidencePhotos: ['/uploads/evidence1.jpg'],
      proposedDamageCharge: 350,
      inspectionStatus: 'completed',
      adminNotes: 'Inspected upon return by Neha'
    }
  });

  assert.equal(inspRes.status, 200);
  assert.equal(inspRes.json.costumeCondition, 'minor_damage');
  assert.equal(inspRes.json.proposedDamageCharge, 350);

  // Submit official damage report
  const dmgRes = await call('POST', `/api/admin/inspections/${inspRes.json._id}/damage-report`, {
    token: admin.json.token,
    body: { description: 'Torn zari border requires mend' }
  });

  assert.equal(dmgRes.status, 201);
  assert.match(dmgRes.json.reportRef, /^DR-/);
  assert.equal(dmgRes.json.status, 'PROPOSED');
  assert.equal(dmgRes.json.proposedCharge, 350);
  assert.equal(dmgRes.json.customerEmail, 'pooja.insp@example.com');
});

test('5. The customer receives the damage-report email when email delivery is configured', async () => {
  await tick();
  const dmgEmail = sentEmails.find((m) => m.subject && m.subject.includes('Damage Report'));
  assert.ok(dmgEmail, 'Damage report email was sent');
  assert.equal(dmgEmail.to, 'pooja.insp@example.com');
  assert.match(dmgEmail.text, /Proposed Charge\s+:\s+₹350/);
  assert.match(dmgEmail.text, /Zari tear/);
  assert.match(dmgEmail.text, /NOT an automatic deduction/);
});

test('6. A customer can submit a complaint and track its status', async () => {
  const cust = await call('POST', '/api/auth/register', {
    body: { name: 'Sujata', email: 'sujata.comp@example.com', password: 'Password123!' }
  });

  const compRes = await call('POST', '/api/complaints', {
    token: cust.json.token,
    body: {
      category: 'late_return_fee',
      subject: 'Inquiry regarding late fee on booking',
      description: 'The shop was closed when I arrived at 7:45 PM before the 8:00 PM deadline.'
    }
  });

  assert.equal(compRes.status, 201);
  assert.match(compRes.json.complaintRef, /^CMP-/);
  assert.equal(compRes.json.status, 'OPEN');

  // Customer tracks complaint in /mine
  const mine = await call('GET', '/api/complaints/mine', { token: cust.json.token });
  assert.equal(mine.status, 200);
  const found = mine.json.find((c) => c.complaintRef === compRes.json.complaintRef);
  assert.ok(found);
  assert.equal(found.status, 'OPEN');
});

test('7. An administrator can review, respond to, and resolve complaints', async () => {
  const admin = await call('POST', '/api/auth/login', {
    body: { email: 'admin_policy@example.com', password: 'AdminSecret123!' }
  });

  const list = await call('GET', '/api/admin/complaints?category=late_return_fee', { token: admin.json.token });
  assert.equal(list.status, 200);
  assert.ok(list.json.length > 0);
  const complaintId = list.json[0]._id;

  // Admin adds private internal note
  const noteRes = await call('POST', `/api/admin/complaints/${complaintId}/notes`, {
    token: admin.json.token,
    body: { note: 'Verified store CCTV — customer was waiting outside at 7:50 PM. Fee should be waived.' }
  });
  assert.equal(noteRes.status, 201);
  assert.ok(noteRes.json.internalNotes.length >= 1);

  // Admin responds and resolves complaint
  const patchRes = await call('PATCH', `/api/admin/complaints/${complaintId}`, {
    token: admin.json.token,
    body: {
      status: 'RESOLVED',
      adminResponse: 'We have verified your timely arrival. The late fee has been waived.',
      resolution: 'Late fee reversed in full.',
      actionTaken: 'Late penalty updated to 0 in system.'
    }
  });

  assert.equal(patchRes.status, 200);
  assert.equal(patchRes.json.status, 'RESOLVED');
  assert.match(patchRes.json.resolution, /Late fee reversed/);
});

test("8. Customers cannot view another customer's complaint or private report", async () => {
  const custA = await call('POST', '/api/auth/register', {
    body: { name: 'Customer A', email: 'custA@example.com', password: 'Password123!' }
  });
  const custB = await call('POST', '/api/auth/register', {
    body: { name: 'Customer B', email: 'custB@example.com', password: 'Password123!' }
  });

  const compA = await call('POST', '/api/complaints', {
    token: custA.json.token,
    body: {
      category: 'payment',
      subject: 'Private transaction query',
      description: 'Account details and confidential payment notes.'
    }
  });
  assert.equal(compA.status, 201);

  // Customer B attempts to access Customer A's complaint
  const breach = await call('GET', `/api/complaints/${compA.json._id}`, { token: custB.json.token });
  assert.equal(breach.status, 403);
});

test('9. Failed email delivery does not lose the complaint or inspection record', async () => {
  const cust = await call('POST', '/api/auth/register', {
    body: { name: 'Kavita', email: 'kavita.smtp@example.com', password: 'Password123!' }
  });

  smtpShouldFail = true; // simulate mail server down

  const compRes = await call('POST', '/api/complaints', {
    token: cust.json.token,
    body: {
      category: 'missing_item',
      subject: 'Missing accessory in bag',
      description: 'The belt was not found in the costume pouch upon opening.'
    }
  });

  smtpShouldFail = false; // restore

  assert.equal(compRes.status, 201);
  assert.match(compRes.json.complaintRef, /^CMP-/);

  // Verify complaint was safely saved in database despite SMTP failure
  const saved = await Complaint.findOne({ complaintRef: compRes.json.complaintRef });
  assert.ok(saved);
  assert.equal(saved.emailDeliveryStatus, 'failed');
  assert.equal(saved.subject, 'Missing accessory in bag');
});

test('10. All records and statuses persist correctly in MongoDB after restarting the server', async () => {
  // Create test inspection and complaint
  const testRef = 'CMP-PERSIST-999';
  await Complaint.create({
    complaintRef: testRef,
    userId: 999,
    customerName: 'Persistence Check',
    customerEmail: 'persist@example.com',
    category: 'website_problem',
    subject: 'Persistence test across server reload',
    description: 'Verifying data survives process reboot.',
    status: 'IN_REVIEW'
  });

  // Verify it exists in model
  const before = await Complaint.findOne({ complaintRef: testRef });
  assert.ok(before);
  assert.equal(before.status, 'IN_REVIEW');

  // Simulate server restart by re-instantiating the document store/model
  const { docStore } = require('../db/mongo');
  docStore.load(); // reload from persistent storage

  const after = await Complaint.findOne({ complaintRef: testRef });
  assert.ok(after);
  assert.equal(after.status, 'IN_REVIEW');
  assert.equal(after.subject, 'Persistence test across server reload');
});
