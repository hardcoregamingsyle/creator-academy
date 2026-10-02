import type { Context } from "hono";
import type { ActionResult } from "../../shared/api-types";
import type { AppEnv } from "./types";

export { str, isEmail, normalisePhone } from "../../shared/validate";

export function ok(message = "Saved."): ActionResult {
  return { ok: true, message };
}

export function fail(message: string): ActionResult {
  return { ok: false, message };
}

export function badRequest(c: Context<AppEnv>, message: string) {
  return c.json({ ok: false as const, message }, 400);
}

export function notFound(c: Context<AppEnv>, message = "Not found") {
  return c.json({ ok: false as const, message }, 404);
}

/**
 * The request body as FormData, whether the client sent multipart/urlencoded or
 * a JSON object. Ported actions can keep using `formData.get("field")`:
 * strings stay as they are, numbers/booleans are stringified, null/undefined
 * are skipped, arrays append one entry per item (so `getAll` works) and
 * nested objects are JSON-stringified. An empty or unparseable body gives an
 * empty FormData.
 */
export async function readFormData(c: Context<AppEnv>): Promise<FormData> {
  const type = (c.req.header("content-type") ?? "").toLowerCase();
  if (type.includes("multipart/form-data") || type.includes("application/x-www-form-urlencoded")) {
    try {
      return await c.req.formData();
    } catch {
      return new FormData();
    }
  }

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return new FormData();
  }

  const fd = new FormData();
  if (!body || typeof body !== "object" || Array.isArray(body)) return fd;
  for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
    if (Array.isArray(value)) {
      for (const item of value) appendValue(fd, key, item);
    } else {
      appendValue(fd, key, value);
    }
  }
  return fd;
}

function appendValue(fd: FormData, key: string, value: unknown): void {
  if (value === null || value === undefined) return;
  if (typeof value === "string") fd.append(key, value);
  else if (typeof value === "object") fd.append(key, JSON.stringify(value));
  else fd.append(key, String(value));
}
