/** Types for the feedback slice, imported by both the SPA and the Pages Functions API. Pure types only. */

export type FeedbackAttendAgain = "yes" | "maybe" | "no";

/** GET /api/pages/feedback?code= */
export type FeedbackPageData = {
  /** True when `?code=` matched a registration (even if its workshop has since been removed from the catalogue). */
  registrationFound: boolean;
  /** The workshop the registration belongs to; the form hides its own workshop picker when this is set. */
  lockedWorkshop: { slug: string; title: string } | null;
  /** ISO start time of the registration's class session (null when no registration matched). */
  sessionStartsAt: string | null;
  liveWorkshops: { slug: string; title: string }[];
  returningDiscountPercent: number;
};

/** POST /api/feedback (JSON body). */
export type FeedbackSubmitRequest = {
  registrationCode: string;
  workshopSlug: string;
  rating: number;
  learned: string;
  unclear: string;
  improve: string;
  teachNext: string;
  attendAgain: FeedbackAttendAgain | null;
  publicComment: string;
  displayName: string;
  consentPublic: boolean;
};

export type FeedbackSubmitResult = { ok: true };
