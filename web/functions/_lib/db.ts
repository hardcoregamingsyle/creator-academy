import { createClient, type Client, type InArgs, type Row } from "@libsql/client";
import { AsyncLocalStorage } from "node:async_hooks";
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

/** One SQL statement for batch() / seedOnce(). */
export type SqlStatement = { sql: string; args?: InArgs };

/**
 * Per-request state. Everything that holds a PROMISE lives here and never in a
 * module global: a promise created inside one Cloudflare Workers request can
 * never be settled if that request is cancelled (CPU limit, client disconnect),
 * and another request awaiting it would hang forever ("Worker's code had
 * hung"). The scope dies with the request, so sharing within it is safe.
 */
type RequestScope = {
  client?: Client;
  /** In-flight schema bootstrap, so parallel first callers of one request run it once. */
  schema?: Promise<void>;
  /** In-flight content seeds, by key. */
  seeds?: Map<string, Promise<void>>;
  /** requestMemo() entries. */
  memo?: Map<string, Promise<unknown>>;
};

let localClient: Client | null = null;
const requestScope = new AsyncLocalStorage<RequestScope>();
// A plain flag, deliberately NOT a shared promise (see RequestScope above).
let schemaReady = false;

function makeClient(): Client {
  const url = process.env.DATABASE_URL || "file:data/academy.db";
  if (url.startsWith("file:")) {
    const file = url.slice("file:".length);
    fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  }
  return createClient({ url, authToken: process.env.DATABASE_AUTH_TOKEN || undefined });
}

/**
 * One libSQL client PER REQUEST for the remote (Turso) database. The client
 * keeps an internal queue (promise-limit, 20 concurrent) shared by everything
 * that uses it; if one client is shared across requests, a queued query is
 * released by another request's completion and Cloudflare Workers kills the
 * waiting request as "code had hung". A per-request client keeps all of that
 * state inside one request. (A local file: database, used only by the Node
 * test harness, has no network queue and stays shared.)
 */
function getClient(): Client {
  const url = process.env.DATABASE_URL || "file:data/academy.db";
  if (url.startsWith("file:")) return (localClient ||= makeClient());
  const scope = requestScope.getStore();
  if (scope) return (scope.client ||= makeClient());
  return makeClient();
}

/** Wrap each incoming request so its queries share one request-scoped client (and its other per-request state). */
export function runWithRequestDb<T>(fn: () => Promise<T>): Promise<T> {
  return requestScope.run({}, fn);
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
  // Struck-through "regular price" markup (display only). Existing rows get 90 immediately.
  "ALTER TABLE site_settings ADD COLUMN anchor_markup_percent INTEGER NOT NULL DEFAULT 90",
  // Live classes: when the host pressed Start / End in the on-site room, and whether the 24h reminder email went out.
  "ALTER TABLE class_sessions ADD COLUMN live_started_at TEXT",
  "ALTER TABLE class_sessions ADD COLUMN live_ended_at TEXT",
  "ALTER TABLE registrations ADD COLUMN reminder_sent_at TEXT",
  // Self-service refunds / moves (functions/_lib/refunds.ts): Razorpay refund id + when + how much, how often a booking
  // was moved to another date, and the session it was first booked on.
  "ALTER TABLE registrations ADD COLUMN refund_id TEXT",
  "ALTER TABLE registrations ADD COLUMN refunded_at TEXT",
  "ALTER TABLE registrations ADD COLUMN refund_amount_paise INTEGER",
  "ALTER TABLE registrations ADD COLUMN moved_count INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE registrations ADD COLUMN original_session_id TEXT",
  "ALTER TABLE training_bookings ADD COLUMN refund_id TEXT",
  "ALTER TABLE training_bookings ADD COLUMN refunded_at TEXT",
  "ALTER TABLE training_bookings ADD COLUMN refund_amount_paise INTEGER",
];

/** Small non-cryptographic string hash (djb2), base-36. */
function djb2(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/**
 * Version of the database schema this code expects, derived from the content
 * of SCHEMA + MIGRATIONS: any edit to either changes it, so a new migration
 * re-runs the bootstrap once without anyone remembering to bump a number.
 * It's recorded in `content_seed` once the bootstrap has fully succeeded.
 */
const SCHEMA_SOURCE = `${SCHEMA}\n${MIGRATIONS.join("\n")}`;
const SCHEMA_KEY = `schema:${djb2(SCHEMA_SOURCE)}:${SCHEMA_SOURCE.length}`;

/**
 * Bring the database up to date. A cold isolate asks ONE cheap question first
 * ("has this schema version been applied?"); only when the marker is missing
 * (brand-new or older database) does it run the idempotent DDL and the
 * ALTERs, then record the marker. Every subsequent cold start on an
 * already-migrated database costs a single query instead of ~30 DDL
 * statements plus one failing ALTER per migration.
 */
async function applySchema(): Promise<void> {
  let applied = false;
  try {
    const rs = await getClient().execute({ sql: `SELECT 1 FROM content_seed WHERE key = ?`, args: [SCHEMA_KEY] });
    applied = rs.rows.length > 0;
  } catch {
    // content_seed doesn't exist yet: a brand-new database.
  }
  if (!applied) {
    await getClient().executeMultiple(SCHEMA);
    for (const sql of MIGRATIONS) {
      await getClient()
        .execute(sql)
        .catch((err) => {
          if (!/duplicate column/i.test(String(err?.message ?? err))) throw err;
        });
    }
    await getClient().execute({ sql: `INSERT OR IGNORE INTO content_seed (key) VALUES (?)`, args: [SCHEMA_KEY] });
  }
  schemaReady = true;
}

/**
 * Once it has succeeded on this isolate (`schemaReady`) this is a no-op.
 * Until then, parallel callers WITHIN one request share a single in-flight
 * bootstrap kept in the request scope (never in a module global — see
 * RequestScope). Without a request scope (scripts, tests) it just runs.
 */
function ensureSchema(): Promise<void> {
  if (schemaReady) return Promise.resolve();
  const scope = requestScope.getStore();
  if (!scope) return applySchema();
  return (scope.schema ??= applySchema().catch((err) => {
    scope.schema = undefined; // let a later caller in this request try again
    throw err;
  }));
}

/**
 * Per-request memo: the first caller runs `fn`, every later caller in the same
 * request gets the same promise. For cheap, rarely-changing reads that several
 * independent helpers each need (workshop catalogue, site settings…). Call
 * clearRequestMemo() from any write that changes what those reads return.
 * Outside a request scope (tests, scripts) it just calls `fn`.
 */
export function requestMemo<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const scope = requestScope.getStore();
  if (!scope) return fn();
  const memo = (scope.memo ??= new Map());
  const hit = memo.get(key);
  if (hit) return hit as Promise<T>;
  const p = (async () => fn())();
  memo.set(key, p);
  p.catch(() => {
    if (memo.get(key) === p) memo.delete(key); // never cache a failure
  });
  return p;
}

/** Drop every requestMemo() entry — call after writing data that a memoised read returns. */
export function clearRequestMemo(): void {
  requestScope.getStore()?.memo?.clear();
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

/** Run several write statements atomically (one round trip: a single transaction). */
export async function batch(statements: SqlStatement[]): Promise<void> {
  await ensureSchema();
  await getClient().batch(
    statements.map((s) => ({ sql: s.sql, args: s.args ?? [] })),
    "write",
  );
}

const seededKeys = new Set<string>();

async function runSeed(key: string, table: string, seed: () => SqlStatement[]): Promise<void> {
  // One round trip answers both questions: is the marker there, and is the table empty?
  const [row] = await query<{ m: number; n: number }>(
    `SELECT (SELECT COUNT(*) FROM content_seed WHERE key = ?) AS m, (SELECT COUNT(*) FROM ${table}) AS n`,
    [key],
  );
  if (!Number(row?.m ?? 0)) {
    const marker: SqlStatement = { sql: `INSERT OR IGNORE INTO content_seed (key) VALUES (?)`, args: [key] };
    // Rows and marker commit together or not at all: a request cut off half way
    // (CPU/subrequest limit) can't leave a half-seeded table with a marker on it.
    // A table that already has rows but no marker was seeded before markers
    // existed; only the marker is recorded.
    await batch(Number(row?.n ?? 0) === 0 ? [...seed(), marker] : [marker]);
  }
  seededKeys.add(key);
}

/**
 * Seed a content table from its code defaults at most once ever, not once per
 * request. `seed` returns the INSERT statements (use INSERT OR IGNORE, since
 * two cold requests can both reach it); they run as ONE atomic batch together
 * with the `content_seed` marker row.
 * - Per-isolate: a plain Set remembers keys already confirmed seeded.
 * - Per-request: parallel callers share one in-flight seed (request scope only).
 * - Per-database: the marker row, so deleting every row in the admin doesn't
 *   make the defaults reappear.
 */
export function seedOnce(key: string, table: string, seed: () => SqlStatement[]): Promise<void> {
  if (seededKeys.has(key)) return Promise.resolve();
  const scope = requestScope.getStore();
  if (!scope) return runSeed(key, table, seed);
  const seeds = (scope.seeds ??= new Map());
  let p = seeds.get(key);
  if (!p) {
    p = runSeed(key, table, seed);
    seeds.set(key, p);
    const mine = p;
    mine.catch(() => {
      if (seeds.get(key) === mine) seeds.delete(key);
    });
  }
  return p;
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
