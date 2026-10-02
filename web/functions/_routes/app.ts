import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { HTTPException } from "hono/http-exception";
import type { SiteInfo, SitePricing } from "../../shared/api-types";
import {
  adminConfigured,
  checkAdminPassword,
  clearAdminSessionCookie,
  createAdminSessionCookie,
  isAdminRequest,
} from "../_lib/auth";
import { runWithRequestDb } from "../_lib/db";
import { activeSocials } from "../_lib/data/socials";
import { getSiteSettings } from "../_lib/data/site-settings";
import { emailConfigured } from "../_lib/email";
import { paymentMode } from "../_lib/payments";
import {
  ADMIN_LOGIN_LIMIT,
  clientKey,
  hitRateLimit,
  PUBLIC_WRITE_LIMITS,
  TOO_MANY_LOGINS_MESSAGE,
  TOO_MANY_REQUESTS_MESSAGE,
} from "../_lib/rate-limit";
import { site, siteUrl } from "../_lib/site";
import type { AppEnv } from "./types";
import { fail, notFound, ok, readFormData } from "./util";
import { routes as adminCore } from "./admin-core";
import { routes as adminOps } from "./admin-ops";
import { routes as booking } from "./booking";
import { routes as catalogue } from "./catalogue";
import { routes as feedback } from "./feedback";
import { routes as live } from "./live";
import { routes as pass } from "./pass";
import { routes as publicCore } from "./public-core";
import { routes as training } from "./training";

const app = new Hono<AppEnv>().basePath("/api");

const FAILED_LOGIN_DELAY_MS = 600;
/** Largest request body accepted on any /api write (every real payload here is a few KB). */
const MAX_BODY_BYTES = 262_144;
const PROXY_HOST_SUFFIX = ".createva-proxy.pages.dev";
const EXTRA_ALLOWED_HOSTS = ["createva.skinticals.com", "createva-proxy.pages.dev"];

app.onError((err, c) => {
  if (err instanceof HTTPException) {
    const message = err.status >= 500 ? "Something went wrong. Please try again." : err.message || "Request failed.";
    return c.json({ ok: false as const, message }, err.status);
  }
  console.error(`[api] ${c.req.method} ${c.req.path} failed:`, err);
  return c.json({ ok: false as const, message: "Something went wrong. Please try again." }, 500);
});

app.notFound((c) => notFound(c));

// Outermost: every request gets its own DB client (see runWithRequestDb in _lib/db.ts).
app.use("*", (_c, next) => runWithRequestDb(next));

// Headers on every /api response, including errors and the CSRF/auth rejections below.
// X-Robots-Tag: crawlers must still be able to FETCH /api/pages/* (the SPA renders from them), but this JSON must not be indexed.
app.use("*", async (c, next) => {
  c.header("Cache-Control", "no-store");
  c.header("X-Robots-Tag", "noindex");
  c.header("X-Content-Type-Options", "nosniff");
  c.header("Referrer-Policy", "strict-origin-when-cross-origin");
  await next();
});

function hostOf(value: string | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).host;
  } catch {
    return null;
  }
}

function allowedOriginHosts(): Set<string> {
  const hosts = new Set<string>(EXTRA_ALLOWED_HOSTS);
  const siteHost = hostOf(process.env.SITE_URL) ?? hostOf(siteUrl);
  if (siteHost) {
    hosts.add(siteHost);
    hosts.add(siteHost.startsWith("www.") ? siteHost.slice(4) : `www.${siteHost}`);
  }
  return hosts;
}

function isLocalHostname(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

/**
 * Cross-origin localhost callers (a Vite dev server, the Node harness) are only
 * trusted outside production, or when the site itself is configured as a
 * localhost URL. In production any other web server on a visitor's machine
 * could otherwise make cross-site writes. (Same-origin requests, including
 * `wrangler pages dev` on localhost, pass the earlier same-host check.)
 */
function localOriginsAllowed(): boolean {
  if (process.env.NODE_ENV !== "production") return true;
  const configured = hostOf(process.env.SITE_URL) ?? hostOf(siteUrl);
  return configured !== null && isLocalHostname(configured.replace(/:\d+$/, ""));
}

function isAllowedOrigin(origin: string, requestUrl: string): boolean {
  let o: URL;
  try {
    o = new URL(origin);
  } catch {
    return false;
  }
  if (o.protocol !== "https:" && o.protocol !== "http:") return false;
  if (o.host === new URL(requestUrl).host) return true;
  if (isLocalHostname(o.hostname) && localOriginsAllowed()) return true;
  if (o.hostname.endsWith(PROXY_HOST_SUFFIX)) return true;
  return allowedOriginHosts().has(o.host);
}

const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

// CSRF: browsers always attach Origin (or Sec-Fetch-Site) to cross-site writes.
// Razorpay's server-to-server webhook carries neither and is verified by signature instead; so is the room
// Worker's reminder cron under /api/internal (Bearer CRON_SECRET).
app.use("*", async (c, next) => {
  if (!UNSAFE_METHODS.has(c.req.method)) return next();
  const path = c.req.path;
  if (path === "/api/webhooks" || path.startsWith("/api/webhooks/")) return next();
  if (path === "/api/internal" || path.startsWith("/api/internal/")) return next();

  const origin = c.req.header("origin");
  const allowed = origin
    ? isAllowedOrigin(origin, c.req.url)
    : ["same-origin", "none"].includes((c.req.header("sec-fetch-site") ?? "").toLowerCase());
  if (!allowed) return c.json(fail("Cross-site request blocked."), 403);
  return next();
});

// Request bodies are capped: nothing here legitimately sends more than a few KB, and
// an unbounded body is buffered and parsed in full (CPU/memory on a free-plan Worker).
// Covers chunked bodies without a Content-Length too. The webhook is small, same cap.
const capBody = bodyLimit({
  maxSize: MAX_BODY_BYTES,
  onError: (c) => c.json(fail("Request too large."), 413),
});
app.use("*", (c, next) => (UNSAFE_METHODS.has(c.req.method) ? capBody(c, next) : next()));

// Per-client limits on the public write endpoints (see _lib/rate-limit.ts). Never on GET or the Razorpay webhook.
app.use("*", async (c, next) => {
  if (c.req.method !== "POST") return next();
  const limit = PUBLIC_WRITE_LIMITS[c.req.path.replace(/\/+$/, "")];
  if (!limit) return next();
  const hit = await hitRateLimit(limit.scope, clientKey(c), limit.max, limit.windowSeconds);
  if (!hit.allowed) return c.json(fail(TOO_MANY_REQUESTS_MESSAGE), 429);
  return next();
});

// Everything under /api/admin needs a signed-in admin, except the sign-in
// call itself and the session probe the SPA uses to decide what to render.
app.use("/admin/*", async (c, next) => {
  const method = c.req.method;
  const path = c.req.path.replace(/\/+$/, "");
  const open = (method === "POST" && path === "/api/admin/login") || (method === "GET" && path === "/api/admin/session");
  if (!open && !isAdminRequest(c.req.raw)) return c.json(fail("Unauthorized"), 401);
  return next();
});

app.post("/admin/login", async (c) => {
  // Only FAILED sign-ins count towards the limit. The attempt is reserved up front (atomically, before the
  // password is looked at) and handed back on success, so a burst of parallel guesses can't all slip
  // through before the first failure is recorded. Once a client has used up its failures it is refused here.
  const attempt = await hitRateLimit(ADMIN_LOGIN_LIMIT.scope, clientKey(c), ADMIN_LOGIN_LIMIT.max, ADMIN_LOGIN_LIMIT.windowSeconds);
  if (!attempt.allowed) return c.json(fail(TOO_MANY_LOGINS_MESSAGE), 429);

  const form = await readFormData(c);
  const password = String(form.get("password") ?? "");

  if (!adminConfigured() || !checkAdminPassword(password)) {
    // Slow down brute-forcing a little; the rate limit above is the real defence.
    await new Promise((resolve) => setTimeout(resolve, FAILED_LOGIN_DELAY_MS));
    return c.json(fail("Incorrect password. Please try again."), 401);
  }

  await attempt.refund();
  c.header("Set-Cookie", createAdminSessionCookie(), { append: true });
  return c.json(ok("Signed in."));
});

app.post("/admin/logout", (c) => {
  c.header("Set-Cookie", clearAdminSessionCookie(), { append: true });
  return c.json(ok("Signed out."));
});

app.get("/admin/session", (c) => {
  if (!isAdminRequest(c.req.raw)) return c.json({ ok: false, admin: false, adminConfigured: adminConfigured() });
  return c.json({ ok: true, admin: true, paymentMode: paymentMode(), emailConfigured: emailConfigured() });
});

app.get("/site", async (c) => {
  // One round trip each, in parallel, so the prices cost no extra latency.
  const [socials, settings] = await Promise.all([activeSocials(), getSiteSettings()]);
  const pricing: SitePricing = {
    workshopPaise: settings.workshopPricePaise,
    monthlyPassPaise: settings.monthlyPassPricePaise,
    returningDiscountPercent: settings.returningDiscountPercent,
    anchorMarkupPercent: settings.anchorMarkupPercent,
  };
  const info: SiteInfo = {
    name: site.name,
    tagline: site.tagline,
    description: site.description,
    contactEmail: site.contactEmail,
    replyTime: site.replyTime,
    legal: { businessName: site.legal.businessName, address: site.legal.address, jurisdiction: site.legal.jurisdiction },
    socials: socials.map((s) => ({ id: s.id, platform: s.platform, handle: s.handle, url: s.url })),
    siteUrl,
    paymentMode: paymentMode(),
    pricing,
  };
  // Changes only when an admin edits prices/socials, but every page load fetches it: let browsers reuse it for a minute
  // (overrides the no-store default above). Seat counts and prices on the booking pages stay no-store.
  c.header("Cache-Control", "public, max-age=60");
  return c.json(info);
});

app.route("/", publicCore);
app.route("/", catalogue);
app.route("/", booking);
app.route("/", training);
app.route("/", pass);
app.route("/", feedback);
app.route("/", live);
app.route("/", adminCore);
app.route("/", adminOps);

export default app;
