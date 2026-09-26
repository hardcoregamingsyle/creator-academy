/**
 * Brand + business settings.
 *
 * Everything the public sees about the academy's identity lives here, so the
 * brand can be renamed in one place. Keep this separate from any personal
 * creator identity — only put the academy's own details in this file.
 */
export const site = {
  /** Public brand name (working name — change once the final brand is chosen). */
  name: "Creator Academy",
  tagline: "Learn. Create. Improve.",
  description:
    "Practical creator skills through live workshops and personal training. 90-minute, project-based classes for ₹299 — leave every class with something you actually made.",

  /** Business contact details shown on the website. */
  contactEmail: process.env.NEXT_PUBLIC_CONTACT_EMAIL || "hello@example.com",
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
    businessName: process.env.NEXT_PUBLIC_LEGAL_NAME || "[Legal business / account-holder name]",
    address: process.env.NEXT_PUBLIC_LEGAL_ADDRESS || "[Registered business address, City, State, PIN]",
    jurisdiction: process.env.NEXT_PUBLIC_JURISDICTION || "India",
  },

  /** Pricing (in paise: ₹1 = 100 paise). */
  pricing: {
    workshopPaise: 29900,
    /** Returning-student discount for people who attended the immediately previous class. */
    returningDiscountPercent: 10,
  },

  /** Default seats per live workshop — small groups so everyone can ask questions. */
  defaultCapacity: 20,

  /** A pending (unpaid) booking holds its seat for this many minutes. */
  seatHoldMinutes: 15,

  /** All class times are shown in Indian Standard Time. */
  timeZone: "Asia/Kolkata",
  timeZoneLabel: "IST",

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
