import crypto from "node:crypto";

/**
 * Minimal admin authentication: one shared password (ADMIN_PASSWORD) and a
 * signed, http-only session cookie. The API guard in _routes/app.ts calls
 * `isAdminRequest()` for every /api/admin/* request.
 */

export const ADMIN_COOKIE = "ca_admin";
const MAX_AGE_SECONDS = 7 * 24 * 3600;

function secret(): string {
  const s = process.env.SESSION_SECRET || process.env.ADMIN_PASSWORD;
  if (!s) throw new Error("SESSION_SECRET / ADMIN_PASSWORD is not configured");
  return s;
}

function sign(value: string): string {
  return crypto.createHmac("sha256", secret()).update(value).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

export function adminConfigured(): boolean {
  return Boolean(process.env.ADMIN_PASSWORD);
}

export function checkAdminPassword(password: string): boolean {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected || !password) return false;
  const h = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
  return safeEqual(h(password), h(expected));
}

function cookieAttributes(maxAge: number): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${secure}`;
}

/** A complete Set-Cookie header value that signs the admin in for a week. */
export function createAdminSessionCookie(): string {
  const expires = Date.now() + MAX_AGE_SECONDS * 1000;
  const token = `${expires}.${sign(String(expires))}`;
  return `${ADMIN_COOKIE}=${token}${cookieAttributes(MAX_AGE_SECONDS)}`;
}

/** A complete Set-Cookie header value that removes the session cookie. */
export function clearAdminSessionCookie(): string {
  return `${ADMIN_COOKIE}=${cookieAttributes(0)}`;
}

function readCookie(header: string | null, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() !== name) continue;
    const raw = part.slice(eq + 1).trim();
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }
  return undefined;
}

export function isAdminRequest(req: Request): boolean {
  if (!adminConfigured()) return false;
  const token = readCookie(req.headers.get("cookie"), ADMIN_COOKIE);
  if (!token) return false;
  const [expires, signature] = token.split(".");
  if (!expires || !signature || Number(expires) < Date.now()) return false;
  return safeEqual(sign(expires), signature);
}
