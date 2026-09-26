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
let ready: Promise<void> | null = null;

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

async function ensureSchema(): Promise<void> {
  if (!ready) {
    ready = getClient()
      .executeMultiple(SCHEMA)
      .catch((err) => {
        ready = null;
        throw err;
      });
  }
  return ready;
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
