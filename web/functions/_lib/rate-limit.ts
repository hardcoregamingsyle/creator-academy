import { execute } from "./db";

/**
 * Abuse protection for the public write endpoints and the admin sign-in.
 *
 * A hit is one row in `rate_events` keyed "<scope>:<client>"; a client is
 * limited once it already has `max` hits for that scope inside the sliding
 * window. It lives in the database (not an in-memory Map) because Cloudflare
 * runs many isolates and any one of them can serve the next request.
 *
 * Cost per protected request: ONE statement (an atomic INSERT ... WHERE the
 * count is still under the limit), plus a prune of old rows at most once an
 * hour per isolate. If the database call itself fails the limiter fails OPEN
 * (the request is allowed and the error is logged): a broken limiter must not
 * take bookings down, and the same database outage would fail the request anyway.
 */

export const TOO_MANY_REQUESTS_MESSAGE = "Too many requests — please try again in a little while.";
export const TOO_MANY_LOGINS_MESSAGE = "Too many sign-in attempts — try again in a few minutes.";

const PRUNE_OLDER_THAN_MS = 2 * 86_400_000;
const PRUNE_EVERY_MS = 3_600_000;

// A plain timestamp (never a shared promise — see RequestScope in db.ts).
let lastPrune = 0;

/** Who is calling: Cloudflare's connecting IP (not spoofable behind Cloudflare), "unknown" when absent (local dev, tests). */
export function clientKey(c: { req: { header(name: string): string | undefined } }): string {
  return c.req.header("cf-connecting-ip")?.trim() || "unknown";
}

export type RateLimitResult = {
  allowed: boolean;
  /** Take the recorded hit back (used by the admin sign-in so only FAILED attempts count). No-op if not recorded. */
  refund: () => Promise<void>;
};

const NOOP = async () => {};

/**
 * Check-and-record in one atomic statement: records a hit for (scope, client)
 * and reports `allowed: true`, unless the client already has `max` hits for
 * `scope` within the last `windowSeconds` — then nothing is recorded (a client
 * hammering a locked endpoint doesn't extend its own lock-out) and `allowed` is false.
 */
export async function hitRateLimit(scope: string, client: string, max: number, windowSeconds: number): Promise<RateLimitResult> {
  const key = `${scope}:${client}`;
  const now = Date.now();
  try {
    const inserted = await execute(
      `INSERT INTO rate_events (key, at)
       SELECT ?, ?
       WHERE (SELECT COUNT(*) FROM rate_events WHERE key = ? AND at > ?) < ?`,
      [key, now, key, now - windowSeconds * 1000, max],
    );
    await pruneOccasionally(now);
    if (inserted === 0) return { allowed: false, refund: NOOP };
    return {
      allowed: true,
      refund: async () => {
        try {
          await execute(`DELETE FROM rate_events WHERE rowid = (SELECT MIN(rowid) FROM rate_events WHERE key = ? AND at = ?)`, [key, now]);
        } catch (err) {
          console.error("[rate-limit] refund failed:", err);
        }
      },
    };
  } catch (err) {
    console.error("[rate-limit] check failed, allowing the request:", err);
    return { allowed: true, refund: NOOP };
  }
}

async function pruneOccasionally(now: number): Promise<void> {
  if (now - lastPrune < PRUNE_EVERY_MS) return;
  lastPrune = now;
  try {
    await execute(`DELETE FROM rate_events WHERE at < ?`, [now - PRUNE_OLDER_THAN_MS]);
  } catch (err) {
    console.error("[rate-limit] prune failed:", err);
  }
}

/** Per-client limits for the public POST endpoints (the webhook and every GET are deliberately not limited). */
export const PUBLIC_WRITE_LIMITS: Record<string, { scope: string; max: number; windowSeconds: number }> = {
  "/api/book/workshop": { scope: "book-workshop", max: 20, windowSeconds: 3600 },
  "/api/book/training": { scope: "book-training", max: 20, windowSeconds: 3600 },
  "/api/book/pass": { scope: "book-pass", max: 20, windowSeconds: 3600 },
  "/api/book/discount": { scope: "book-discount", max: 60, windowSeconds: 3600 },
  "/api/contact": { scope: "contact", max: 5, windowSeconds: 3600 },
  "/api/feedback": { scope: "feedback", max: 10, windowSeconds: 3600 },
  "/api/interest": { scope: "interest", max: 20, windowSeconds: 3600 },
  "/api/booking/resend": { scope: "booking-resend", max: 5, windowSeconds: 3600 },
};

/** Failed admin sign-ins allowed per client in the window before sign-in is refused outright. */
export const ADMIN_LOGIN_LIMIT = { scope: "admin-login-fail", max: 10, windowSeconds: 15 * 60 };
