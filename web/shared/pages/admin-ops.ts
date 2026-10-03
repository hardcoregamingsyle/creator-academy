/**
 * JSON shapes for the admin-ops slice (sessions, bookings, monthly passes, personal training, feedback, demand,
 * messages, email log). Imported by both the SPA (src/pages/admin-ops) and the API (functions/_routes/admin-ops.ts).
 * Every date is an ISO string; money is in paise.
 */
import type { ActionResult } from "../api-types";

export type SessionStatus = "scheduled" | "completed" | "cancelled";
export type RegistrationStatus = "pending" | "paid" | "failed" | "refunded" | "cancelled";
export type PassStatus = "pending" | "paid" | "refunded" | "cancelled" | "failed";
export type TrainingStatus = "pending" | "paid" | "completed" | "failed" | "refunded" | "cancelled";
export type AttendAgain = "yes" | "maybe" | "no";

// ───────────────────────── sessions ─────────────────────────

export type WorkshopOption = { slug: string; title: string };

export type AdminSessionListItem = {
  id: string;
  workshopSlug: string;
  /** Catalogue title, or the slug when the workshop was removed. */
  workshopTitle: string;
  startsAt: string;
  status: SessionStatus;
  paidCount: number;
  capacity: number;
  attendedCount: number;
  hasMeetingLink: boolean;
};

/** GET /api/admin/sessions?scope=upcoming|past — also carries what the "Schedule a session" form needs. */
export type AdminSessionsPageData = {
  scope: "upcoming" | "past";
  sessions: AdminSessionListItem[];
  liveWorkshops: WorkshopOption[];
  plannedWorkshops: WorkshopOption[];
  defaultCapacity: number;
  defaultPricePaise: number;
};

export type AdminSessionDetail = {
  id: string;
  workshopSlug: string;
  /** Null when the workshop was removed from the catalogue. */
  workshopTitle: string | null;
  startsAt: string;
  durationMin: number;
  capacity: number;
  pricePaise: number;
  meetingLink: string | null;
  notes: string | null;
  status: SessionStatus;
  paidCount: number;
};

export type AdminSessionRegistration = {
  id: string;
  code: string;
  name: string;
  email: string;
  phone: string | null;
  amountPaise: number;
  discountPaise: number;
  status: RegistrationStatus;
  paidAt: string | null;
  attended: boolean;
};

/** GET /api/admin/sessions/:id (404 when the session doesn't exist) */
export type AdminSessionDetailData = {
  session: AdminSessionDetail;
  registrations: AdminSessionRegistration[];
};

/**
 * Result of POST /api/admin/sessions/:id/send-reminder and /send-feedback-request. Without `limit` the whole
 * list is emailed in one call (like the old server action); the SPA sends `offset` + `limit` so each request
 * stays within a Worker's subrequest and CPU budget, and adds the chunks up itself.
 */
export type BulkEmailResult = ActionResult & {
  /** Emails delivered (or logged) in this call. */
  sent: number;
  /** Recipients this call tried. */
  attempted: number;
  /** Recipients in the whole list (0 when there is nobody to email, with `ok: false`). */
  total: number;
  /** True once the last recipient has been handled. */
  done: boolean;
};

export function bulkEmailMessage(kind: "reminder" | "feedback", sent: number, total: number, hasMeetingLink = true): string {
  if (kind === "reminder") {
    const warning = hasMeetingLink ? "" : " Note: no meeting link is set on this session yet.";
    return `Reminder sent to ${sent} of ${total} student${total === 1 ? "" : "s"}.${warning}`;
  }
  return `Feedback request sent to ${sent} of ${total} attendee${total === 1 ? "" : "s"}.`;
}

// ───────────────────────── bookings ─────────────────────────

export type BookingStatusFilter = RegistrationStatus | "all";

export type AdminBookingRow = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  /** Catalogue title, or the slug when the workshop was removed. */
  workshopTitle: string;
  sessionStartsAt: string;
  code: string;
  amountPaise: number;
  discountPaise: number;
  paymentProvider: string | null;
  status: RegistrationStatus;
  createdAt: string;
  /** Pending for longer than the seat hold (evaluated when the request was served). */
  abandoned: boolean;
  /** Paid through Razorpay with a payment id: the "Refund via Razorpay" button can refund it automatically. */
  autoRefundable: boolean;
};

/** GET /api/admin/bookings?status=…&q=… */
export type AdminBookingsPageData = {
  status: BookingStatusFilter;
  q: string;
  /** Registrations per status across everything (ignores the filter), plus `all`. Missing keys mean 0. */
  counts: Record<string, number>;
  totalPaidPaise: number;
  returningDiscountPercent: number;
  bookings: AdminBookingRow[];
};

// ───────────────────────── monthly passes ─────────────────────────

export type AdminPassRow = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  monthKey: string;
  code: string;
  amountPaise: number;
  status: PassStatus;
  /** Paid through the demo (no real money) flow. */
  demo: boolean;
  createdAt: string;
};

/** GET /api/admin/passes */
export type AdminPassesPageData = {
  monthlyPassPricePaise: number;
  revenuePaise: number;
  paidCount: number;
  /** The month currently on sale (null should never happen). */
  monthKey: string | null;
  /** Paid passes for `monthKey`. */
  monthCount: number;
  passes: AdminPassRow[];
};

// ───────────────────────── personal training ─────────────────────────

export type AdminTrainingSlot = {
  id: string;
  startsAt: string;
  isOpen: boolean;
  bookingCode: string | null;
  bookingStatus: string | null;
};

export type AdminTrainingBooking = {
  id: string;
  code: string;
  name: string;
  email: string;
  phone: string | null;
  topic: string;
  durationMin: number;
  startsAt: string;
  amountPaise: number;
  status: TrainingStatus;
  goals: string | null;
  meetingLink: string | null;
  /** Paid through Razorpay with a payment id: can be refunded automatically. */
  autoRefundable: boolean;
};

/**
 * Result of POST /api/admin/sessions/:id/refund-all. Each call refunds at most `limit` paid bookings of a cancelled
 * session (the SPA sends a small limit and repeats while `remaining > 0`, to stay inside a Worker's subrequest budget).
 */
export type RefundAllResult = ActionResult & {
  /** Bookings handled in this call. */
  attempted: number;
  /** Refunded through Razorpay (or test bookings marked refunded). */
  refunded: number;
  /** Cancelled but needing a manual refund (not paid through Razorpay), or nothing to refund. */
  manual: number;
  /** Razorpay refused or the booking changed meanwhile: still paid, safe to retry. */
  failed: number;
  /** Paid bookings still left on the session after this call. */
  remaining: number;
};

/** GET /api/admin/training?tab=upcoming|past — `slots` are always the upcoming ones; `tab` only filters `bookings`. */
export type AdminTrainingPageData = {
  scope: "upcoming" | "past";
  slots: AdminTrainingSlot[];
  bookings: AdminTrainingBooking[];
};

// ───────────────────────── feedback ─────────────────────────

export type AdminFeedbackItem = {
  id: string;
  rating: number;
  workshopTitle: string | null;
  attendAgain: AttendAgain | null;
  createdAt: string;
  learned: string | null;
  unclear: string | null;
  improve: string | null;
  teachNext: string | null;
  publicComment: string | null;
  displayName: string | null;
  consentPublic: boolean;
  approved: boolean;
};

export type AdminFeedbackStats = {
  count: number;
  averageRating: number | null;
  wouldAttendAgain: { yes: number; maybe: number; no: number };
  byWorkshop: { workshopSlug: string; workshopTitle: string; count: number; averageRating: number }[];
};

/** GET /api/admin/feedback */
export type AdminFeedbackPageData = {
  stats: AdminFeedbackStats;
  feedback: AdminFeedbackItem[];
};

// ───────────────────────── demand ─────────────────────────

export type AdminDemandRow = {
  workshopSlug: string;
  workshopTitle: string;
  /** "live" | "planned" | "future" */
  status: string;
  count: number;
  /** Paid seats across all sessions of this workshop (only shown for live workshops). */
  paidSeats: number;
  emails: { email: string; name: string | null }[];
};

/** GET /api/admin/demand */
export type AdminDemandPageData = {
  rows: AdminDemandRow[];
  teachNext: { id: string; text: string; workshopTitle: string | null; createdAt: string }[];
};

// ───────────────────────── messages & email log ─────────────────────────

export type AdminMessage = {
  id: string;
  name: string;
  email: string;
  topic: string | null;
  message: string;
  handled: boolean;
  createdAt: string;
};

/** GET /api/admin/messages — unhandled first, newest first within each group. */
export type AdminMessagesPageData = {
  messages: AdminMessage[];
  openCount: number;
};

export type AdminEmailLogRow = {
  id: string;
  toEmail: string;
  subject: string;
  bodyText: string;
  kind: string | null;
  status: "sent" | "logged" | "failed";
  error: string | null;
  createdAt: string;
};

/** GET /api/admin/emails */
export type AdminEmailsPageData = {
  emails: AdminEmailLogRow[];
  /** False when no email provider is set, so emails are only logged. */
  configured: boolean;
};
