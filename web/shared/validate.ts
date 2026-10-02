/** Tiny validation helpers for form input (server and client). */

export function isEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());
}

/** Accepts Indian mobile numbers with optional +91 / 0 prefix, spaces and dashes. Empty is allowed. */
export function normalisePhone(v: string | null | undefined): { ok: boolean; value: string | null } {
  const raw = (v ?? "").trim();
  if (!raw) return { ok: true, value: null };
  const digits = raw.replace(/[\s\-()]/g, "");
  const m = digits.match(/^(?:\+?91|0)?([6-9]\d{9})$/);
  if (m) return { ok: true, value: `+91${m[1]}` };
  // allow international numbers
  if (/^\+\d{8,15}$/.test(digits)) return { ok: true, value: digits };
  return { ok: false, value: null };
}

export function str(v: unknown, max = 500): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}
