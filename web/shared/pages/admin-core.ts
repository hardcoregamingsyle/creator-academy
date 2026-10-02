/** Types for the admin-core slice (overview, pricing, classes, socials), imported by both the SPA and the Pages Functions API. Pure types only. */

import type { Workshop } from "../content";

export type RegistrationStatus = "paid" | "pending" | "failed" | "refunded" | "cancelled";

// ───────────────────────── overview ─────────────────────────

export type OverviewStats = {
  revenuePaise: number;
  workshopRevenuePaise: number;
  trainingRevenuePaise: number;
  paidRegistrations: number;
  paidTrainingBookings: number;
  uniqueStudents: number;
  returningStudents: number;
  pendingRegistrations: number;
  feedbackCount: number;
  openMessages: number;
  /** Bookings completed with simulated (demo) payments — excluded from every number above. */
  demoBookings: number;
};

export type OverviewSession = {
  id: string;
  /** The workshop's title, or its slug when the workshop was removed from the catalogue. */
  title: string;
  startsAt: string;
  capacity: number;
  paidCount: number;
};

export type OverviewRegistration = {
  id: string;
  name: string;
  email: string;
  /** The workshop's title, or its slug when the workshop was removed from the catalogue. */
  workshopTitle: string;
  amountPaise: number;
  status: RegistrationStatus;
  createdAt: string;
};

/** GET /api/admin/overview */
export type AdminOverviewData = {
  stats: OverviewStats;
  /** The next five upcoming sessions, soonest first. */
  nextSessions: OverviewSession[];
  /** The eight most recent registrations. */
  recent: OverviewRegistration[];
  workshopPricePaise: number;
  milestones: { label: string; paise: number }[];
  /** Computed on the server because it depends on environment configuration. */
  checklist: { label: string; ok: boolean }[];
};

// ───────────────────────── pricing ─────────────────────────

export type AdminSiteSettings = {
  workshopPricePaise: number;
  returningDiscountPercent: number;
  monthlyPassPricePaise: number;
  /** Struck-through "regular price" = price x (1 + this/100), display only. 0 hides it everywhere. */
  anchorMarkupPercent: number;
};

export type AdminTrainingDuration = { id: string; minutes: number; label: string; blurb: string; paise: number; sortOrder: number };
export type AdminTrainingTopic = { id: string; label: string; sortOrder: number };

/** GET /api/admin/pricing */
export type AdminPricingData = {
  settings: AdminSiteSettings;
  durations: AdminTrainingDuration[];
  topics: AdminTrainingTopic[];
};

// ───────────────────────── classes ─────────────────────────

/** GET /api/admin/classes[?edit=<slug>] — `editing` is null when `edit` is absent or matches no workshop. */
export type AdminClassesData = {
  workshops: Workshop[];
  editing: Workshop | null;
};

// ───────────────────────── socials ─────────────────────────

export type AdminSocial = { id: string; platform: string; handle: string; url: string; sortOrder: number };

/** GET /api/admin/socials */
export type AdminSocialsData = {
  socials: AdminSocial[];
};
