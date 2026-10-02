/** Types for the catalogue slice (classes, class detail, schedule, interest), imported by both the SPA and the Pages Functions API. Pure types only. */

import type { FaqItem, Workshop } from "../content";

/**
 * A scheduled class session as sent to the public site. Deliberately omits the
 * meeting link, admin notes and attendance counts — those are for registrants
 * and the admin only. The workshop is not embedded (the page response carries
 * the workshops once, instead of once per session).
 */
export type PublicSession = {
  id: string;
  workshopSlug: string;
  startsAt: string;
  durationMin: number;
  capacity: number;
  pricePaise: number;
  status: "scheduled" | "completed" | "cancelled";
  /** Paid seats + unpaid seats still on hold. */
  seatsTaken: number;
  seatsLeft: number;
};

/** GET /api/pages/classes — the whole catalogue; the `?category=` filter is applied in the browser. */
export type ClassesPageData = {
  workshops: Workshop[];
  workshopPricePaise: number;
  /** Workshop slug -> ISO start time of its next session that still has seats. */
  nextByWorkshop: Record<string, string>;
};

export type PublicTestimonial = {
  id: string;
  quote: string;
  name: string;
  rating: number;
};

/** GET /api/pages/classes/:slug (404 JSON when the workshop doesn't exist). */
export type ClassDetailPageData = {
  workshop: Workshop;
  /** This workshop's upcoming sessions, soonest first. */
  sessions: PublicSession[];
  testimonials: PublicTestimonial[];
  /** The four questions every class page shows. */
  faq: FaqItem[];
  /** Up to three live workshops, same category first. */
  related: Workshop[];
  /** Next bookable start time per related workshop slug. */
  nextByWorkshop: Record<string, string>;
  workshopPricePaise: number;
  returningDiscountPercent: number;
  /** Seats per live workshop ("max N students"). */
  defaultCapacity: number;
};

/** GET /api/pages/schedule */
export type SchedulePageData = {
  /** Every upcoming scheduled session, soonest first. */
  sessions: PublicSession[];
  /** The workshops that have at least one of those sessions, in catalogue order. */
  workshops: Workshop[];
};

/** POST /api/interest (JSON body). Success: `{ ok: true, alreadyRegistered }`; failures are 400 with `{ ok: false, message }`. */
export type InterestRequest = {
  workshopSlug: string;
  email: string;
  name?: string;
  note?: string;
};

export type InterestResponse = { ok: true; alreadyRegistered: boolean };
