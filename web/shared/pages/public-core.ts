/** Types for the public-core slice (home, about, FAQ, contact), imported by both the SPA and the Pages Functions API. */
import type { CategorySlug, FaqGroup, FaqItem, Workshop } from "../content";

/**
 * A class session as the public pages receive it. Same shape as the SPA's
 * ClassSession, but the private fields are blanked: `meetingLink` and `notes`
 * are always null and `paidCount` / `attendedCount` are always 0 (the join link
 * is only ever shown to people who booked).
 */
export type PublicSession = {
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
  seatsTaken: number;
  seatsLeft: number;
  paidCount: 0;
  attendedCount: 0;
  workshop?: Workshop;
};

export type HomeTestimonial = { id: string; quote: string; name: string; rating: number; workshopTitle: string | null };

export type HomeSocial = { id: string; platform: string; handle: string; url: string };

export type HomeTrainingDuration = { minutes: number; label: string; blurb: string; paise: number };

/** Workshops per category: `total` includes planned/roadmap ones, `live` only those open for booking. */
export type HomeCategoryStat = { slug: CategorySlug; total: number; live: number };

/** GET /api/pages/home */
export type HomePageData = {
  workshopPricePaise: number;
  returningDiscountPercent: number;
  defaultCapacity: number;
  /** All workshops in the catalogue, whatever their status. */
  workshopCount: number;
  categoryStats: HomeCategoryStat[];
  /** Only the workshops open for booking (the "Open for booking" grid). */
  liveWorkshops: Workshop[];
  /** Number of upcoming scheduled sessions in total (the list below shows the first four). */
  upcomingCount: number;
  upcoming: PublicSession[];
  /** The session featured in the hero: the soonest with seats left, else the soonest at all. */
  nextSession: PublicSession | null;
  /** Start time of the soonest session with seats left, per workshop slug. */
  nextByWorkshop: Record<string, string>;
  testimonials: HomeTestimonial[];
  durations: HomeTrainingDuration[];
  faq: FaqItem[];
  socials: HomeSocial[];
};

/** GET /api/pages/about */
export type AboutPageData = {
  workshopCount: number;
  workshopPricePaise: number;
  returningDiscountPercent: number;
  defaultCapacity: number;
  /** Personal-training session lengths in minutes, in display order. */
  trainingMinutes: number[];
  /** Labels of the first six personal-training topics. */
  trainingTopics: string[];
};

/** GET /api/pages/faq */
export type FaqPageData = {
  groups: FaqGroup[];
  contactEmail: string;
  replyTime: string;
};

/** POST /api/contact (JSON body). `website` is the honeypot field and must stay empty. */
export type ContactRequest = {
  name: string;
  email: string;
  topic: string;
  message: string;
  website: string;
};

export type ContactResult = { ok: true };
