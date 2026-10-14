# Natya Vastra — Bharatanatyam Costume Rental Platform

Full-stack website for **Natya Vastra / Chiguru Costumes**, a Bengaluru costume
rental and purchase business: customers browse real stock by size and date, book a
costume online, report issues, and the shop manages bookings, returns, damage inspections,
and complaints from an admin dashboard.

---

## Rental Terms & Conditions Policy

Before confirming any booking, customers review and accept the official Natya Vastra rental policy:

1. **Standard costume rental:** ₹650 for one day.
2. **Saree costume rental:** ₹1,500 per order, according to special-order rules.
3. **Late return penalty:** If returned after the agreed return deadline, charge a late-return penalty of ₹250. Total for a standard costume returned late: ₹650 + ₹250 = ₹900 before any separately approved charges.
4. **Costume damage:** Costumes must be returned in the condition received, allowing for normal wear from proper use. Any suspected damage is inspected and documented by the administrator.
5. **Damage charges:** Charges are never automatically deducted or invented. The administrator inspects, documents evidence and an explanation, and enters a proposed charge for review.
6. **Complaint handling:** Customers and administrators can report problems regarding bookings, payments, late returns, missing accessories, or costume damage.
7. **Customer notifications:** Customers receive email notifications for booking confirmations, return deadlines, recorded late fees, damage reports, and complaint updates.

---

## Features

| Area | What it does |
|------|--------------|
| **Catalog** | 36 costumes in 7 categories with real size ranges and stock from the shop's PDF menu |
| **Search & filters** | Text search, category, size, and date availability |
| **Booking engine** | Pick size and dates; stock checked per day to prevent double booking; records agreed return deadline |
| **Rental terms acceptance** | Compulsory terms checkbox before booking; rental duration and return deadline displayed on confirmations and account |
| **Late return calculation** | Backend-calculated late return penalties (₹250 when actual return exceeds return deadline; ₹650 + ₹250 = ₹900 total); idempotent fee application; audit log for corrections |
| **Return inspection form** | Admin dashboard form to inspect returned costumes (actual return time, condition, damage description, evidence photos, proposed charges, admin notes) |
| **Damage reports** | Official damage report generation with photos, customer email dispatch, status tracking, and dispute/response options |
| **Customer complaints** | Customer-facing "Report a Problem / Submit Complaint" form with category, description, attachments, unique `CMP-...` reference, and progress tracking |
| **Admin complaint management** | Search, filter, add private internal notes, add public responses, update status (`OPEN`, `IN_REVIEW`, `WAITING_FOR_CUSTOMER`, `RESOLVED`, `CLOSED`), record resolution, reopen complaints, and retry failed emails |
| **MongoDB & Mongoose integration** | Mongoose models for `ReturnInspection`, `DamageReport`, `Complaint`, `ComplaintStatusHistory`, and `AuditLog` with resilient storage and migration script |
| **Accounts & wishlist** | Sign up / login (JWT), wishlist (♥), "My bookings" with deadlines, "My complaints", and "Damage reports" |
| **Payments & Razorpay** | 50% deposit collection via Razorpay test mode |
| **WhatsApp handoff** | Quick WhatsApp chat handoff for custom inquiries, sizes, and questions |

---

## Tech Stack

- **Frontend:** React 18 + Vite, React Router, plain CSS
- **Backend:** Node.js + Express (REST API)
- **Database:**
  - SQLite via built-in `node:sqlite` (Node 22.5+)
  - MongoDB via **Mongoose** for return inspections, damage reports, complaints, complaint status history, and audit logs (with fallback persistence when running offline)
- **Security:** scrypt password hashing, JWT auth with role checks, rate limiting, upload restrictions (max 5 MB, JPG/PNG/WebP/PDF), parameterized SQL
- **Email:** Nodemailer SMTP with transactional templates for complaints, damage reports, late fees, and booking updates

---

## Environment Variables

Configure these in `server/.env` (see `server/.env.example`):

```bash
PORT=4000
CORS_ORIGIN=http://localhost:5173
JWT_SECRET=your-random-secret-key

ADMIN_EMAIL=admin@natyavastra.local
ADMIN_PASSWORD=your-secure-password

# Razorpay (optional in dev)
RAZORPAY_KEY_ID=rzp_test_...
RAZORPAY_KEY_SECRET=...

# Nodemailer SMTP
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=you@gmail.com
SMTP_PASS=app-password
EMAIL_FROM="Natya Vastra <you@gmail.com>"

# MongoDB (Mongoose)
MONGODB_URI=mongodb://localhost:27017/natya_vastra

# Optional Google Gemini AI assistant
GEMINI_API_KEY=...
GEMINI_MODEL=gemini-3.6-flash
```

---

## SQLite to MongoDB Migration

To migrate existing SQLite data (categories, costumes, stock, users, bookings, payments, enquiries) into MongoDB collections:

```bash
cd server
npm run migrate:mongo
```

The migration preserves all existing customer accounts, bookings, and costume IDs without duplicating records.

---

## Running Locally on Windows

Two PowerShell terminals:

```bash
# 1) Start API Server
cd server
npm install
copy .env.example .env     # if .env not created yet
npm run dev

# 2) Start Website
cd client
npm install
npm run dev                # http://localhost:5173
```

---

## Automated Test Suite

Run the automated test runner in `server/`:

```bash
cd server
npm test
```

### Verified Scenarios:
1. A costume returned on time does not incur a late penalty.
2. A standard costume returned after the agreed one-day deadline incurs exactly one ₹250 late penalty.
3. The standard rental plus the late penalty totals ₹900 before any separately approved charges.
4. The administrator can record a costume inspection and submit a damage report.
5. The customer receives the damage-report email when email delivery is configured.
6. A customer can submit a complaint and track its status.
7. An administrator can review, respond to, and resolve complaints.
8. Customers cannot view another customer's complaint or private report.
9. Failed email delivery does not lose the complaint or inspection record.
10. All records and statuses persist correctly after restarting the server.
