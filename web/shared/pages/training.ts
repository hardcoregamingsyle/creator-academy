/** JSON shapes for the personal-training slice. Imported by both the SPA (src/pages/training) and the API (functions/_routes/training.ts). */
import type { PaymentMode } from "../api-types";
import type { FaqItem } from "../content";

export type TrainingDurationOption = { id: string; minutes: number; label: string; blurb: string; paise: number };
export type TrainingTopicOption = { id: string; label: string };
export type TrainingSlotOption = { id: string; startsAt: string };

/** GET /api/pages/personal-training */
export type PersonalTrainingPageData = {
  paymentMode: PaymentMode;
  contactEmail: string;
  /** Group workshop price, shown on the "join a group class" button. */
  workshopPaise: number;
  durations: TrainingDurationOption[];
  topics: TrainingTopicOption[];
  /** Open start times for every duration, keyed by minutes (JSON keys are strings). Sorted by time. */
  slotsByDuration: Record<number, TrainingSlotOption[]>;
  /** Items of the "Personal training" FAQ group, or null when that group doesn't exist. */
  faq: FaqItem[] | null;
};

/** POST /api/book/training (JSON body). */
export type TrainingBookRequest = {
  slotId: string;
  topic: string;
  durationMin: number;
  name: string;
  email: string;
  phone: string;
  goals: string;
  acceptTerms: boolean;
};

/** Success body of POST /api/book/training. Failures are `{ ok: false, message }` with a 400 (invalid input) or 409 (slot taken). */
export type TrainingBookResponse = { ok: true; code: string; amountPaise: number };

export type TrainingBookingStatus = "pending" | "paid" | "completed" | "failed" | "refunded" | "cancelled";

/** Only what the booking page shows; payment ids, phone and goals stay on the server. */
export type TrainingBookingView = {
  code: string;
  status: TrainingBookingStatus;
  startsAt: string;
  topic: string;
  durationMin: number;
  name: string;
  email: string;
  amountPaise: number;
  /** True when the booking was paid through the demo (no real money) flow. */
  demoPayment: boolean;
  meetingLink: string | null;
};

/** GET /api/pages/training/:code (404 when the code is unknown) */
export type TrainingBookingPageData = {
  booking: TrainingBookingView;
  paymentMode: PaymentMode;
  /** Evaluated when the request was served. */
  sessionInFuture: boolean;
  contactEmail: string;
  siteUrl: string;
};
