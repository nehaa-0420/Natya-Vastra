# Natya Vastra — costume rental platform

Full-stack website for **Natya Vastra / Chiguru Costumes**, a Bengaluru costume
rental and purchase business: customers browse real stock by size and date, book a
costume online, and the shop manages everything from an admin dashboard.

## Features

| Area | What it does |
|------|--------------|
| **Catalog** | 36 costumes in 7 categories with real size ranges and per-size stock taken from the shop's PDF menu |
| **Search & filters** | Text search, category, size, and *date availability* ("show me what is free 19–21 Oct in size 36") |
| **Booking engine** | Pick size and dates; stock is checked per day so overlapping bookings can't oversell a costume |
| **Accounts** | Sign up / log in (JWT), wishlist (♥), "My bookings" with cancel |
| **Admin dashboard** | Confirm / cancel / mark bookings returned, add costumes with photo upload, edit prices and stock per size, hide costumes, read enquiries |
| **WhatsApp** | Order form and booking confirmations hand off to WhatsApp; admin can open a customer chat in one click |

## Tech stack

- **Frontend:** React 18 + Vite, React Router, plain CSS
- **Backend:** Node.js + Express (REST API)
- **Database:** SQLite through Node's built-in `node:sqlite` (needs **Node 22.5+**; no native build tools)
- **Security:** scrypt password hashing, JWT auth with role checks, rate-limited login, upload type/size limits, parameterised SQL
- **Tests:** Node's built-in test runner (21 tests: booking logic, seed data, auth, permissions, uploads)

## Project structure

```
client/                 React app
  src/pages/            Home, Browse, Costume (booking), Auth, Account, Admin
  src/components/       Navbar, CostumeCard, Lightbox, ...
  src/context/          AuthContext (login state + wishlist)
  src/api.js            every call to the backend
server/
  app.js, server.js     Express app / entry point
  db/                   schema.sql, seed.js, sizes.json (stock from the PDF)
  lib/availability.js   the booking engine
  routes/               auth, costumes, bookings, wishlist, admin, ...
  test/                 automated tests
```

## Running it locally

Two terminals.

```bash
# 1) API
cd server
npm install
cp .env.example .env      # on Windows: copy .env.example .env
npm run dev               # first start loads the catalog and creates the admin account

# 2) website
cd client
npm install
npm run dev               # http://localhost:5173
```

**Admin login:** the email and password from `server/.env` (`ADMIN_EMAIL`, `ADMIN_PASSWORD`;
defaults `admin@natyavastra.local` / `ChangeMe123!`). Change them before going live — the
admin account is created once, the first time the server starts on an empty database.

> **Upgrading from an older version of this project?** The database layout changed.
> Delete `server/db/natya_vastra.db*` once and start the server again.

### Tests

```bash
cd server && npm test
```

## How booking availability works

Each costume has stock per size (`costume_stock`). A booking covers whole days, both ends
inclusive. For a requested range the engine looks at **each day** and counts how many pending or
confirmed bookings cover it; the busiest day decides how many pieces are left. So a booking for
1–3 Oct and another for 4–6 Oct don't block a third for 2–5 Oct when two pieces exist. Costumes
for which the PDF only gives a total (the kids' sizes) use *pooled* stock: any size within the
range, counted together. Saree sets and the Devi costume have no stock data, so they are
"enquire on WhatsApp" instead of bookable. Booking runs inside a locked transaction so two people
can't take the last piece at the same moment.

## Updating stock and prices

Use **Admin → Costumes & stock**. Rent prices are blank (shown as "price on request") until you
enter them. `server/db/sizes.json` only seeds the *first* load; after that the admin dashboard is
the source of truth. Re-seeding (`npm run seed`) refuses to run if bookings exist; `--force` wipes them.

## API overview

Public: `GET /api/categories`, `/api/costumes?q&category&size&from&to`, `/api/costumes/:id`,
`/api/costumes/:id/availability?start&end`, `POST /api/enquiries`, `POST /api/auth/register|login`.
Logged in: `POST /api/bookings`, `GET /api/bookings/mine`, `POST /api/bookings/:id/cancel`, `/api/wishlist`.
Admin only: `/api/admin/stats|bookings|costumes|enquiries`.

## Roadmap

- Razorpay deposit payment
- AI costume assistant page
- Email / WhatsApp booking confirmations
- Deployment (hosted site + database backups)
