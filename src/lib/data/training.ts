import { execute, newCode, newId, nowIso, query, queryOne } from "@/lib/db";
import { training } from "@/lib/site";
import { normaliseEmail } from "./registrations";
import { holdCutoffIso } from "./sessions";

/**
 * Personal (1:1) training. The team publishes available start times ("slots")
 * in the admin dashboard; a student picks topic → duration → slot → pays.
 * A slot is only offered for a duration if that whole time window is free of
 * other 1:1 bookings and group workshops.
 */

export type TrainingSlot = {
  id: string;
  startsAt: string;
  isOpen: boolean;
  createdAt: string;
  /** Active (paid or held) booking occupying this slot, if any. */
  bookingCode: string | null;
  bookingStatus: string | null;
};

export type TrainingBookingStatus = "pending" | "paid" | "completed" | "failed" | "refunded" | "cancelled";

export type TrainingBooking = {
  id: string;
  code: string;
  slotId: string;
  startsAt: string;
  topic: string;
  durationMin: number;
  name: string;
  email: string;
  phone: string | null;
  goals: string | null;
  amountPaise: number;
  status: TrainingBookingStatus;
  paymentProvider: string | null;
  providerOrderId: string | null;
  providerPaymentId: string | null;
  meetingLink: string | null;
  createdAt: string;
  paidAt: string | null;
};

type BookingRow = {
  id: string;
  code: string;
  slot_id: string;
  slot_starts_at: string;
  topic: string;
  duration_min: number;
  name: string;
  email: string;
  phone: string | null;
  goals: string | null;
  amount_paise: number;
  status: TrainingBookingStatus;
  payment_provider: string | null;
  provider_order_id: string | null;
  provider_payment_id: string | null;
  meeting_link: string | null;
  created_at: string;
  paid_at: string | null;
};

function mapBooking(r: BookingRow): TrainingBooking {
  return {
    id: r.id,
    code: r.code,
    slotId: r.slot_id,
    startsAt: r.slot_starts_at,
    topic: r.topic,
    durationMin: Number(r.duration_min),
    name: r.name,
    email: r.email,
    phone: r.phone,
    goals: r.goals,
    amountPaise: Number(r.amount_paise),
    status: r.status,
    paymentProvider: r.payment_provider,
    providerOrderId: r.provider_order_id,
    providerPaymentId: r.provider_payment_id,
    meetingLink: r.meeting_link,
    createdAt: r.created_at,
    paidAt: r.paid_at,
  };
}

const SELECT_BOOKING = `
  SELECT b.*, t.starts_at AS slot_starts_at
  FROM training_bookings b JOIN training_slots t ON t.id = b.slot_id`;

/** SQL condition for a booking that currently occupies its slot. */
const ACTIVE_BOOKING = `(b.status IN ('paid', 'completed') OR (b.status = 'pending' AND b.created_at > ?))`;

// ───────────────────────── pricing tiers & topics ─────────────────────────
// Editable from /admin/pricing. Seeded once from the static defaults in
// src/lib/site.ts the first time either table is read.

export type TrainingDuration = { id: string; minutes: number; label: string; blurb: string; paise: number; sortOrder: number };
export type TrainingTopic = { id: string; label: string; sortOrder: number };

// INSERT OR IGNORE in both loops below (keyed on the UNIQUE minutes/label
// columns) makes this safe if two requests both see an empty table and race
// to seed it concurrently.
async function ensureTrainingConfigSeeded(): Promise<void> {
  const rows = await query<{ n: number }>(`SELECT COUNT(*) AS n FROM training_durations`);
  if (Number(rows[0]?.n ?? 0) === 0) {
    for (let i = 0; i < training.durations.length; i++) {
      const d = training.durations[i];
      await execute(
        `INSERT OR IGNORE INTO training_durations (id, minutes, label, blurb, price_paise, sort_order) VALUES (?, ?, ?, ?, ?, ?)`,
        [newId(), d.minutes, d.label, d.blurb, d.paise, i * 10],
      );
    }
  }
  const topicRows = await query<{ n: number }>(`SELECT COUNT(*) AS n FROM training_topics`);
  if (Number(topicRows[0]?.n ?? 0) === 0) {
    for (let i = 0; i < training.topics.length; i++) {
      await execute(`INSERT OR IGNORE INTO training_topics (id, label, sort_order) VALUES (?, ?, ?)`, [
        newId(),
        training.topics[i],
        i * 10,
      ]);
    }
  }
}

export async function listTrainingDurations(): Promise<TrainingDuration[]> {
  await ensureTrainingConfigSeeded();
  const rows = await query<{ id: string; minutes: number; label: string; blurb: string; price_paise: number; sort_order: number }>(
    `SELECT * FROM training_durations ORDER BY sort_order ASC`,
  );
  return rows.map((r) => ({
    id: r.id,
    minutes: Number(r.minutes),
    label: r.label,
    blurb: r.blurb,
    paise: Number(r.price_paise),
    sortOrder: Number(r.sort_order),
  }));
}

export async function createTrainingDuration(input: {
  minutes: number;
  label: string;
  blurb: string;
  paise: number;
}): Promise<{ ok: boolean; error?: string }> {
  await ensureTrainingConfigSeeded();
  const existing = await queryOne(`SELECT id FROM training_durations WHERE minutes = ?`, [input.minutes]);
  if (existing) return { ok: false, error: "A duration with this many minutes already exists." };
  const rows = await query<{ max_order: number | null }>(`SELECT MAX(sort_order) AS max_order FROM training_durations`);
  await execute(
    `INSERT INTO training_durations (id, minutes, label, blurb, price_paise, sort_order) VALUES (?, ?, ?, ?, ?, ?)`,
    [newId(), input.minutes, input.label.trim(), input.blurb.trim(), input.paise, (rows[0]?.max_order ?? -10) + 10],
  );
  return { ok: true };
}

export async function updateTrainingDuration(
  id: string,
  input: { minutes: number; label: string; blurb: string; paise: number },
): Promise<{ ok: boolean; error?: string }> {
  const clash = await queryOne(`SELECT id FROM training_durations WHERE minutes = ? AND id != ?`, [input.minutes, id]);
  if (clash) return { ok: false, error: "A duration with this many minutes already exists." };
  await execute(`UPDATE training_durations SET minutes = ?, label = ?, blurb = ?, price_paise = ? WHERE id = ?`, [
    input.minutes,
    input.label.trim(),
    input.blurb.trim(),
    input.paise,
    id,
  ]);
  return { ok: true };
}

export async function deleteTrainingDuration(id: string): Promise<void> {
  await execute(`DELETE FROM training_durations WHERE id = ?`, [id]);
}

export async function listTrainingTopics(): Promise<TrainingTopic[]> {
  await ensureTrainingConfigSeeded();
  const rows = await query<{ id: string; label: string; sort_order: number }>(
    `SELECT * FROM training_topics ORDER BY sort_order ASC`,
  );
  return rows.map((r) => ({ id: r.id, label: r.label, sortOrder: Number(r.sort_order) }));
}

export async function createTrainingTopic(label: string): Promise<{ ok: boolean; error?: string }> {
  await ensureTrainingConfigSeeded();
  const existing = await queryOne(`SELECT id FROM training_topics WHERE label = ?`, [label.trim()]);
  if (existing) return { ok: false, error: "This topic already exists." };
  const rows = await query<{ max_order: number | null }>(`SELECT MAX(sort_order) AS max_order FROM training_topics`);
  await execute(`INSERT INTO training_topics (id, label, sort_order) VALUES (?, ?, ?)`, [
    newId(),
    label.trim(),
    (rows[0]?.max_order ?? -10) + 10,
  ]);
  return { ok: true };
}

export async function deleteTrainingTopic(id: string): Promise<void> {
  await execute(`DELETE FROM training_topics WHERE id = ?`, [id]);
}

export async function priceForDuration(minutes: number): Promise<number | null> {
  const durations = await listTrainingDurations();
  return durations.find((d) => d.minutes === minutes)?.paise ?? null;
}

// ───────────────────────── slots ─────────────────────────

export async function listSlots(scope: "upcoming" | "all" = "upcoming"): Promise<TrainingSlot[]> {
  const rows = await query<{
    id: string;
    starts_at: string;
    is_open: number;
    created_at: string;
    booking_code: string | null;
    booking_status: string | null;
  }>(
    `SELECT t.*,
       (SELECT b.code FROM training_bookings b WHERE b.slot_id = t.id AND ${ACTIVE_BOOKING} ORDER BY b.created_at DESC LIMIT 1) AS booking_code,
       (SELECT b.status FROM training_bookings b WHERE b.slot_id = t.id AND ${ACTIVE_BOOKING} ORDER BY b.created_at DESC LIMIT 1) AS booking_status
     FROM training_slots t
     ${scope === "upcoming" ? "WHERE t.starts_at > ?" : ""}
     ORDER BY t.starts_at ASC`,
    scope === "upcoming" ? [holdCutoffIso(), holdCutoffIso(), nowIso()] : [holdCutoffIso(), holdCutoffIso()],
  );
  return rows.map((r) => ({
    id: r.id,
    startsAt: r.starts_at,
    isOpen: Number(r.is_open) === 1,
    createdAt: r.created_at,
    bookingCode: r.booking_code,
    bookingStatus: r.booking_status,
  }));
}

type Interval = { start: number; end: number };

async function busyIntervals(): Promise<Interval[]> {
  const since = new Date(Date.now() - 4 * 3600_000).toISOString();
  const bookings = await query<{ starts_at: string; duration_min: number }>(
    `SELECT t.starts_at, b.duration_min FROM training_bookings b JOIN training_slots t ON t.id = b.slot_id
     WHERE t.starts_at > ? AND ${ACTIVE_BOOKING}`,
    [since, holdCutoffIso()],
  );
  const classes = await query<{ starts_at: string; duration_min: number }>(
    `SELECT starts_at, duration_min FROM class_sessions WHERE status = 'scheduled' AND starts_at > ?`,
    [since],
  );
  return [...bookings, ...classes].map((b) => {
    const start = new Date(b.starts_at).getTime();
    return { start, end: start + Number(b.duration_min) * 60_000 };
  });
}

/**
 * Open slots a student can book, for every duration option.
 * Returns `{ 45: [...], 90: [...], 120: [...] }` (slots sorted by time).
 */
export async function listAvailableSlotsByDuration(): Promise<Record<number, { id: string; startsAt: string }[]>> {
  const minLead = Date.now() + 2 * 3600_000; // at least 2 hours' notice
  const slots = (await listSlots("upcoming")).filter(
    (s) => s.isOpen && !s.bookingCode && new Date(s.startsAt).getTime() > minLead,
  );
  const busy = await busyIntervals();
  const durations = await listTrainingDurations();
  const result: Record<number, { id: string; startsAt: string }[]> = {};
  for (const d of durations) {
    result[d.minutes] = slots
      .filter((s) => {
        const start = new Date(s.startsAt).getTime();
        const end = start + d.minutes * 60_000;
        return !busy.some((b) => start < b.end && b.start < end);
      })
      .map((s) => ({ id: s.id, startsAt: s.startsAt }));
  }
  return result;
}

export async function createSlot(startsAt: string): Promise<string> {
  const id = newId();
  await execute(`INSERT INTO training_slots (id, starts_at, is_open, created_at) VALUES (?, ?, 1, ?)`, [
    id,
    startsAt,
    nowIso(),
  ]);
  return id;
}

export async function setSlotOpen(id: string, open: boolean): Promise<void> {
  await execute(`UPDATE training_slots SET is_open = ? WHERE id = ?`, [open ? 1 : 0, id]);
}

/** Delete a slot only if it has never been booked (paid). */
export async function deleteSlot(id: string): Promise<{ ok: boolean; reason?: string }> {
  const booked = await queryOne<{ n: number }>(
    `SELECT COUNT(*) AS n FROM training_bookings WHERE slot_id = ? AND status IN ('paid', 'completed')`,
    [id],
  );
  if (booked && Number(booked.n) > 0) return { ok: false, reason: "This slot has a paid booking — close it instead." };
  await execute(`DELETE FROM training_bookings WHERE slot_id = ?`, [id]);
  await execute(`DELETE FROM training_slots WHERE id = ?`, [id]);
  return { ok: true };
}

// ───────────────────────── bookings ─────────────────────────

export type TrainingBookingInput = {
  slotId: string;
  topic: string;
  durationMin: number;
  name: string;
  email: string;
  phone?: string | null;
  goals?: string | null;
};

export type TrainingBookingResult = { ok: true; booking: TrainingBooking } | { ok: false; error: string };

export async function createPendingTrainingBooking(input: TrainingBookingInput): Promise<TrainingBookingResult> {
  const price = await priceForDuration(input.durationMin);
  if (!price) return { ok: false, error: "Please choose a valid session length." };

  const available = await listAvailableSlotsByDuration();
  const slot = (available[input.durationMin] ?? []).find((s) => s.id === input.slotId);
  if (!slot) {
    return { ok: false, error: "Sorry — that time was just taken or isn't available for this length. Please pick another." };
  }

  const booking: TrainingBooking = {
    id: newId(),
    code: newCode("PT"),
    slotId: slot.id,
    startsAt: slot.startsAt,
    topic: input.topic.trim(),
    durationMin: input.durationMin,
    name: input.name.trim(),
    email: normaliseEmail(input.email),
    phone: input.phone?.trim() || null,
    goals: input.goals?.trim() || null,
    amountPaise: price,
    status: "pending",
    paymentProvider: null,
    providerOrderId: null,
    providerPaymentId: null,
    meetingLink: null,
    createdAt: nowIso(),
    paidAt: null,
  };
  // Insert only if nobody else holds this slot — checked in the same statement
  // so two students can't book the same 1:1 time.
  const inserted = await execute(
    `INSERT INTO training_bookings (id, code, slot_id, topic, duration_min, name, email, phone, goals, amount_paise, status, created_at)
     SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?
     WHERE NOT EXISTS (SELECT 1 FROM training_bookings b WHERE b.slot_id = ? AND ${ACTIVE_BOOKING})`,
    [
      booking.id,
      booking.code,
      booking.slotId,
      booking.topic,
      booking.durationMin,
      booking.name,
      booking.email,
      booking.phone,
      booking.goals,
      booking.amountPaise,
      booking.createdAt,
      booking.slotId,
      holdCutoffIso(),
    ],
  );
  if (inserted === 0) {
    return { ok: false, error: "Sorry — that time was just taken. Please pick another." };
  }
  return { ok: true, booking };
}

/**
 * Before taking payment for a pending booking whose hold has expired,
 * re-reserve the slot (only if nobody else has taken it meanwhile).
 */
export async function renewTrainingHold(id: string): Promise<boolean> {
  const cutoff = holdCutoffIso();
  const changed = await execute(
    `UPDATE training_bookings SET created_at = ?
     WHERE id = ? AND status = 'pending' AND (
       created_at > ? OR NOT EXISTS (
         SELECT 1 FROM training_bookings b WHERE b.slot_id = training_bookings.slot_id AND b.id != training_bookings.id
           AND ${ACTIVE_BOOKING}))`,
    [nowIso(), id, cutoff, cutoff],
  );
  return changed > 0;
}

export async function getTrainingBookingByCode(code: string): Promise<TrainingBooking | null> {
  const row = await queryOne<BookingRow>(`${SELECT_BOOKING} WHERE b.code = ?`, [code.trim().toUpperCase()]);
  return row ? mapBooking(row) : null;
}

export async function getTrainingBookingById(id: string): Promise<TrainingBooking | null> {
  const row = await queryOne<BookingRow>(`${SELECT_BOOKING} WHERE b.id = ?`, [id]);
  return row ? mapBooking(row) : null;
}

export async function getTrainingBookingByOrderId(orderId: string): Promise<TrainingBooking | null> {
  const row = await queryOne<BookingRow>(`${SELECT_BOOKING} WHERE b.provider_order_id = ?`, [orderId]);
  return row ? mapBooking(row) : null;
}

export async function listTrainingBookings(
  opts: { status?: TrainingBookingStatus | "all"; scope?: "upcoming" | "past" | "all" } = {},
): Promise<TrainingBooking[]> {
  const where: string[] = [];
  const args: string[] = [];
  if (opts.status && opts.status !== "all") {
    where.push("b.status = ?");
    args.push(opts.status);
  }
  if (opts.scope === "upcoming") {
    where.push("t.starts_at > ?");
    args.push(nowIso());
  } else if (opts.scope === "past") {
    where.push("t.starts_at <= ?");
    args.push(nowIso());
  }
  const sql = `${SELECT_BOOKING}${where.length ? ` WHERE ${where.join(" AND ")}` : ""} ORDER BY t.starts_at ${
    opts.scope === "past" ? "DESC" : "ASC"
  }`;
  const rows = await query<BookingRow>(sql, args);
  return rows.map(mapBooking);
}

export async function setTrainingOrderId(id: string, orderId: string): Promise<void> {
  await execute(`UPDATE training_bookings SET provider_order_id = ?, payment_provider = 'razorpay' WHERE id = ?`, [
    orderId,
    id,
  ]);
}

/** Idempotent — returns true only the first time the booking becomes paid. */
export async function markTrainingPaid(
  id: string,
  payment: { provider: "razorpay" | "demo" | "manual"; paymentId?: string | null },
): Promise<boolean> {
  const changed = await execute(
    `UPDATE training_bookings SET status = 'paid', payment_provider = ?, provider_payment_id = ?, paid_at = ?
     WHERE id = ? AND status NOT IN ('paid', 'completed')`,
    [payment.provider, payment.paymentId ?? null, nowIso(), id],
  );
  return changed > 0;
}

export async function setTrainingStatus(id: string, status: TrainingBookingStatus): Promise<void> {
  await execute(`UPDATE training_bookings SET status = ? WHERE id = ?`, [status, id]);
}

export async function setTrainingMeetingLink(id: string, link: string | null): Promise<void> {
  await execute(`UPDATE training_bookings SET meeting_link = ? WHERE id = ?`, [link || null, id]);
}

/** All training bookings made with an email (newest session first). */
export async function listTrainingBookingsByEmail(email: string): Promise<TrainingBooking[]> {
  const rows = await query<BookingRow>(`${SELECT_BOOKING} WHERE b.email = ? ORDER BY t.starts_at DESC`, [
    normaliseEmail(email),
  ]);
  return rows.map(mapBooking);
}
