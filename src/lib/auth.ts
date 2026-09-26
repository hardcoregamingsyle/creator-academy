import "server-only";
import crypto from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

/**
 * Minimal admin authentication: one shared password (ADMIN_PASSWORD) and a
 * signed, http-only session cookie. Call `requireAdmin()` at the top of EVERY
 * admin page, server action and admin route handler.
 */

const COOKIE = "ca_admin";
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

export async function createAdminSession(): Promise<void> {
  const expires = Date.now() + MAX_AGE_SECONDS * 1000;
  const token = `${expires}.${sign(String(expires))}`;
  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function clearAdminSession(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE);
}

export async function isAdmin(): Promise<boolean> {
  if (!adminConfigured()) return false;
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return false;
  const [expires, signature] = token.split(".");
  if (!expires || !signature || Number(expires) < Date.now()) return false;
  return safeEqual(sign(expires), signature);
}

/** Redirects to the login page unless the visitor is signed in as admin. */
export async function requireAdmin(): Promise<void> {
  if (!(await isAdmin())) redirect("/admin/login");
}
