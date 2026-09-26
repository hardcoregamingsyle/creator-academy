import "server-only";
import {
  getRegistrationByCode,
  getRegistrationById,
  markRegistrationPaid,
  renewSeatHold,
  setRegistrationOrderId,
} from "@/lib/data/registrations";
import {
  getTrainingBookingByCode,
  getTrainingBookingById,
  markTrainingPaid,
  renewTrainingHold,
  setTrainingOrderId,
} from "@/lib/data/training";
import { sendEmail } from "@/lib/email";
import { trainingConfirmationEmail, workshopConfirmationEmail } from "@/lib/email-templates";

/**
 * Shared checkout logic for both products (group workshops and 1:1 training):
 * look up what's being paid for, remember the payment order, and fulfil a
 * successful payment exactly once (mark paid + send confirmation email).
 */

export type PayKind = "workshop" | "training";

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
  return v === "workshop" || v === "training";
}

export function successPath(kind: PayKind, code: string): string {
  return kind === "workshop" ? `/booking/${code}` : `/training/${code}`;
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

/**
 * Make sure the seat/slot is still reserved for this pending booking before
 * taking money (re-reserves it if the hold expired and it's still free).
 */
export async function ensureHold(p: Payable): Promise<boolean> {
  return p.kind === "workshop" ? renewSeatHold(p.id) : renewTrainingHold(p.id);
}

export async function saveOrderId(p: Payable, orderId: string): Promise<void> {
  if (p.kind === "workshop") await setRegistrationOrderId(p.id, orderId);
  else await setTrainingOrderId(p.id, orderId);
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
  } else {
    const changed = await markTrainingPaid(id, payment);
    if (changed) {
      const booking = await getTrainingBookingById(id);
      if (booking) await sendEmail(trainingConfirmationEmail(booking));
    }
  }
}
