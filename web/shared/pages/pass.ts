/** JSON shapes for the Monthly All-Access Pass endpoints — imported by both the SPA and the Pages Functions router. Types only. */
import type { PaymentMode } from "../api-types";
import type { CategorySlug } from "../content";

/** One class inside a month's pass. Deliberately leaves out the meeting link and notes: this endpoint is public. */
export type PassSessionItem = {
  id: string;
  startsAt: string;
  durationMin: number;
  workshop: { title: string; category: CategorySlug } | null;
};

export type PassMonth = {
  monthKey: string;
  label: string;
  sessions: PassSessionItem[];
};

/** GET /api/pages/monthly-pass */
export type MonthlyPassPage = {
  /** Months currently on sale, soonest first, each with its upcoming scheduled sessions. */
  months: PassMonth[];
  pricePaise: number;
  perClassPricePaise: number;
  paymentMode: PaymentMode;
};

export type PassStatus = "pending" | "paid" | "refunded" | "cancelled" | "failed";

/** GET /api/pages/monthly-pass/:code (404 when the code is unknown) */
export type PassConfirmationPage = {
  pass: {
    code: string;
    name: string;
    email: string;
    monthKey: string;
    label: string;
    amountPaise: number;
    status: PassStatus;
    paymentProvider: string | null;
  };
  paymentMode: PaymentMode;
  contactEmail: string;
};

/** POST /api/book/pass */
export type PassBookRequest = {
  monthKey: string;
  name: string;
  email: string;
  phone: string;
  acceptTerms: boolean;
};

export type PassBookResponse = { ok: true; code: string; amountPaise: number } | { ok: false; error: string };
