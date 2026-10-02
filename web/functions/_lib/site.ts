import { brand } from "../../shared/brand";

/**
 * Brand + business settings (server side).
 *
 * Name, tagline and description come from shared/brand.ts so the SPA and the
 * API never diverge. Env-driven values (contact email, legal details) are read
 * from process.env, which nodejs_compat populates from the Pages vars/secrets.
 * Pricing, socials and training below are only the seeds for the DB tables
 * that the admin edits.
 */
export const site = {
  name: brand.name,
  tagline: brand.tagline,
  description: brand.description,

  /** Business contact details shown on the website. */
  contactEmail: process.env.CONTACT_EMAIL || "hello@example.com",
  /** Typical reply time promise shown on the contact page. */
  replyTime: "within 24 hours",

  /**
   * Social accounts of the ACADEMY brand (not personal accounts).
   * Leave `url`/`handle` empty until the account exists — it renders as "launching soon".
   */
  socials: [
    { label: "Instagram", handle: "", url: "" },
    { label: "YouTube", handle: "", url: "" },
    { label: "Facebook", handle: "", url: "" },
  ] as { label: "Instagram" | "YouTube" | "Facebook"; handle: string; url: string }[],

  /**
   * Legal details. Payment providers (e.g. Razorpay) require the legal name of
   * the account holder / business and a contact address on the policy pages.
   * Fill these in with ACCURATE information before accepting live payments.
   */
  legal: {
    businessName: process.env.LEGAL_NAME || "[Legal business / account-holder name]",
    address: process.env.LEGAL_ADDRESS || "[Registered business address, City, State, PIN]",
    jurisdiction: process.env.JURISDICTION || "India",
  },

  /** Pricing (in paise: ₹1 = 100 paise). */
  pricing: {
    workshopPaise: 27900,
    /** Returning-student discount for people who attended the immediately previous class. */
    returningDiscountPercent: 15,
    /**
     * Display-only struck-through "regular price" = price x (1 + this/100),
     * shown next to every real price. Never charged. 0 hides it everywhere.
     */
    anchorMarkupPercent: 90,
    /**
     * Monthly Creator Course / All-Access Pass — covers every workshop
     * session scheduled in the calendar month it's bought for, so students
     * don't pay per-class. One flat price for now (keep it simple).
     */
    monthlyPassPaise: 149900,
  },

  /** Default seats per live workshop — small groups so everyone can ask questions. */
  defaultCapacity: 20,

  /** A pending (unpaid) booking holds its seat for this many minutes. */
  seatHoldMinutes: 15,

  /** All class times are shown in Indian Standard Time. */
  timeZone: brand.timeZone,
  timeZoneLabel: brand.timeZoneLabel,

  /** Revenue milestones shown on the admin dashboard (in paise). */
  milestones: [
    { label: "First test", paise: 300000 },
    { label: "Next goal", paise: 1000000 },
  ],
} as const;

export const siteUrl = (process.env.SITE_URL || "http://localhost:3000").replace(/\/$/, "");

/** Personal (1:1) training options. */
export const training = {
  durations: [
    { minutes: 45, paise: 49900, label: "Quick fix", blurb: "One specific problem, solved together." },
    { minutes: 90, paise: 79900, label: "Deep session", blurb: "Work through a full project with feedback." },
    { minutes: 120, paise: 99900, label: "Extended", blurb: "Multiple topics or a complete review of your work." },
  ],
  /** Topics a student can pick (in addition to "Something else"). */
  topics: [
    "Premiere Pro editing",
    "Thumbnails & Photoshop",
    "Scriptwriting",
    "Storytelling",
    "Shorts & retention",
    "Voice & audio",
    "Recording setup & OBS",
    "Finding video ideas",
    "YouTube analytics",
    "Channel strategy",
    "Review my video / channel",
  ],
} as const;
