import { execute, nowIso } from "./db";
import { formatDateTime, formatINR, istMonthKey } from "../../shared/format";
import { getRegistrationById, type RegistrationWithSession } from "./data/registrations";
import { getSession, holdCutoffIso, listUpcomingSessions, type ClassSession } from "./data/sessions";
import type { TrainingBooking } from "./data/training";
import { sendEmail } from "./email";
import {
  refundCustomerEmail,
  refundOwnerEmail,
  workshopMovedEmail,
  type RefundNoticeInfo,
  type RefundOutcome,
} from "./email-templates";
import { refundRazorpayPayment } from "./payments";

/**
 * Self-service cancel / refund / move for paid bookings. No HTTP concerns here: the routes (customer pages and the
 * admin dashboard) call these and translate the result.
 *
 * Policy (published in src/pages/public-core/policy-content.tsx):
 *   - group workshop, cancelled 24h or MORE before the class starts: full refund OR a free move to another date;
 *   - less than 24h before: no refund (we only help by email);
 *   - a class WE cancelled (class_sessions.status = 'cancelled'): refund or move at any time;
 *   - personal training: cancelled 24h or more before = full refund, otherwise none (rescheduling stays by email);
 *   - the refund is exactly what was PAID (amount_paise, after the returning-student discount), never more.
 *
 * Safety: money moves only after an ATOMIC claim (paid -> cancelled, rowsAffected must be 1), so two clicks, two
 * tabs or parallel requests can never refund twice. If Razorpay refuses, the claim is reverted and nothing is sent.
 */

export const REFUND_NOTICE_MS = 24 * 3_600_000;
export const MAX_MOVES = 3;
export const REFUND_TIMELINE = "5-7 business days";

export type RefundActor = "customer" | "admin";

export type ChangeOptions = {
  canRefund: boolean;
  canMove: boolean;
  /** When the free cancel/move window closes (24h before the class); null when it doesn't apply (we cancelled, or not paid). */
  deadlineAt: string | null;
  /** Plain-words explanation, shown to the customer when something isn't possible (and as the summary when it is). */
  reason: string;
  cancelledByUs: boolean;
  movesLeft: number;
};

// ───────────────────────── eligibility ─────────────────────────

/** Would this booking's refund go through the Razorpay API (instead of the demo / manual / nothing-to-refund paths)? */
export function refundsViaApi(b: { paymentProvider: string | null; providerPaymentId: string | null; amountPaise: number }): boolean {
  return b.paymentProvider === "razorpay" && Boolean(b.providerPaymentId) && b.amountPaise >= 100;
}

/** Paid, on Razorpay with a payment id: the admin can refund it with one click. */
export function isAutoRefundable(b: {
  status: string;
  paymentProvider: string | null;
  providerPaymentId: string | null;
  amountPaise: number;
  refundId?: string | null;
}): boolean {
  return b.status === "paid" && !b.refundId && refundsViaApi(b);
}

/** One sentence about where the money goes, for the booking page. */
export function refundMethodNote(b: { paymentProvider: string | null; providerPaymentId: string | null; amountPaise: number }): string {
  if (b.amountPaise <= 0) return "Nothing was charged for this booking, so there is nothing to refund. Cancelling just releases your seat.";
  if (b.paymentProvider === "demo") return "This is a test booking: no real money was taken, so nothing will reach a card or bank account.";
  if (refundsViaApi(b)) return `Refunded to your original payment method in ${REFUND_TIMELINE}.`;
  return "This booking wasn't paid through our website checkout, so we will refund it manually and email you when it is done.";
}

/** Workshop booking: what the customer may do right now. */
export function evaluateWorkshopOptions(
  reg: Pick<RegistrationWithSession, "status" | "sessionStartsAt" | "sessionStatus" | "movedCount">,
  now: Date | number = Date.now(),
): ChangeOptions {
  const nowMs = typeof now === "number" ? now : now.getTime();
  const movesLeft = Math.max(0, MAX_MOVES - reg.movedCount);
  const none = (reason: string, cancelledByUs = false, deadlineAt: string | null = null): ChangeOptions => ({
    canRefund: false,
    canMove: false,
    deadlineAt,
    reason,
    cancelledByUs,
    movesLeft,
  });
  const movesUsedUp = `You have already moved this booking ${MAX_MOVES} times, which is the limit. You can still cancel it for a refund, or email us for anything else.`;

  if (reg.status !== "paid") return none("This booking isn't an active paid booking, so there is nothing to refund or move.");

  if (reg.sessionStatus === "cancelled") {
    return {
      canRefund: true,
      canMove: movesLeft > 0,
      deadlineAt: null,
      reason:
        movesLeft > 0
          ? "We had to cancel this class, so you can choose a full refund or a free move to another date, whenever you like."
          : movesUsedUp,
      cancelledByUs: true,
      movesLeft,
    };
  }

  if (reg.sessionStatus !== "scheduled") {
    return none("This class has already taken place, so it can no longer be cancelled or moved online. Email us if you need help.");
  }

  const startsAt = new Date(reg.sessionStartsAt).getTime();
  const deadlineAt = new Date(startsAt - REFUND_NOTICE_MS).toISOString();
  if (startsAt <= nowMs) {
    return none("This class has already started, so it can no longer be cancelled or moved online. Email us if you need help.", false, deadlineAt);
  }
  if (startsAt - nowMs < REFUND_NOTICE_MS) {
    return none(
      `Free cancellation and moves close 24 hours before the class starts (that was ${formatDateTime(deadlineAt)}), so this booking can no longer be refunded or moved online. Email us and we will do our best to help.`,
      false,
      deadlineAt,
    );
  }
  return {
    canRefund: true,
    canMove: movesLeft > 0,
    deadlineAt,
    reason:
      movesLeft > 0
        ? `You can cancel for a full refund, or move for free, until ${formatDateTime(deadlineAt)}.`
        : movesUsedUp,
    cancelledByUs: false,
    movesLeft,
  };
}

/** Personal training: refund only (rescheduling stays by email). */
export function evaluateTrainingOptions(
  b: Pick<TrainingBooking, "status" | "startsAt">,
  now: Date | number = Date.now(),
): { canRefund: boolean; deadlineAt: string | null; reason: string } {
  const nowMs = typeof now === "number" ? now : now.getTime();
  if (b.status !== "paid") {
    return { canRefund: false, deadlineAt: null, reason: "This booking isn't an active paid booking, so there is nothing to refund." };
  }
  const startsAt = new Date(b.startsAt).getTime();
  const deadlineAt = new Date(startsAt - REFUND_NOTICE_MS).toISOString();
  if (startsAt <= nowMs) {
    return { canRefund: false, deadlineAt, reason: "This session has already started, so it can no longer be cancelled online. Email us if you need help." };
  }
  if (startsAt - nowMs < REFUND_NOTICE_MS) {
    return {
      canRefund: false,
      deadlineAt,
      reason: `Free cancellation closes 24 hours before the session (that was ${formatDateTime(deadlineAt)}), so this booking can no longer be refunded online. Email us and we will do our best to help.`,
    };
  }
  return { canRefund: true, deadlineAt, reason: `You can cancel for a full refund until ${formatDateTime(deadlineAt)}.` };
}

/** Other dates of the same workshop this booking could move to: scheduled, in the future, with a free seat. */
export async function listMoveAlternatives(reg: RegistrationWithSession): Promise<ClassSession[]> {
  const upcoming = await listUpcomingSessions({ workshopSlug: reg.workshopSlug });
  const month = istMonthKey(reg.sessionStartsAt);
  return upcoming
    // A Monthly Pass only covers classes of its own month.
    .filter((s) => s.id !== reg.sessionId && s.seatsLeft > 0 && (!reg.coveredByPassId || istMonthKey(s.startsAt) === month))
    .slice(0, 12);
}

// ───────────────────────── refunds ─────────────────────────

export type RefundResult =
  | { ok: true; status: "refunded" | "cancelled"; outcome: RefundOutcome; amountPaise: number; refundId: string | null; message: string }
  | { ok: false; httpStatus: 409 | 502; message: string };

type RefundTarget = {
  table: "registrations" | "training_bookings";
  /** The session / slot the eligibility was judged against: the claim only succeeds if the booking is still on it. */
  guardColumn: "session_id" | "slot_id";
  guardValue: string;
  id: string;
  code: string;
  amountPaise: number;
  provider: string | null;
  paymentId: string | null;
  notes: Record<string, string>;
};

const ALREADY_DONE = "This booking has already been cancelled or refunded, or it was just changed. Please reload the page.";
const PROVIDER_FAILED =
  "We couldn't process the refund with our payment provider just now. Your booking has not been changed, so please try again in a few minutes, or email us and we will sort it out.";

/** Claim the booking, then pay the money back. Everything about "never refund twice" lives here. */
async function claimAndRefund(
  t: RefundTarget,
): Promise<{ ok: true; status: "refunded" | "cancelled"; outcome: RefundOutcome; refundId: string | null } | { ok: false; httpStatus: 409 | 502; message: string }> {
  // (a) CLAIM FIRST: only one caller can move a booking from paid to cancelled.
  const claimed = await execute(
    `UPDATE ${t.table} SET status = 'cancelled' WHERE id = ? AND status = 'paid' AND refund_id IS NULL AND ${t.guardColumn} = ?`,
    [t.id, t.guardValue],
  );
  if (claimed !== 1) return { ok: false, httpStatus: 409, message: ALREADY_DONE };

  // (b) Razorpay only for a real, captured Razorpay payment; exactly what was paid, never more.
  if (t.provider === "razorpay" && t.paymentId && t.amountPaise >= 100) {
    let refund: { id: string; status: string; amount: number };
    try {
      refund = await refundRazorpayPayment({ paymentId: t.paymentId, amountPaise: t.amountPaise, notes: t.notes });
    } catch (err) {
      // (c) Razorpay said no: put the booking back exactly as it was and say nothing to anyone.
      console.error(`[refund] Razorpay refused the refund for ${t.code}:`, err);
      try {
        await execute(`UPDATE ${t.table} SET status = 'paid' WHERE id = ? AND status = 'cancelled' AND refund_id IS NULL`, [t.id]);
      } catch (revertErr) {
        console.error(`[refund] CRITICAL: could not put ${t.code} back to paid after a failed refund. Set it to paid by hand:`, revertErr);
      }
      return { ok: false, httpStatus: 502, message: PROVIDER_FAILED };
    }
    // (d) The money is on its way: record it. Retried once; if the database still refuses, the booking stays
    // 'cancelled' (safe: no second refund is possible) and the refund id is in the log for the owner.
    const done = async () =>
      execute(`UPDATE ${t.table} SET status = 'refunded', refund_id = ?, refunded_at = ?, refund_amount_paise = ? WHERE id = ?`, [
        refund.id,
        nowIso(),
        t.amountPaise,
        t.id,
      ]);
    try {
      await done();
    } catch {
      try {
        await done();
      } catch (err) {
        console.error(`[refund] CRITICAL: Razorpay refund ${refund.id} for ${t.code} succeeded but could not be saved:`, err);
      }
    }
    return { ok: true, status: "refunded", outcome: "razorpay", refundId: refund.id };
  }

  // (e) No API call. Demo bookings never had real money: just mark them refunded.
  if (t.provider === "demo") {
    await execute(`UPDATE ${t.table} SET status = 'refunded', refunded_at = ?, refund_amount_paise = ? WHERE id = ? AND status = 'cancelled'`, [
      nowIso(),
      t.amountPaise,
      t.id,
    ]);
    return { ok: true, status: "refunded", outcome: "demo", refundId: null };
  }
  // Nothing was paid (amount 0, e.g. a Monthly Pass), or it was paid outside Razorpay: stays 'cancelled'.
  return { ok: true, status: "cancelled", outcome: t.amountPaise <= 0 ? "free" : "manual", refundId: null };
}

function customerMessage(outcome: RefundOutcome, amountPaise: number): string {
  switch (outcome) {
    case "razorpay":
      return `Done. A full refund of ${formatINR(amountPaise)} is on its way to your original payment method. It usually takes ${REFUND_TIMELINE}. Your seat has been released.`;
    case "demo":
      return "Done. This was a test booking, so no real money was involved. Your seat has been released.";
    case "manual":
      return `Your booking is cancelled and your seat has been released. We will refund ${formatINR(amountPaise)} to you manually and email you when it is done.`;
    default:
      return "Your booking is cancelled and your seat has been released. Nothing was charged for it, so there is nothing to refund.";
  }
}

/** (g) The customer and the owner both hear about it. A mail failure must never undo or fail the refund. */
async function announce(info: RefundNoticeInfo): Promise<void> {
  for (const build of [refundCustomerEmail, refundOwnerEmail]) {
    try {
      await sendEmail(build(info));
    } catch (err) {
      console.error(`[refund] email for ${info.code} failed:`, err);
    }
  }
}

function finish(
  r: { status: "refunded" | "cancelled"; outcome: RefundOutcome; refundId: string | null },
  amountPaise: number,
  actor: RefundActor,
  code: string,
): RefundResult {
  const message =
    actor === "admin"
      ? r.outcome === "razorpay"
        ? `Refunded ${code}: ${formatINR(amountPaise)} sent back through Razorpay (refund ${r.refundId}). The student was emailed.`
        : r.outcome === "manual"
          ? `${code} cancelled and the seat released. It wasn't paid through Razorpay, so refund ${formatINR(amountPaise)} to the student manually.`
          : `${code} cancelled and the seat released. ${r.outcome === "demo" ? "It was a test booking." : "Nothing had been charged."}`
      : customerMessage(r.outcome, amountPaise);
  return { ok: true, status: r.status, outcome: r.outcome, amountPaise, refundId: r.refundId, message };
}

/**
 * Cancel a paid workshop booking and refund it. Customers must be inside the policy window (or the class must have
 * been cancelled by us); `actor: "admin"` skips only that time check, never the claim and safety steps.
 */
export async function refundWorkshopBooking(reg: RegistrationWithSession, opts: { actor: RefundActor }): Promise<RefundResult> {
  if (reg.status !== "paid" || reg.refundId) return { ok: false, httpStatus: 409, message: ALREADY_DONE };
  const options = evaluateWorkshopOptions(reg);
  if (opts.actor !== "admin" && !options.canRefund) return { ok: false, httpStatus: 409, message: options.reason };

  const r = await claimAndRefund({
    table: "registrations",
    guardColumn: "session_id",
    guardValue: reg.sessionId,
    id: reg.id,
    code: reg.code,
    amountPaise: reg.amountPaise,
    provider: reg.paymentProvider,
    paymentId: reg.providerPaymentId,
    notes: { kind: "workshop", booking_code: reg.code, actor: opts.actor },
  });
  if (!r.ok) return r;

  await announce({
    product: "workshop",
    code: reg.code,
    name: reg.name,
    email: reg.email,
    title: reg.workshop?.title ?? "Workshop",
    startsAt: reg.sessionStartsAt,
    amountPaise: reg.amountPaise,
    outcome: r.outcome,
    refundId: r.refundId,
    actor: opts.actor,
    cancelledByUs: options.cancelledByUs,
  });
  return finish(r, reg.amountPaise, opts.actor, reg.code);
}

/** Same for a personal-training booking (refund only; rescheduling is done by email). */
export async function refundTrainingBooking(b: TrainingBooking, opts: { actor: RefundActor }): Promise<RefundResult> {
  if (b.status !== "paid" || b.refundId) return { ok: false, httpStatus: 409, message: ALREADY_DONE };
  const options = evaluateTrainingOptions(b);
  if (opts.actor !== "admin" && !options.canRefund) return { ok: false, httpStatus: 409, message: options.reason };

  const r = await claimAndRefund({
    table: "training_bookings",
    guardColumn: "slot_id",
    guardValue: b.slotId,
    id: b.id,
    code: b.code,
    amountPaise: b.amountPaise,
    provider: b.paymentProvider,
    paymentId: b.providerPaymentId,
    notes: { kind: "training", booking_code: b.code, actor: opts.actor },
  });
  if (!r.ok) return r;

  await announce({
    product: "training",
    code: b.code,
    name: b.name,
    email: b.email,
    title: `Personal training: ${b.topic}`,
    startsAt: b.startsAt,
    amountPaise: b.amountPaise,
    outcome: r.outcome,
    refundId: r.refundId,
    actor: opts.actor,
    cancelledByUs: false,
  });
  return finish(r, b.amountPaise, opts.actor, b.code);
}

// ───────────────────────── moves ─────────────────────────

export type MoveResult =
  | { ok: true; message: string; code: string; newSessionId: string; startsAt: string; movedCount: number }
  | { ok: false; httpStatus: 400 | 409; message: string };

/**
 * Move a paid booking to another date of the SAME workshop, free. The booking code stays, so /live/<code> follows
 * the new session by itself. One atomic UPDATE checks the capacity (paid + unexpired holds, counted exactly like
 * createPendingRegistration) so parallel moves can never overbook a session.
 */
export async function moveWorkshopBooking(reg: RegistrationWithSession, newSessionId: string): Promise<MoveResult> {
  const options = evaluateWorkshopOptions(reg);
  if (!options.canMove) return { ok: false, httpStatus: 409, message: options.reason };
  if (!newSessionId) return { ok: false, httpStatus: 400, message: "Please choose a date to move to." };
  if (newSessionId === reg.sessionId) return { ok: false, httpStatus: 400, message: "Your booking is already on that date. Please choose a different one." };

  const target = await getSession(newSessionId);
  if (!target || !target.workshop) return { ok: false, httpStatus: 400, message: "That date could not be found. Please choose another." };
  if (target.workshopSlug !== reg.workshopSlug) {
    return { ok: false, httpStatus: 400, message: "You can only move to another date of the same workshop." };
  }
  if (target.status !== "scheduled" || new Date(target.startsAt).getTime() <= Date.now()) {
    return { ok: false, httpStatus: 409, message: "That date is no longer available. Please choose another." };
  }
  if (reg.coveredByPassId && istMonthKey(target.startsAt) !== istMonthKey(reg.sessionStartsAt)) {
    return { ok: false, httpStatus: 409, message: "Your Monthly Pass only covers classes in the month of your current booking. Please choose a date in that month." };
  }

  const moved = await execute(
    `UPDATE registrations
        SET session_id = ?, original_session_id = COALESCE(original_session_id, ?), moved_count = moved_count + 1, reminder_sent_at = NULL
      WHERE id = ? AND status = 'paid' AND session_id = ? AND moved_count < ?
        AND (SELECT COUNT(*) FROM registrations r WHERE r.session_id = ?
               AND (r.status = 'paid' OR (r.status = 'pending' AND r.created_at > ?)))
          < (SELECT s.capacity FROM class_sessions s WHERE s.id = ? AND s.status = 'scheduled' AND s.starts_at > ?)`,
    [target.id, reg.sessionId, reg.id, reg.sessionId, MAX_MOVES, target.id, holdCutoffIso(), target.id, nowIso()],
  );

  if (moved !== 1) {
    const again = await getSession(target.id);
    if (!again || again.status !== "scheduled" || new Date(again.startsAt).getTime() <= Date.now()) {
      return { ok: false, httpStatus: 409, message: "That date is no longer available. Please choose another." };
    }
    if (again.seatsLeft <= 0) return { ok: false, httpStatus: 409, message: "Sorry, that date just filled up. Please choose another." };
    return { ok: false, httpStatus: 409, message: "Your booking changed in the meantime (for example it was already moved or cancelled). Please reload the page." };
  }

  const fresh = await getRegistrationById(reg.id);
  if (fresh) {
    try {
      await sendEmail(workshopMovedEmail(fresh));
    } catch (err) {
      console.error(`[move] email for ${reg.code} failed:`, err);
    }
  }
  return {
    ok: true,
    message: `Done. Your booking is now on ${formatDateTime(target.startsAt)}. We emailed you the new details.`,
    code: reg.code,
    newSessionId: target.id,
    startsAt: target.startsAt,
    movedCount: reg.movedCount + 1,
  };
}
