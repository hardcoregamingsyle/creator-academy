import { execute, newCode, newId, nowIso, query, queryOne } from "@/lib/db";
import { site } from "@/lib/site";
import { getWorkshop, type Workshop } from "@/content/workshops";
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
  status: RegistrationStatus;
  paymentProvider: string | null;
  providerOrderId: string | null;
  providerPaymentId: string | null;
  attended: boolean;
  createdAt: string;
  paidAt: string | null;
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
  status: RegistrationStatus;
  payment_provider: string | null;
  provider_order_id: string | null;
  provider_payment_id: string | null;
  attended: number;
  created_at: string;
  paid_at: string | null;
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
    status: r.status,
    paymentProvider: r.payment_provider,
    providerOrderId: r.provider_order_id,
    providerPaymentId: r.provider_payment_id,
    attended: Number(r.attended) === 1,
    createdAt: r.created_at,
    paidAt: r.paid_at,
  };
}

function mapRegWithSession(r: RegWithSessionRow): RegistrationWithSession {
  return {
    ...mapReg(r),
    sessionStartsAt: r.s_starts_at,
    sessionDurationMin: Number(r.s_duration_min),
    sessionStatus: r.s_status,
    meetingLink: r.s_meeting_link,
    workshopSlug: r.s_workshop_slug,
    workshop: getWorkshop(r.s_workshop_slug),
  };
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
 * Students who attended the immediately previous class get 10% off their next
 * class — once. Attendance is marked by the team in the admin dashboard.
 */
export async function checkReturningDiscount(emailRaw: string): Promise<DiscountCheck> {
  const email = normaliseEmail(emailRaw);
  if (!email) return { eligible: false };
  const prev = await getPreviousSession();
  if (!prev) return { eligible: false };

  const attended = await queryOne<{ n: number }>(
    `SELECT COUNT(*) AS n FROM registrations WHERE session_id = ? AND email = ? AND status = 'paid' AND attended = 1`,
    [prev.id, email],
  );
  if (!attended || Number(attended.n) === 0) return { eligible: false };

  const used = await queryOne<{ n: number }>(
    `SELECT COUNT(*) AS n FROM registrations WHERE email = ? AND discount_source_session_id = ?
       AND (status = 'paid' OR (status = 'pending' AND created_at > ?))`,
    [email, prev.id, holdCutoffIso()],
  );
  if (used && Number(used.n) > 0) return { eligible: false };

  return {
    eligible: true,
    percent: site.pricing.returningDiscountPercent,
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
  | { ok: true; registration: Registration; session: ClassSession; reused: boolean }
  | { ok: false; error: string; existingCode?: string };

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
  const paid = existing.find((r) => r.status === "paid");
  if (paid) {
    return {
      ok: false,
      error: "You're already registered for this session. Check your email for the confirmation.",
      existingCode: paid.code,
    };
  }
  const cutoff = holdCutoffIso();
  const freshPending = existing.find((r) => r.status === "pending" && r.created_at > cutoff);
  if (freshPending) {
    await execute(`UPDATE registrations SET name = ?, phone = ? WHERE id = ?`, [name, phone, freshPending.id]);
    return { ok: true, registration: mapReg({ ...freshPending, name, phone }), session, reused: true };
  }

  if (!isBookable(session)) return { ok: false, error: "Sorry — this session is full." };

  const discount = await checkReturningDiscount(email);
  const base = session.pricePaise;
  const { discountPaise, amountPaise } = discount.eligible
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
    discountSourceSessionId: discount.eligible ? discount.sourceSessionId : null,
    status: "pending",
    paymentProvider: null,
    providerOrderId: null,
    providerPaymentId: null,
    attended: false,
    createdAt: nowIso(),
    paidAt: null,
  };
  // Insert only if a seat is still free — checked in the same statement so two
  // people can't both grab the last seat.
  const inserted = await execute(
    `INSERT INTO registrations (id, code, session_id, name, email, phone, base_paise, discount_paise, amount_paise,
       discount_source_session_id, status, created_at)
     SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?
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
      reg.createdAt,
      reg.sessionId,
      cutoff,
      reg.sessionId,
    ],
  );
  if (inserted === 0) return { ok: false, error: "Sorry — this session just filled up." };
  return { ok: true, registration: reg, session, reused: false };
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
  return row ? mapRegWithSession(row) : null;
}

export async function getRegistrationById(id: string): Promise<RegistrationWithSession | null> {
  const row = await queryOne<RegWithSessionRow>(`${SELECT_WITH_SESSION} WHERE r.id = ?`, [id]);
  return row ? mapRegWithSession(row) : null;
}

export async function getRegistrationByOrderId(orderId: string): Promise<RegistrationWithSession | null> {
  const row = await queryOne<RegWithSessionRow>(`${SELECT_WITH_SESSION} WHERE r.provider_order_id = ?`, [orderId]);
  return row ? mapRegWithSession(row) : null;
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
  return rows.map(mapRegWithSession);
}

/** All registrations (any status) made with an email — for the student's own history. */
export async function listRegistrationsByEmail(email: string): Promise<RegistrationWithSession[]> {
  const rows = await query<RegWithSessionRow>(
    `${SELECT_WITH_SESSION} WHERE r.email = ? ORDER BY s.starts_at DESC`,
    [normaliseEmail(email)],
  );
  return rows.map(mapRegWithSession);
}

// ───────────────────────── mutations ─────────────────────────

export async function setRegistrationOrderId(id: string, orderId: string): Promise<void> {
  await execute(`UPDATE registrations SET provider_order_id = ?, payment_provider = 'razorpay' WHERE id = ?`, [orderId, id]);
}

/**
 * Mark a registration as paid. Idempotent: returns `true` only the first time,
 * so confirmation emails are sent exactly once.
 */
export async function markRegistrationPaid(
  id: string,
  payment: { provider: "razorpay" | "demo" | "manual"; paymentId?: string | null },
): Promise<boolean> {
  const changed = await execute(
    `UPDATE registrations SET status = 'paid', payment_provider = ?, provider_payment_id = ?, paid_at = ?
     WHERE id = ? AND status != 'paid'`,
    [payment.provider, payment.paymentId ?? null, nowIso(), id],
  );
  return changed > 0;
}

export async function setRegistrationStatus(id: string, status: RegistrationStatus): Promise<void> {
  await execute(`UPDATE registrations SET status = ? WHERE id = ?`, [status, id]);
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
