/** Types for the booking slice (checkout, booking confirmation/lookup, pay endpoints), imported by both the SPA and the Pages Functions API. Pure types only. */

import type { PaymentMode } from "../api-types";
import type { Workshop } from "../content";

export type PayKind = "workshop" | "training" | "pass";

/**
 * Same shape as the SPA's `ClassSession`, but the server blanks the fields that
 * are only for people who booked (`meetingLink`, `notes`, `attendedCount` are
 * always null/0 here), so the join link never leaves through a public page.
 */
export type BookingSessionCore = {
  id: string;
  workshopSlug: string;
  startsAt: string;
  durationMin: number;
  capacity: number;
  pricePaise: number;
  meetingLink: null;
  status: "scheduled" | "completed" | "cancelled";
  notes: null;
  createdAt: string;
  /** Paid seats + unpaid seats still on hold. */
  seatsTaken: number;
  seatsLeft: number;
  paidCount: number;
  attendedCount: 0;
};

export type BookingSession = BookingSessionCore & { workshop?: Workshop };

/** GET /api/pages/book/:sessionId (404 JSON when the session or its workshop doesn't exist). */
export type BookPageData = {
  session: BookingSessionCore & { workshop: Workshop };
  /** Scheduled, in the future and not full. */
  bookable: boolean;
  paymentMode: PaymentMode;
  /**
   * Up to four upcoming dates for the same workshop (this session included); only filled when this session
   * isn't bookable. They all belong to `session.workshop`, so it isn't repeated on each one.
   */
  alternatives: BookingSessionCore[];
};

export type BookingStatus = "pending" | "paid" | "failed" | "refunded" | "cancelled";

/** What the booking page shows about a registration (no payment-provider ids). `meetingLink` is only set once the booking is paid. */
export type BookingView = {
  code: string;
  status: BookingStatus;
  name: string;
  email: string;
  amountPaise: number;
  discountPaise: number;
  /** Paid through the demo payment flow rather than a real provider. */
  demoPayment: boolean;
  sessionStartsAt: string;
  sessionDurationMin: number;
  sessionStatus: string;
  meetingLink: string | null;
  workshopSlug: string;
  workshop?: Workshop;
};

/** GET /api/pages/booking/:code (404 JSON for an unknown code). */
export type BookingPageData = {
  booking: BookingView;
  returningDiscountPercent: number;
  paymentMode: PaymentMode;
  /** Whether the class hasn't started yet (decides if payment can still be retried). */
  sessionInFuture: boolean;
  /** "Add to Google Calendar" link; only for paid bookings. */
  googleCalendarUrl: string | null;
  contactEmail: string;
};

/** GET /api/pages/booking-lookup?code=… — where the "Find my booking" form should go, or what to tell the student. */
export type BookingLookupResponse = { redirect: string; error?: undefined } | { redirect?: undefined; error: string };

/** POST /api/book/workshop */
export type WorkshopBookingRequest = {
  sessionId: string;
  name: string;
  email: string;
  phone?: string;
  acceptTerms: boolean;
};

export type WorkshopBookingResponse =
  | { ok: true; code: string; basePaise: number; discountPaise: number; amountPaise: number; coveredByPass: boolean }
  | { ok: false; error: string };

/** POST /api/book/discount */
export type DiscountCheckRequest = { sessionId: string; email: string };

export type DiscountCheckResponse = {
  eligible: boolean;
  coveredByPass?: boolean;
  percent?: number;
  sourceWorkshopTitle?: string;
  discountPaise?: number;
  amountPaise?: number;
};

/** POST /api/booking/resend (identical answer whether or not bookings exist). */
export type ResendRequest = { email: string };
export type ResendResponse = { ok: true } | { ok: false; error: string };

/** Pay endpoints: business-rule failures are `{ ok: false, error }` with a 4xx/5xx status. */
export type PayErrorResponse = { ok: false; error: string };

export type PayRequest = { kind: PayKind; code: string };

export type PayStartResponse =
  | { ok: true; alreadyPaid: true; redirect: string }
  | { ok: true; mode: "demo"; amountPaise: number }
  | {
      ok: true;
      mode: "razorpay";
      keyId: string;
      orderId: string;
      amountPaise: number;
      currency: "INR";
      name: string;
      description: string;
      prefill: { name: string; email: string; contact: string };
    }
  | PayErrorResponse;

export type PayVerifyRequest = PayRequest & {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
};

/** Answer of POST /api/pay/verify and POST /api/pay/demo. */
export type PayDoneResponse = { ok: true; redirect: string } | PayErrorResponse;
