import { createClient, type Client, type InArgs, type Row } from "@libsql/client";
import fs from "node:fs";
import path from "node:path";
import { SCHEMA } from "./schema";

/**
 * Database access.
 *
 * Uses libSQL: a local SQLite file in development (`file:data/academy.db`) and
 * a hosted Turso database in production — same SQL, same code. The schema is
 * applied automatically on first use (all statements are idempotent).
 */

let client: Client | null = null;
// A plain flag, deliberately NOT a shared promise: on Cloudflare Workers a
// promise created inside one request can never be settled if that request is
// cancelled (CPU limit, client disconnect), and every later request on the
// same isolate that awaited it would hang forever ("Worker's code had hung").
let schemaReady = false;

function getClient(): Client {
  if (client) return client;
  const url = process.env.DATABASE_URL || "file:data/academy.db";
  if (url.startsWith("file:")) {
    const file = url.slice("file:".length);
    fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  }
  client = createClient({ url, authToken: process.env.DATABASE_AUTH_TOKEN || undefined });
  return client;
}

/**
 * Column additions to existing tables. `CREATE TABLE IF NOT EXISTS` in SCHEMA
 * doesn't help once a table already exists in production — SQLite has no
 * `ADD COLUMN IF NOT EXISTS`, so each migration is just tried and a "duplicate
 * column" failure (already applied) is swallowed.
 */
const MIGRATIONS: string[] = [
  // Lets a registration be fully covered by a Monthly Pass instead of paid individually.
  "ALTER TABLE registrations ADD COLUMN covered_by_pass_id TEXT",
];

/**
 * Every statement is idempotent, so concurrent cold-start requests may each run
 * this once (harmless) rather than sharing one in-flight promise (unsafe — see
 * `schemaReady`). Once it has succeeded on this isolate, it's a no-op.
 */
async function ensureSchema(): Promise<void> {
  if (schemaReady) return;
  await getClient().executeMultiple(SCHEMA);
  for (const sql of MIGRATIONS) {
    await getClient()
      .execute(sql)
      .catch((err) => {
        if (!/duplicate column/i.test(String(err?.message ?? err))) throw err;
      });
  }
  schemaReady = true;
}

/** Run a single statement and return all rows. */
export async function query<T = Row>(sql: string, args: InArgs = []): Promise<T[]> {
  await ensureSchema();
  const rs = await getClient().execute({ sql, args });
  return rs.rows as unknown as T[];
}

/** Run a single statement and return the first row (or null). */
export async function queryOne<T = Row>(sql: string, args: InArgs = []): Promise<T | null> {
  const rows = await query<T>(sql, args);
  return rows[0] ?? null;
}

/** Run a write statement; returns the number of affected rows. */
export async function execute(sql: string, args: InArgs = []): Promise<number> {
  await ensureSchema();
  const rs = await getClient().execute({ sql, args });
  return rs.rowsAffected;
}

/** Run several write statements atomically. */
export async function batch(statements: { sql: string; args?: InArgs }[]): Promise<void> {
  await ensureSchema();
  await getClient().batch(
    statements.map((s) => ({ sql: s.sql, args: s.args ?? [] })),
    "write",
  );
}

const seededKeys = new Set<string>();

/**
 * Run `seed` at most once ever per content table, not once per request.
 * - Per-isolate: a plain Set remembers keys already confirmed seeded (no
 *   shared promises — see `schemaReady`).
 * - Per-database: the `content_seed` marker row. If a table already has rows
 *   but no marker (it was seeded before markers existed) we just record the
 *   marker rather than seeding again. `seed` must itself be race-safe
 *   (INSERT OR IGNORE), since two cold requests can both reach it.
 */
export async function seedOnce(key: string, table: string, seed: () => Promise<void>): Promise<void> {
  if (seededKeys.has(key)) return;
  const marker = await queryOne(`SELECT 1 AS x FROM content_seed WHERE key = ?`, [key]);
  if (!marker) {
    const [row] = await query<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table}`);
    if (Number(row?.n ?? 0) === 0) await seed();
    await execute(`INSERT OR IGNORE INTO content_seed (key) VALUES (?)`, [key]);
  }
  seededKeys.add(key);
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function newId(): string {
  return crypto.randomUUID();
}

const CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"; // no 0/O/1/I

/** Human-friendly unguessable code, e.g. "CA-7K3P-9QXM". */
export function newCode(prefix: string): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  const chars = Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
  return `${prefix}-${chars.slice(0, 4)}-${chars.slice(4)}`;
}
