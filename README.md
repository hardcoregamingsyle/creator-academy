# CREATEVA

Live creator-skill workshops, a monthly all-access pass and 1:1 personal training. Booking, payments (Razorpay), email (Resend) and a full admin dashboard.

**Stack:** a Vite + React single-page app (`web/src`) and a thin JSON API on Cloudflare Pages Functions (`web/functions`, Hono) over a Turso (libSQL) database. Static assets are free and unlimited on Pages; only `/api/*` and `/sitemap.xml` invoke Functions, and every endpoint is kept to a few database round trips so it fits the free plan's ~10 ms CPU limit.

```
web/
  src/            SPA: pages/, components/, layouts/, routes/ (one file per feature slice)
  functions/      API: _routes/*.ts (Hono routers), _lib/ (db, auth, payments, email, data layer)
  shared/         pure code used by both sides (format, validate, content, brand, api types)
  public/         static files (logo, robots.txt, _routes.json)
  scripts/        node-api.ts: runs the API in plain Node against a local SQLite file
```

## Run locally

```bash
cd web
npm install
cp .env.example .env.local        # defaults use a local SQLite file; admin password: see the file
npm run dev:api                   # API on http://127.0.0.1:8788 (local SQLite, auto-seeded)
npm run dev                       # SPA on http://localhost:5173, proxies /api to the API
```

`npm run typecheck` checks both the SPA and the functions; `npm run build` typechecks and builds to `web/dist`.

## Deploy

Pushing to `main` runs `.github/workflows/deploy-pages.yml`: typecheck, build, then `wrangler pages deploy` to the **createva-proxy** Pages project (custom domains `www.createva.co.in` and the legacy `createva.skinticals.com` are attached to it). Repository secrets needed: `CLOUDFLARE_API_TOKEN` (with Cloudflare Pages: Edit) and `CLOUDFLARE_ACCOUNT_ID`.

Non-secret settings live in `web/wrangler.toml` (`SITE_URL`, `CONTACT_EMAIL`, ...). Secrets are set on the Pages project, never in the repo:

```bash
cd web
npx wrangler pages secret put DATABASE_URL --project-name createva-proxy
# also: DATABASE_AUTH_TOKEN, ADMIN_PASSWORD, SESSION_SECRET, RESEND_API_KEY,
# and for live payments: RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET
```

The Razorpay webhook URL is `https://www.createva.co.in/api/webhooks/razorpay`.

## Admin

`/admin` (shared password, signed httpOnly cookie). Everything editable without a deploy: prices and the struck-through "regular price" markup, the class catalogue, social links, sessions, bookings, personal-training slots, feedback and messages.
