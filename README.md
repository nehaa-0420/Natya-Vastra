# Natya Vastra

Full-stack website for Natya Vastra — a Bengaluru-based Bharatanatyam costume
atelier. Catalog galleries organized by costume type, a photo gallery, and a
WhatsApp-integrated order form, all backed by a real API and database.

## Stack

- **Frontend:** React + Vite (JSX components, plain CSS)
- **Backend:** Node.js + Express
- **Database:** SQLite, via Node's built-in `node:sqlite` module — no separate DB server, and no native compiler needed (this needs **Node.js 22.5+**; check with `node --version`)

## Structure

```
natya-vastra/
├── client/     # React frontend
│   ├── src/
│   │   ├── components/   # Navbar, Hero, Collections, CategoryModal, Gallery, Contact, Footer
│   │   ├── styles/       # one CSS file per component + global.css design tokens
│   │   ├── api.js        # fetch wrapper for the backend
│   │   └── App.jsx
│   └── public/assets/images/   # costume photos
└── server/     # Node/Express API
    ├── db/
    │   ├── schema.sql    # categories, category_images, gallery_images, enquiries
    │   ├── seed.js        # populates the DB with the real catalog
    │   └── index.js
    ├── routes/
    └── server.js
```

## Running it locally

You need two terminals — one for the API, one for the frontend.

**1. Backend**
```bash
cd server
npm install
cp .env.example .env
npm run seed      # creates and fills the SQLite database (run once)
npm run dev        # starts the API on http://localhost:4000
```

**2. Frontend**
```bash
cd client
npm install
npm run dev        # starts the site on http://localhost:5173
```

Open http://localhost:5173 — the site fetches categories, gallery images, and
handles order enquiries from the API in `server/`.

## How the data flows

- **Collections** and the **gallery** are fetched from `GET /api/categories`
  and `GET /api/gallery` — both read from the SQLite database, not hardcoded
  arrays. To add or edit a costume category, edit `server/db/seed.js` and
  re-run `npm run seed` (or, longer-term, build a small admin form that
  writes to the `categories`/`category_images` tables directly).
- **Order enquiries**: submitting the contact form saves the enquiry to the
  `enquiries` table (so you have a permanent record) *and* opens WhatsApp
  with the same details prefilled, since that's still the fastest way to
  actually talk to a customer.

## Deploying

- **Frontend:** any static host (Vercel, Netlify, GitHub Pages) — run
  `npm run build` in `client/` and deploy the `dist/` folder. Set
  `VITE_API_BASE` to your deployed backend's URL before building.
- **Backend:** any Node host (Render, Railway, a small VPS). Set `PORT` and
  `CORS_ORIGIN` (your deployed frontend's URL) as environment variables.
  SQLite's database file lives on disk, so on hosts with ephemeral
  filesystems (like Render's free tier), back it up periodically or migrate
  to a hosted database (e.g. Postgres) once you have real order volume.

## Planned next

- A separate AI agent page, linked from the main site (scope still being
  finalized).
