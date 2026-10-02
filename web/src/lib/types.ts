import type { PaymentMode } from "@shared/api-types";
import type { Workshop } from "@shared/content";

export type SessionStatus = "scheduled" | "completed" | "cancelled";

/** JSON shape of a class session as returned by the public/admin APIs (mirrors the old server `ClassSession`; dates are ISO strings). */
export type ClassSession = {
  id: string;
  workshopSlug: string;
  startsAt: string;
  durationMin: number;
  capacity: number;
  pricePaise: number;
  meetingLink: string | null;
  status: SessionStatus;
  notes: string | null;
  createdAt: string;
  /** Paid seats + unpaid seats still on hold. */
  seatsTaken: number;
  seatsLeft: number;
  paidCount: number;
  attendedCount: number;
  /** Catalogue entry; absent if the workshop was removed. */
  workshop?: Workshop;
};

/** GET /api/admin/session — 200 when signed in, 401 otherwise. The optional fields feed the admin header pills. */
export type AdminSessionInfo = {
  ok: boolean;
  admin: boolean;
  paymentMode?: PaymentMode;
  emailConfigured?: boolean;
};
