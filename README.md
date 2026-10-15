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

# MongoDB (Mongoose) - use MongoDB Atlas for managed high-availability in production
MONGODB_URI=mongodb+srv://<user>:<password>@cluster.mongodb.net/natya_vastra

# Optional Google Gemini AI assistant
GEMINI_API_KEY=...
GEMINI_MODEL=gemini-3.6-flash

# Persistent disk paths (configured on Render)
DB_PATH=/var/data/natya_vastra.db
UPLOAD_DIR=/var/data/uploads
```

---

## Production Deployment (Render + Vercel)

### Architecture
- **Backend API:** Hosted on **Render** (Node.js runtime, port 10000, bound to `0.0.0.0`).
- **Primary Database & Uploads:** Persistent Disk mounted at `/var/data` (stores `natya_vastra.db*` and `uploads/`).
- **Document Store:** **MongoDB Atlas** (inspections, damage reports, complaints, audit logs).
- **Frontend SPA:** Hosted on **Vercel** (`client/` root, Vite build, client-side rewrites in `vercel.json`).

---

### Step 1: Deploy Backend to Render

1. Log in to your [Render Dashboard](https://dashboard.render.com).
2. Click **New +** → **Blueprint** (or **Web Service**).
3. Connect your GitHub repository: `https://github.com/nehaa-0420/Natya-Vastra`.
4. If deploying via **render.yaml Blueprint**:
   - Render automatically detects `render.yaml` with the persistent disk and settings.
5. If creating a **Web Service manually**:
   - **Name:** `natya-vastra-api`
   - **Root Directory:** `server`
   - **Runtime:** `Node`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Plan:** `Starter` (required for persistent disk storage)
   - **Health Check Path:** `/api/health`
   - **Persistent Disk:**
     - Click **Disks** → **Add Disk**
     - Name: `natya-vastra-disk`
     - Mount Path: `/var/data`
     - Size: `1 GB`
   - **Environment Variables:**
     - `NODE_VERSION`: `22.12.0` (required for built-in `node:sqlite`)
     - `NODE_OPTIONS`: `--experimental-sqlite` (enables experimental SQLite module on Node 22)
     - `NODE_ENV`: `production`
     - `PORT`: `10000`
     - `HOST`: `0.0.0.0`
     - `JWT_SECRET`: generate a 32+ character random secret
     - `ADMIN_EMAIL`: your administrative login email
     - `ADMIN_PASSWORD`: your secure administrative password
     - `DB_PATH`: `/var/data/natya_vastra.db`
     - `UPLOAD_DIR`: `/var/data/uploads`
     - `MONGODB_URI`: your MongoDB Atlas connection string
     - `GEMINI_API_KEY`: your Google Gemini API key
     - `GEMINI_MODEL`: `gemini-3.6-flash`
     - `CORS_ORIGIN`: `https://YOUR-SITE.vercel.app` (update after deploying Vercel frontend)
     - `ALLOW_VERCEL_PREVIEWS`: `true`
6. Click **Create Web Service**.
7. Once deployed, verify the health check:
   `https://natya-vastra-api.onrender.com/api/health` → returns `{"status":"ok","services":{"database":"connected"}}`.

---

### Step 2: Deploy Frontend to Vercel

1. Log in to [Vercel](https://vercel.com) and click **Add New...** → **Project**.
2. Select your `Natya-Vastra` repository.
3. In project configuration:
   - **Root Directory:** click **Edit** and choose `client`.
   - **Framework Preset:** `Vite` (automatically detected).
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`
   - **Install Command:** `npm install`
4. Expand **Environment Variables**:
   - Name: `VITE_API_BASE`
   - Value: `https://YOUR-RENDER-SERVICE.onrender.com` (your deployed Render API URL, without trailing slash).
5. Click **Deploy**.
6. Once deployed, note your Vercel URL (e.g. `https://natya-vastra.vercel.app`).
7. Return to Render and update the backend's `CORS_ORIGIN` environment variable with your Vercel URL!

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
1. Health endpoint (`/api/health`) verifies SQLite and service status without leaking credentials.
2. A costume returned on time does not incur a late penalty.
3. A standard costume returned after the agreed one-day deadline incurs exactly one ₹250 late penalty.
4. The standard rental plus the late penalty totals ₹900 before any separately approved charges.
5. The administrator can record a costume inspection and submit a damage report.
6. The customer receives the damage-report email when email delivery is configured.
7. A customer can submit a complaint and track its status.
8. An administrator can review, respond to, and resolve complaints.
9. Customers cannot view another customer's complaint or private report.
10. Failed email delivery does not lose the complaint or inspection record.
11. All records and statuses persist correctly in MongoDB after restarting the server.

