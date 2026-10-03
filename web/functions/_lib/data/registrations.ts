import { execute, newCode, newId, nowIso, query, queryOne } from "../db";
import { istMonthKey } from "../../../shared/format";
import { getSiteSettings } from "./site-settings";
import { getWorkshop, workshopMap } from "./workshops";
import { type Workshop } from "../../../shared/content";
import { hasActivePass } from "./monthly-pass";
import { getPreviousSession, getSession, holdCutoffIso, isBookable, type ClassSession } from "./sessions";

export type RegistrationStatus = "pending" | "paid" | "failed" | "refunded" | "cancelled";

export type Registration = {
  id: string;
  code: string;
  sessionId: string;
  name: string;
  email: string;
  phone: string | null;
  basePaise: number;
  discountPaise: number;
  amountPaise: number;
  discountSourceSessionId: string | null;
  /** Set when this booking was fully covered by a Monthly Pass instead of paid individually. */
  coveredByPassId: string | null;
  status: RegistrationStatus;
  paymentProvider: string | null;
  providerOrderId: string | null;
  providerPaymentId: string | null;
  attended: boolean;
  createdAt: string;
  paidAt: string | null;
  /** Self-service refund / move bookkeeping (see _lib/refunds.ts). */
  refundId: string | null;
  refundedAt: string | null;
  refundAmountPaise: number | null;
  movedCount: number;
  originalSessionId: string | null;
};

export type RegistrationWithSession = Registration & {
  sessionStartsAt: string;
  sessionDurationMin: number;
  sessionStatus: string;
  meetingLink: string | null;
  workshopSlug: string;
  workshop: Workshop | undefined;
};

type RegRow = {
  id: string;
  code: string;
  session_id: string;
  name: string;
  email: string;
  phone: string | null;
  base_paise: number;
  discount_paise: number;
  amount_paise: number;
  discount_source_session_id: string | null;
  covered_by_pass_id: string | null;
  status: RegistrationStatus;
  payment_provider: string | null;
  provider_order_id: string | null;
  provider_payment_id: string | null;
  attended: number;
  created_at: string;
  paid_at: string | null;
  refund_id: string | null;
  refunded_at: string | null;
  refund_amount_paise: number | null;
  moved_count: number;
  original_session_id: string | null;
};

type RegWithSessionRow = RegRow & {
  s_starts_at: string;
  s_duration_min: number;
  s_status: string;
  s_meeting_link: string | null;
  s_workshop_slug: string;
};

function mapReg(r: RegRow): Registration {
  return {
    id: r.id,
    code: r.code,
    sessionId: r.session_id,
    name: r.name,
    email: r.email,
    phone: r.phone,
    basePaise: Number(r.base_paise),
    discountPaise: Number(r.discount_paise),
    amountPaise: Number(r.amount_paise),
    discountSourceSessionId: r.discount_source_session_id,
    coveredByPassId: r.covered_by_pass_id,
    status: r.status,
    paymentProvider: r.payment_provider,
    providerOrderId: r.provider_order_id,
    providerPaymentId: r.provider_payment_id,
    attended: Number(r.attended) === 1,
    createdAt: r.created_at,
    paidAt: r.paid_at,
    refundId: r.refund_id ?? null,
    refundedAt: r.refunded_at ?? null,
    refundAmountPaise: r.refund_amount_paise === null || r.refund_amount_paise === undefined ? null : Number(r.refund_amount_paise),
    movedCount: Number(r.moved_count ?? 0),
    originalSessionId: r.original_session_id ?? null,
  };
}

function mapRegWithSession(r: RegWithSessionRow, workshop: Workshop | undefined): RegistrationWithSession {
  return {
    ...mapReg(r),
    sessionStartsAt: r.s_starts_at,
    sessionDurationMin: Number(r.s_duration_min),
    sessionStatus: r.s_status,
    meetingLink: r.s_meeting_link,
    workshopSlug: r.s_workshop_slug,
    workshop,
  };
}

async function mapRegsWithSession(rows: RegWithSessionRow[]): Promise<RegistrationWithSession[]> {
  if (rows.length === 0) return [];
  const workshops = await workshopMap();
  return rows.map((r) => mapRegWithSession(r, workshops.get(r.s_workshop_slug)));
}

async function mapOneRegWithSession(row: RegWithSessionRow): Promise<RegistrationWithSession> {
  return mapRegWithSession(row, (await getWorkshop(row.s_workshop_slug)) ?? undefined);
}

const SELECT_WITH_SESSION = `
  SELECT r.*, s.starts_at AS s_starts_at, s.duration_min AS s_duration_min, s.status AS s_status,
         s.meeting_link AS s_meeting_link, s.workshop_slug AS s_workshop_slug
  FROM registrations r JOIN class_sessions s ON s.id = r.session_id`;

export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

// ───────────────────────── returning-student discount ─────────────────────────

export type DiscountCheck =
  | { eligible: true; percent: number; sourceSessionId: string; sourceWorkshopTitle: string }
  | { eligible: false };

/**
 * Students who attended the immediately previous class get the returning-student
 * discount (a DB setting) on their next class — once. Attendance is marked by the team in the admin dashboard.
 */
export async function checkReturningDiscount(emailRaw: string): Promise<DiscountCheck> {
  const email = normaliseEmail(emailRaw);
  if (!email) return { eligible: false };
  const prev = await getPreviousSession();
  if (!prev) return { eligible: false };

  // Independent of each other (both only need prev.id), so one round trip, not two.
  const [attended, used] = await Promise.all([
    queryOne<{ n: number }>(
      `SELECT COUNT(*) AS n FROM registrations WHERE session_id = ? AND email = ? AND status = 'paid' AND attended = 1`,
      [prev.id, email],
    ),
    queryOne<{ n: number }>(
      `SELECT COUNT(*) AS n FROM registrations WHERE email = ? AND discount_source_session_id = ?
         AND (status = 'paid' OR (status = 'pending' AND created_at > ?))`,
      [email, prev.id, holdCutoffIso()],
    ),
  ]);
  if (!attended || Number(attended.n) === 0) return { eligible: false };
  if (used && Number(used.n) > 0) return { eligible: false };

  const settings = await getSiteSettings();
  return {
    eligible: true,
    percent: settings.returningDiscountPercent,
    sourceSessionId: prev.id,
    sourceWorkshopTitle: prev.workshop?.title ?? "your previous class",
  };
}

export function applyDiscount(basePaise: number, percent: number): { discountPaise: number; amountPaise: number } {
  const discountPaise = Math.round((basePaise * percent) / 100);
  return { discountPaise, amountPaise: basePaise - discountPaise };
}

// ───────────────────────── booking ─────────────────────────

export type BookingInput = {
  sessionId: string;
  name: string;
  email: string;
  phone?: string | null;
};

export type BookingResult =
  | { ok: true; registration: Registration; session: ClassSession; reused: boolean; coveredByPass?: boolean }
  | { ok: false; error: string };

/**
 * Create (or reuse) a pending registration for a session. The seat is held for
 * `site.seatHoldMinutes` until payment completes.
 */
export async function createPendingRegistration(input: BookingInput): Promise<BookingResult> {
  const session = await getSession(input.sessionId);
  if (!session || !session.workshop) return { ok: false, error: "This session could not be found." };
  if (session.status !== "scheduled") return { ok: false, error: "This session is no longer taking bookings." };
  if (new Date(session.startsAt).getTime() <= Date.now()) return { ok: false, error: "This session has already started." };

  const email = normaliseEmail(input.email);
  const name = input.name.trim();
  const phone = input.phone?.trim() || null;

  // Already registered?
  const existing = await query<RegRow>(
    `SELECT * FROM registrations WHERE session_id = ? AND email = ? ORDER BY created_at DESC`,
    [session.id, email],
  );
  if (existing.some((r) => r.status === "paid")) {
    // Never hand back the booking code here: anyone who knows the email could use it to open the paid join link.
    return {
      ok: false,
      error:
        "You're already registered for this session. Check your email for the confirmation. " +
        `If you can't find it, use "Find my booking" at /booking and we'll re-send your booking link.`,
    };
  }
  const cutoff = holdCutoffIso();
  const freshPending = existing.find((r) => r.status === "pending" && r.created_at > cutoff);
  if (freshPending) {
    // Re-use the open hold as it is. The stored name/phone are NOT overwritten: this request is
    // unauthenticated, so anyone typing the same email must not be able to rewrite someone else's booking.
    return { ok: true, registration: mapReg(freshPending), session, reused: true };
  }

  if (!isBookable(session)) return { ok: false, error: "Sorry — this session is full." };

  // A Monthly Pass covering this session's month gives free entry — checked
  // ahead of the returning-student discount, since it fully replaces it.
  // The two lookups are independent, so they run together (a pass makes the discount moot, but that's the rare case).
  const [activePass, returning] = await Promise.all([
    hasActivePass(email, istMonthKey(session.startsAt)),
    checkReturningDiscount(email),
  ]);
  const base = session.pricePaise;
  const discount = activePass ? null : returning;
  const { discountPaise, amountPaise } = activePass
    ? { discountPaise: base, amountPaise: 0 }
    : discount?.eligible
      ? applyDiscount(base, discount.percent)
      : { discountPaise: 0, amountPaise: base };

  const reg: Registration = {
    id: newId(),
    code: newCode("CA"),
    sessionId: session.id,
    name,
    email,
    phone,
    basePaise: base,
    discountPaise,
    amountPaise,
    discountSourceSessionId: discount?.eligible ? discount.sourceSessionId : null,
    coveredByPassId: activePass?.id ?? null,
    status: activePass ? "paid" : "pending",
    paymentProvider: activePass ? "pass" : null,
    providerOrderId: null,
    providerPaymentId: null,
    attended: false,
    createdAt: nowIso(),
    paidAt: activePass ? nowIso() : null,
    refundId: null,
    refundedAt: null,
    refundAmountPaise: null,
    movedCount: 0,
    originalSessionId: null,
  };
  // Insert only if a seat is still free — checked in the same statement so two
  // people can't both grab the last seat. Pass-covered bookings go straight to
  // 'paid' (no payment step), everyone else starts 'pending' and holds the
  // seat for site.seatHoldMinutes.
  const inserted = await execute(
    `INSERT INTO registrations (id, code, session_id, name, email, phone, base_paise, discount_paise, amount_paise,
       discount_source_session_id, covered_by_pass_id, status, payment_provider, created_at, paid_at)
     SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
     WHERE (SELECT COUNT(*) FROM registrations r WHERE r.session_id = ?
              AND (r.status = 'paid' OR (r.status = 'pending' AND r.created_at > ?)))
         < (SELECT capacity FROM class_sessions WHERE id = ?)`,
    [
      reg.id,
      reg.code,
      reg.sessionId,
      reg.name,
      reg.email,
      reg.phone,
      reg.basePaise,
      reg.discountPaise,
      reg.amountPaise,
      reg.discountSourceSessionId,
      reg.coveredByPassId,
      reg.status,
      reg.paymentProvider,
      reg.createdAt,
      reg.paidAt,
      reg.sessionId,
      cutoff,
      reg.sessionId,
    ],
  );
  if (inserted === 0) return { ok: false, error: "Sorry — this session just filled up." };
  return { ok: true, registration: reg, session, reused: false, coveredByPass: Boolean(activePass) };
}

/**
 * Before taking payment for a pending registration whose seat hold has
 * expired, re-reserve the seat (only if one is still free). Returns false if
 * the session filled up in the meantime.
 */
export async function renewSeatHold(id: string): Promise<boolean> {
  const cutoff = holdCutoffIso();
  const changed = await execute(
    `UPDATE registrations SET created_at = ?
     WHERE id = ? AND status = 'pending' AND (
       created_at > ? OR
       (SELECT COUNT(*) FROM registrations r WHERE r.session_id = registrations.session_id AND r.id != registrations.id
          AND (r.status = 'paid' OR (r.status = 'pending' AND r.created_at > ?)))
       < (SELECT capacity FROM class_sessions s WHERE s.id = registrations.session_id))`,
    [nowIso(), id, cutoff, cutoff],
  );
  return changed > 0;
}

// ───────────────────────── lookups ─────────────────────────

export async function getRegistrationByCode(code: string): Promise<RegistrationWithSession | null> {
  const row = await queryOne<RegWithSessionRow>(`${SELECT_WITH_SESSION} WHERE r.code = ?`, [code.trim().toUpperCase()]);
  return row ? await mapOneRegWithSession(row) : null;
}

export async function getRegistrationById(id: string): Promise<RegistrationWithSession | null> {
  const row = await queryOne<RegWithSessionRow>(`${SELECT_WITH_SESSION} WHERE r.id = ?`, [id]);
  return row ? await mapOneRegWithSession(row) : null;
}

export async function getRegistrationByOrderId(orderId: string): Promise<RegistrationWithSession | null> {
  const row = await queryOne<RegWithSessionRow>(`${SELECT_WITH_SESSION} WHERE r.provider_order_id = ?`, [orderId]);
  return row ? await mapOneRegWithSession(row) : null;
}

export async function listRegistrations(
  opts: { sessionId?: string; status?: RegistrationStatus | "all"; search?: string; limit?: number } = {},
): Promise<RegistrationWithSession[]> {
  const where: string[] = [];
  const args: (string | number)[] = [];
  if (opts.sessionId) {
    where.push("r.session_id = ?");
    args.push(opts.sessionId);
  }
  if (opts.status && opts.status !== "all") {
    where.push("r.status = ?");
    args.push(opts.status);
  }
  if (opts.search) {
    where.push("(r.name LIKE ? OR r.email LIKE ? OR r.code LIKE ? OR r.phone LIKE ?)");
    const q = `%${opts.search.trim()}%`;
    args.push(q, q, q, q);
  }
  let sql = SELECT_WITH_SESSION;
  if (where.length) sql += ` WHERE ${where.join(" AND ")}`;
  sql += ` ORDER BY r.created_at DESC`;
  if (opts.limit) {
    sql += ` LIMIT ?`;
    args.push(opts.limit);
  }
  const rows = await query<RegWithSessionRow>(sql, args);
  return mapRegsWithSession(rows);
}

/** All registrations (any status) made with an email — for the student's own history. */
export async function listRegistrationsByEmail(email: string): Promise<RegistrationWithSession[]> {
  const rows = await query<RegWithSessionRow>(
    `${SELECT_WITH_SESSION} WHERE r.email = ? ORDER BY s.starts_at DESC`,
    [normaliseEmail(email)],
  );
  return mapRegsWithSession(rows);
}

// ───────────────────────── 24h reminders ─────────────────────────

/**
 * Paid registrations due the automatic 24h reminder: the class is still scheduled and starts within the next
 * 24h, nothing was sent yet, and the booking was made at least 24h before the class (later bookings got their
 * confirmation email less than a day ahead, so they are skipped and never marked). Soonest class first.
 */
export async function listDueReminders(limit: number): Promise<RegistrationWithSession[]> {
  const now = Date.now();
  const rows = await query<RegWithSessionRow>(
    `${SELECT_WITH_SESSION}
     WHERE r.status = 'paid' AND r.reminder_sent_at IS NULL AND s.status = 'scheduled'
       AND s.starts_at > ? AND s.starts_at <= ?
       AND CAST(strftime('%s', r.created_at) AS INTEGER) <= CAST(strftime('%s', s.starts_at) AS INTEGER) - 86400
     ORDER BY s.starts_at ASC, r.created_at ASC
     LIMIT ?`,
    [new Date(now).toISOString(), new Date(now + 24 * 3600_000).toISOString(), limit],
  );
  return mapRegsWithSession(rows);
}

/** Record that the reminder email went out for exactly these registrations. */
export async function markRemindersSent(ids: string[]): Promise<void> {
  if (!ids.length) return;
  await execute(`UPDATE registrations SET reminder_sent_at = ? WHERE id IN (${ids.map(() => "?").join(",")})`, [nowIso(), ...ids]);
}

// ───────────────────────── mutations ─────────────────────────

export async function setRegistrationOrderId(id: string, orderId: string): Promise<void> {
  await execute(`UPDATE registrations SET provider_order_id = ?, payment_provider = 'razorpay' WHERE id = ?`, [orderId, id]);
}

/**
 * Mark a registration as paid. Idempotent: returns `true` only the first time,
 * so confirmation emails are sent exactly once.
 *
 * A booking that has been refunded is never flipped back to paid by the payment flows (a late or replayed Razorpay
 * webhook for the same payment would otherwise hand the seat back for free). Only the admin's explicit manual
 * "mark paid" passes `force`.
 */
export async function markRegistrationPaid(
  id: string,
  payment: { provider: "razorpay" | "demo" | "manual"; paymentId?: string | null; force?: boolean },
): Promise<boolean> {
  const changed = await execute(
    `UPDATE registrations SET status = 'paid', payment_provider = ?, provider_payment_id = ?, paid_at = ?
     WHERE id = ? AND status != 'paid'${payment.force ? "" : " AND status != 'refunded' AND refund_id IS NULL"}`,
    [payment.provider, payment.paymentId ?? null, nowIso(), id],
  );
  return changed > 0;
}

export async function setRegistrationStatus(id: string, status: RegistrationStatus): Promise<void> {
  await execute(`UPDATE registrations SET status = ? WHERE id = ?`, [status, id]);
}

/** Paid registrations of one session (soonest-booked first), at most `limit` — for the admin's refund-all. */
export async function listPaidRegistrationIds(sessionId: string, limit: number): Promise<string[]> {
  const rows = await query<{ id: string }>(
    `SELECT id FROM registrations WHERE session_id = ? AND status = 'paid' ORDER BY created_at ASC LIMIT ?`,
    [sessionId, limit],
  );
  return rows.map((r) => r.id);
}

export async function setAttendance(id: string, attended: boolean): Promise<void> {
  await execute(`UPDATE registrations SET attended = ? WHERE id = ?`, [attended ? 1 : 0, id]);
}

export async function markAllAttended(sessionId: string): Promise<void> {
  await execute(`UPDATE registrations SET attended = 1 WHERE session_id = ? AND status = 'paid'`, [sessionId]);
}

/** Manually add a paid registration (e.g. a student who paid another way). */
export async function addManualRegistration(input: BookingInput & { amountPaise?: number }): Promise<string> {
  const session = await getSession(input.sessionId);
  if (!session) throw new Error("Session not found");
  const id = newId();
  const code = newCode("CA");
  const amount = input.amountPaise ?? session.pricePaise;
  await execute(
    `INSERT INTO registrations (id, code, session_id, name, email, phone, base_paise, discount_paise, amount_paise,
       status, payment_provider, created_at, paid_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'paid', 'manual', ?, ?)`,
    [
      id,
      code,
      session.id,
      input.name.trim(),
      normaliseEmail(input.email),
      input.phone?.trim() || null,
      session.pricePaise,
      Math.max(0, session.pricePaise - amount),
      amount,
      nowIso(),
      nowIso(),
    ],
  );
  return code;
}
