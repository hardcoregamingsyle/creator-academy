import { execute, newId, nowIso, query } from "@/lib/db";
import { getWorkshop, listWorkshops } from "@/lib/data/workshops";
import { normaliseEmail } from "./registrations";

// ───────────────────────── workshop interest / demand ─────────────────────────
// "Notify me" for planned workshops and votes for roadmap workshops. This is
// how students tell us what to teach next.

export type InterestEntry = {
  id: string;
  workshopSlug: string;
  workshopTitle: string;
  name: string | null;
  email: string;
  note: string | null;
  createdAt: string;
};

export async function registerInterest(input: {
  workshopSlug: string;
  email: string;
  name?: string | null;
  note?: string | null;
}): Promise<{ ok: true; alreadyRegistered: boolean } | { ok: false; error: string }> {
  if (!(await getWorkshop(input.workshopSlug))) return { ok: false, error: "Unknown workshop." };
  const changed = await execute(
    `INSERT OR IGNORE INTO interest (id, workshop_slug, name, email, note, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
    [
      newId(),
      input.workshopSlug,
      input.name?.trim() || null,
      normaliseEmail(input.email),
      input.note?.trim().slice(0, 1000) || null,
      nowIso(),
    ],
  );
  return { ok: true, alreadyRegistered: changed === 0 };
}

export async function listInterest(workshopSlug?: string): Promise<InterestEntry[]> {
  const rows = workshopSlug
    ? await query<Record<string, string | null>>(`SELECT * FROM interest WHERE workshop_slug = ? ORDER BY created_at DESC`, [workshopSlug])
    : await query<Record<string, string | null>>(`SELECT * FROM interest ORDER BY created_at DESC`);
  return Promise.all(
    rows.map(async (r) => ({
      id: r.id as string,
      workshopSlug: r.workshop_slug as string,
      workshopTitle: (await getWorkshop(r.workshop_slug as string))?.title ?? (r.workshop_slug as string),
      name: r.name,
      email: r.email as string,
      note: r.note,
      createdAt: r.created_at as string,
    })),
  );
}

/** Interest count per workshop, highest first (includes workshops with 0). */
export async function interestCounts(): Promise<{ workshopSlug: string; workshopTitle: string; status: string; count: number }[]> {
  const rows = await query<{ workshop_slug: string; n: number }>(
    `SELECT workshop_slug, COUNT(*) AS n FROM interest GROUP BY workshop_slug`,
  );
  const counts = new Map(rows.map((r) => [r.workshop_slug, Number(r.n)]));
  const all = await listWorkshops();
  return all
    .map((w) => ({ workshopSlug: w.slug, workshopTitle: w.title, status: w.status, count: counts.get(w.slug) ?? 0 }))
    .sort((a, b) => b.count - a.count);
}

// ───────────────────────── contact messages ─────────────────────────

export type ContactMessage = {
  id: string;
  name: string;
  email: string;
  topic: string | null;
  message: string;
  handled: boolean;
  createdAt: string;
};

export async function createContactMessage(input: {
  name: string;
  email: string;
  topic?: string | null;
  message: string;
}): Promise<void> {
  await execute(
    `INSERT INTO contact_messages (id, name, email, topic, message, handled, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)`,
    [
      newId(),
      input.name.trim().slice(0, 120),
      normaliseEmail(input.email),
      input.topic?.trim() || null,
      input.message.trim().slice(0, 5000),
      nowIso(),
    ],
  );
}

export async function listContactMessages(): Promise<ContactMessage[]> {
  const rows = await query<Record<string, string | number | null>>(`SELECT * FROM contact_messages ORDER BY created_at DESC`);
  return rows.map((r) => ({
    id: r.id as string,
    name: r.name as string,
    email: r.email as string,
    topic: r.topic as string | null,
    message: r.message as string,
    handled: Number(r.handled) === 1,
    createdAt: r.created_at as string,
  }));
}

export async function setContactHandled(id: string, handled: boolean): Promise<void> {
  await execute(`UPDATE contact_messages SET handled = ? WHERE id = ?`, [handled ? 1 : 0, id]);
}

// ───────────────────────── email log ─────────────────────────

export type EmailLogEntry = {
  id: string;
  toEmail: string;
  subject: string;
  bodyText: string;
  kind: string | null;
  status: "sent" | "logged" | "failed";
  error: string | null;
  createdAt: string;
};

export async function logEmail(entry: Omit<EmailLogEntry, "id" | "createdAt">): Promise<void> {
  await execute(
    `INSERT INTO email_log (id, to_email, subject, body_text, kind, status, error, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [newId(), entry.toEmail, entry.subject, entry.bodyText, entry.kind, entry.status, entry.error, nowIso()],
  );
}

export async function listEmailLog(limit = 200): Promise<EmailLogEntry[]> {
  const rows = await query<Record<string, string | null>>(`SELECT * FROM email_log ORDER BY created_at DESC LIMIT ?`, [limit]);
  return rows.map((r) => ({
    id: r.id as string,
    toEmail: r.to_email as string,
    subject: r.subject as string,
    bodyText: r.body_text as string,
    kind: r.kind,
    status: r.status as EmailLogEntry["status"],
    error: r.error,
    createdAt: r.created_at as string,
  }));
}

// ───────────────────────── dashboard stats ─────────────────────────

export type DashboardStats = {
  revenuePaise: number;
  workshopRevenuePaise: number;
  trainingRevenuePaise: number;
  paidRegistrations: number;
  paidTrainingBookings: number;
  uniqueStudents: number;
  returningStudents: number;
  pendingRegistrations: number;
  feedbackCount: number;
  openMessages: number;
  /** Bookings completed with simulated (demo) payments — excluded from every number above. */
  demoBookings: number;
};

/** Real (non-demo) paid bookings only — test bookings must never inflate revenue. */
const REAL = `COALESCE(payment_provider, '') != 'demo'`;

export async function dashboardStats(): Promise<DashboardStats> {
  const [reg] = await query<{ total: number | null; n: number }>(
    `SELECT SUM(amount_paise) AS total, COUNT(*) AS n FROM registrations WHERE status = 'paid' AND ${REAL}`,
  );
  const [tr] = await query<{ total: number | null; n: number }>(
    `SELECT SUM(amount_paise) AS total, COUNT(*) AS n FROM training_bookings
     WHERE status IN ('paid', 'completed') AND ${REAL}`,
  );
  const [students] = await query<{ n: number }>(
    `SELECT COUNT(*) AS n FROM (
       SELECT email FROM registrations WHERE status = 'paid' AND ${REAL}
       UNION SELECT email FROM training_bookings WHERE status IN ('paid', 'completed') AND ${REAL})`,
  );
  const [returning] = await query<{ n: number }>(
    `SELECT COUNT(*) AS n FROM (SELECT email FROM registrations WHERE status = 'paid' AND ${REAL}
       GROUP BY email HAVING COUNT(*) > 1)`,
  );
  const [pending] = await query<{ n: number }>(`SELECT COUNT(*) AS n FROM registrations WHERE status = 'pending'`);
  const [fb] = await query<{ n: number }>(`SELECT COUNT(*) AS n FROM feedback`);
  const [msgs] = await query<{ n: number }>(`SELECT COUNT(*) AS n FROM contact_messages WHERE handled = 0`);
  const [demo] = await query<{ n: number }>(
    `SELECT (SELECT COUNT(*) FROM registrations WHERE status = 'paid' AND payment_provider = 'demo')
          + (SELECT COUNT(*) FROM training_bookings WHERE status IN ('paid', 'completed') AND payment_provider = 'demo') AS n`,
  );
  const workshopRevenuePaise = Number(reg?.total ?? 0);
  const trainingRevenuePaise = Number(tr?.total ?? 0);
  return {
    revenuePaise: workshopRevenuePaise + trainingRevenuePaise,
    workshopRevenuePaise,
    trainingRevenuePaise,
    paidRegistrations: Number(reg?.n ?? 0),
    paidTrainingBookings: Number(tr?.n ?? 0),
    uniqueStudents: Number(students?.n ?? 0),
    returningStudents: Number(returning?.n ?? 0),
    pendingRegistrations: Number(pending?.n ?? 0),
    feedbackCount: Number(fb?.n ?? 0),
    openMessages: Number(msgs?.n ?? 0),
    demoBookings: Number(demo?.n ?? 0),
  };
}
