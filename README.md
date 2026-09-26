# Creator Academy — website & booking platform

Live, 90-minute, project-based workshops for creators (₹299 each) plus 1:1 personal training.
Students browse the catalogue → pick a date → pay (UPI / card / netbanking via Razorpay) → get an
instant confirmation with their registration ID and joining instructions. The team runs everything
from an admin dashboard at `/admin`.

> **"Creator Academy" is a working name.** Change it in one place: `src/lib/site.ts` → `name`.

---

## 1. Run it locally

Requirements: Node.js 20+ (tested on Node 26).

```bash
npm install
cp .env.example .env.local      # then edit .env.local
npm run db:seed                 # creates the database + schedules the first 4 weekends
npm run dev                     # http://localhost:3000
```

- Admin dashboard: http://localhost:3000/admin — password is `ADMIN_PASSWORD` from `.env.local`.
- With no Razorpay keys, the site runs in **demo mode**: the payment step is simulated (clearly
  labelled, no money moves) so you can test the full booking flow.
- With no SMTP settings, emails are **not sent** — they're saved to the email log at `/admin/emails`.

Useful scripts:

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build && npm start` | Production build / server |
| `npm run typecheck` | TypeScript check |
| `npm run db:setup` | Create tables (safe any time) |
| `npm run db:seed` | Create tables + seed the launch schedule and 1:1 slots (skips if data exists) |
| `npm run db:reset` | **Deletes the local database** and re-seeds (local file DB only) |
| `npm run db:reset -- --demo-data` | Same, plus one past class with 2 TEST students (to test attendance + the 10% discount) |

---

## 2. What's in the box

**Public site**

| Page | Path |
| --- | --- |
| Home (hero, next class, categories, launch workshops, how it works, schedule, why us, personal training, feedback, FAQ, socials) | `/` |
| Class catalogue with category filter (live / coming soon / roadmap) | `/classes`, `/classes?category=editing` |
| Individual class page (learn / create / who it's for / what to bring / sessions / notify-me) | `/classes/[slug]` |
| Weekend schedule | `/schedule` |
| Checkout (details → payment) | `/book/[sessionId]` |
| Booking confirmation (registration ID, joining info, add to calendar) | `/booking/[code]` |
| Find my booking | `/booking` |
| Personal training (topic → duration → time → book) | `/personal-training`, confirmation `/training/[code]` |
| Post-class feedback form | `/feedback?code=CA-XXXX-XXXX` |
| FAQ, About, Contact | `/faq`, `/about`, `/contact` |
| Policies (required by Razorpay) | `/policies/terms`, `/policies/privacy`, `/policies/refunds`, `/policies/delivery` |

**Admin dashboard (`/admin`)** — overview & revenue milestones (₹3,000 → ₹10,000), sessions
(schedule, edit, attendance, reminders, feedback requests, CSV export), bookings, personal-training
slots & bookings, feedback approval, demand ("what should we teach next"), contact messages, email log.

**Business rules built in**

- ₹299 per workshop (`site.pricing.workshopPaise`), max 20 seats (`site.defaultCapacity`).
- An unpaid booking holds its seat for 15 minutes (`site.seatHoldMinutes`).
- **Returning-student discount:** anyone marked *attended* in the immediately previous class gets
  10% off their next booking (₹299 → ₹269.10), applied automatically by email at checkout, once.
  ⚠️ This only works if you **mark attendance** on the session page after each class.
- Workshops are open-entry — no prerequisites or forced sequence.
- Reviews are shown **only** if the student ticked consent **and** you approve it in `/admin/feedback`.
  The site never shows invented reviews.

---

## 3. Editing content

| What | Where |
| --- | --- |
| Brand name, tagline, contact email, socials, prices, seat limit, legal details | `src/lib/site.ts` |
| Personal training durations, prices and topics | `src/lib/site.ts` → `training` |
| Workshops (titles, promises, what you'll learn, outcomes, status) | `src/content/workshops.ts` |
| FAQ | `src/content/faq.ts` |
| Policies | `src/app/(site)/policies/[slug]/page.tsx` |
| Colours & fonts | `src/app/globals.css` (`@theme`) and `src/app/layout.tsx` |

**Launching a new workshop:** in `src/content/workshops.ts` change its `status` from `"planned"` to
`"live"`, redeploy, then schedule a session for it in `/admin/sessions`. `/admin/demand` shows who
asked to be notified — email them when dates open.

**Scheduling classes** is done in the admin dashboard (no code): `/admin/sessions` → *Schedule a
session*. Add the Google Meet / Zoom link on the session page any time before the class, then use
*Email reminder to all paid students*.

**After every class:** open the session → *Mark all paid as attended* (untick no-shows) →
*Send feedback request to attendees* (this email also tells them about their 10% discount).

---

## 4. Going live — checklist

The admin overview page shows most of these as a live checklist.

1. **Brand** — final name, logo and colours (`src/lib/site.ts`, `src/components/brand.tsx`).
2. **Legal details** — set `NEXT_PUBLIC_LEGAL_NAME`, `NEXT_PUBLIC_LEGAL_ADDRESS` (and optionally
   `NEXT_PUBLIC_JURISDICTION`) to the **accurate** account-holder / business details. They appear
   on the policy pages and are required by payment providers. If the founder is under 18, a parent
   or guardian must hold the payment account and sign any agreements — use their correct details
   wherever the provider requires it. Never enter false KYC information.
3. **Contact email** — `NEXT_PUBLIC_CONTACT_EMAIL` (a business address, not a personal one).
4. **Razorpay** — create an account, complete KYC, then set `RAZORPAY_KEY_ID`,
   `RAZORPAY_KEY_SECRET`. Add a webhook to `https://YOUR-DOMAIN/api/webhooks/razorpay` for the
   `payment.captured` and `order.paid` events and set `RAZORPAY_WEBHOOK_SECRET`.
   Test with Razorpay **test keys** first, then switch to live keys. Razorpay's website review
   checks for the Terms, Privacy, Refund, Delivery and Contact pages — they're all included.
5. **Email** — set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM` (Zoho Mail,
   Google Workspace, Brevo, etc.). Send yourself a test booking and check `/admin/emails`.
6. **Admin** — a long `ADMIN_PASSWORD` and a random `SESSION_SECRET`.
7. **Socials** — fill in the academy's own Instagram / YouTube / Facebook URLs in `src/lib/site.ts`.
8. **`SITE_URL`** — your real domain (used in emails and links).
9. **Database** — see below. Delete any test bookings before launch (or start from a fresh DB).
10. Do one real ₹299 booking end-to-end, then refund it from the Razorpay dashboard.

---

## 5. Deploying

The app is a standard Next.js app. The database uses **libSQL**: a local SQLite file during
development, and a hosted **Turso** database in production (free tier is plenty) — same code.

### Vercel + Turso (recommended, free to start)

1. Create a Turso database: `turso db create academy` → `turso db show academy --url` and
   `turso db tokens create academy`.
2. Push this folder to a GitHub repository and import it in Vercel.
3. In Vercel → Settings → Environment Variables, add everything from `.env.example`, with
   `DATABASE_URL=libsql://…` and `DATABASE_AUTH_TOKEN=…` from Turso.
4. Deploy. Tables are created automatically on the first request. To pre-fill the launch schedule,
   run `npm run db:seed` locally with the production `DATABASE_URL`/`DATABASE_AUTH_TOKEN` in
   `.env.local` (or just schedule sessions in `/admin`).

### Any Node host (Railway, Render, a VPS)

`npm run build && npm start` with the env vars set. You can keep `DATABASE_URL=file:data/academy.db`
if the host has a **persistent disk** mounted at `data/`; otherwise use Turso.

> In production without Razorpay keys, online payment is **disabled** (students see "booking
> paused"). To run a public demo without real payments set `ALLOW_DEMO_PAYMENTS=true` — never on
> the real launch.

### Cloudflare (Workers, via OpenNext) — the modern "Pages" for a full Next.js app

Cloudflare has merged Pages and Workers: the current, supported way to deploy a full
server-rendered Next.js app (not just static files) is a **Worker with static assets**, built with
the [`@opennextjs/cloudflare`](https://opennext.js.org/cloudflare) adapter — already wired up in
this project (`open-next.config.ts`, `wrangler.jsonc`, and the `cf:*` npm scripts). It's been
build-tested end-to-end (`npm run cf:build` + `npx wrangler deploy --dry-run`) and produces a valid
Worker. **Requirements specific to this platform** (Workers has no filesystem and isn't Node.js):

- **Database must be Turso**, not a local file — `DATABASE_URL=libsql://…` + `DATABASE_AUTH_TOKEN`.
  `@libsql/client` auto-switches to its Workers-compatible build for `libsql://`/`https://` URLs.
- **Email (SMTP via nodemailer) is not guaranteed to work.** Workers doesn't support raw outbound
  TCP the way Node does, so nodemailer's SMTP connection may fail at runtime. The app degrades
  gracefully — a failed send is logged as `failed` in `/admin/emails` instead of crashing — but you
  won't get real emails out. If you deploy here for real, swap `src/lib/email.ts` for an HTTP-based
  provider (Resend, Postmark, Brevo's API, etc.) instead of SMTP. This is the one piece not yet
  adapted for Workers.
- **Build it on Linux/macOS or via Cloudflare's own CI, not this Windows machine for the real
  deploy.** OpenNext explicitly warns it isn't fully reliable on Windows; it built successfully
  here, but Cloudflare's Git-connected build (Linux-based) is the recommended path.

**Deploy by connecting the GitHub repo (recommended):**

1. Cloudflare dashboard → **Workers & Pages** → **Create** → **Import a Git repository**, pick this
   repo.
2. Build command: `npm run cf:build` — Build output / deploy config: leave as detected (it reads
   `wrangler.jsonc`).
3. Add environment variables/secrets in the dashboard (Settings → Variables): everything from
   `.env.example` (`DATABASE_URL`, `DATABASE_AUTH_TOKEN`, `ADMIN_PASSWORD`, `SESSION_SECRET`,
   `RAZORPAY_*`, `SITE_URL`, etc.). Mark secrets (tokens/passwords) as **encrypted**.
4. Rename the project in `wrangler.jsonc` (`name` field) before the first deploy.

**Or deploy manually from a machine with the repo checked out:**

```bash
npx wrangler login          # once, opens a browser to authorize
wrangler secret put DATABASE_URL
wrangler secret put DATABASE_AUTH_TOKEN
wrangler secret put ADMIN_PASSWORD
wrangler secret put SESSION_SECRET
# ...repeat for RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET / RAZORPAY_WEBHOOK_SECRET / SMTP_* as needed
npm run cf:deploy           # builds (opennextjs-cloudflare build) then deploys (wrangler deploy)
```

`npm run cf:preview` builds and runs the Worker locally (via `wrangler dev`-style preview) so you
can sanity-check it before deploying.

---

## 6. Where things live (for developers)

```
src/
  app/
    (site)/            public pages (shared header/footer layout)
    admin/             login + dashboard  — every page & action calls requireAdmin()
    api/               booking, payment (start/verify/demo), Razorpay webhook, contact, feedback…
  components/          UI primitives (ui.tsx), brand, cards, timeline, payment hook
  content/             workshops.ts, faq.ts — the catalogue lives in code
  lib/
    site.ts            brand + business settings
    db.ts, schema.ts   libSQL client; schema auto-applied on first use
    data/*.ts          all database queries
    payments.ts        Razorpay REST + signature checks
    checkout.ts        shared fulfilment (mark paid once → confirmation email)
    email*.ts          SMTP sending + templates (logged to /admin/emails)
    auth.ts            admin password + signed session cookie
scripts/db-setup.ts    create / seed / reset the database
open-next.config.ts    OpenNext Cloudflare adapter config
wrangler.jsonc         Cloudflare Worker config (name, compatibility flags, assets binding)
```

Payment flow: `POST /api/book/workshop` (pending registration, seat held) → `POST /api/pay/start`
(creates a Razorpay order server-side — the amount is never trusted from the browser) → Razorpay
Checkout → `POST /api/pay/verify` (HMAC signature check) → marked paid → confirmation email →
`/booking/[code]`. The webhook fulfils the same booking if the browser closes early; fulfilment is
idempotent so the email is sent once.
