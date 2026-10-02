import {
  getRegistrationByCode,
  getRegistrationById,
  markRegistrationPaid,
  renewSeatHold,
  setRegistrationOrderId,
} from "./data/registrations";
import {
  getTrainingBookingByCode,
  getTrainingBookingById,
  markTrainingPaid,
  renewTrainingHold,
  setTrainingOrderId,
} from "./data/training";
import { getPassByCode, getPassById, markPassPaid, setPassOrderId } from "./data/monthly-pass";
import { sendEmail } from "./email";
import { monthlyPassConfirmationEmail, trainingConfirmationEmail, workshopConfirmationEmail } from "./email-templates";
import { monthLabel } from "../../shared/format";

/**
 * Shared checkout logic across all three products (group workshops, 1:1
 * training, and the Monthly Pass): look up what's being paid for, remember
 * the payment order, and fulfil a successful payment exactly once (mark paid
 * + send confirmation email).
 */

export type PayKind = "workshop" | "training" | "pass";

export type Payable = {
  kind: PayKind;
  id: string;
  code: string;
  status: string;
  amountPaise: number;
  name: string;
  email: string;
  phone: string | null;
  description: string;
  providerOrderId: string | null;
  /** Start time of the class/session being paid for. */
  startsAt: string;
};

export function isPayKind(v: unknown): v is PayKind {
  return v === "workshop" || v === "training" || v === "pass";
}

export function successPath(kind: PayKind, code: string): string {
  if (kind === "workshop") return `/booking/${code}`;
  if (kind === "training") return `/training/${code}`;
  return `/monthly-pass/${code}`;
}

export async function getPayable(kind: PayKind, code: string): Promise<Payable | null> {
  if (kind === "workshop") {
    const r = await getRegistrationByCode(code);
    if (!r) return null;
    return {
      kind,
      id: r.id,
      code: r.code,
      status: r.status,
      amountPaise: r.amountPaise,
      name: r.name,
      email: r.email,
      phone: r.phone,
      description: `${r.workshop?.title ?? "Workshop"} — live class`,
      providerOrderId: r.providerOrderId,
      startsAt: r.sessionStartsAt,
    };
  }
  if (kind === "training") {
    const b = await getTrainingBookingByCode(code);
    if (!b) return null;
    return {
      kind,
      id: b.id,
      code: b.code,
      status: b.status,
      amountPaise: b.amountPaise,
      name: b.name,
      email: b.email,
      phone: b.phone,
      description: `Personal training — ${b.topic} (${b.durationMin} min)`,
      providerOrderId: b.providerOrderId,
      startsAt: b.startsAt,
    };
  }
  const p = await getPassByCode(code);
  if (!p) return null;
  return {
    kind,
    id: p.id,
    code: p.code,
    status: p.status,
    amountPaise: p.amountPaise,
    name: p.name,
    email: p.email,
    phone: p.phone,
    description: `Monthly Creator Course — ${monthLabel(p.monthKey)}`,
    providerOrderId: p.providerOrderId,
    // A pass has no single "start time" like a session — treat it as always
    // still purchasable up to the end of its month (checked by the caller
    // separately if needed; pay/start doesn't reject on this for passes).
    startsAt: new Date(8640000000000000).toISOString(),
  };
}

/**
 * Make sure the seat/slot is still reserved for this pending booking before
 * taking money (re-reserves it if the hold expired and it's still free). A
 * pass has no seat/slot to hold, so it's always fine to proceed.
 */
export async function ensureHold(p: Payable): Promise<boolean> {
  if (p.kind === "workshop") return renewSeatHold(p.id);
  if (p.kind === "training") return renewTrainingHold(p.id);
  return true;
}

export async function saveOrderId(p: Payable, orderId: string): Promise<void> {
  if (p.kind === "workshop") await setRegistrationOrderId(p.id, orderId);
  else if (p.kind === "training") await setTrainingOrderId(p.id, orderId);
  else await setPassOrderId(p.id, orderId);
}

/**
 * Mark as paid and send the confirmation email. Safe to call more than once
 * (checkout callback + webhook) — the email is only sent the first time.
 */
export async function fulfilPayment(
  kind: PayKind,
  id: string,
  payment: { provider: "razorpay" | "demo" | "manual"; paymentId?: string | null },
): Promise<void> {
  if (kind === "workshop") {
    const changed = await markRegistrationPaid(id, payment);
    if (changed) {
      const reg = await getRegistrationById(id);
      if (reg) await sendEmail(workshopConfirmationEmail(reg));
    }
  } else if (kind === "training") {
    const changed = await markTrainingPaid(id, payment);
    if (changed) {
      const booking = await getTrainingBookingById(id);
      if (booking) await sendEmail(trainingConfirmationEmail(booking));
    }
  } else {
    const changed = await markPassPaid(id, payment);
    if (changed) {
      const pass = await getPassById(id);
      if (pass) await sendEmail(monthlyPassConfirmationEmail(pass));
    }
  }
}
