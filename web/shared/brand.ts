/** Static brand facts safe to ship in the client bundle. Env-driven values (contact email, legal details) come from GET /api/site. */
export const brand = {
  name: "CREATEVA",
  tagline: "Learn. Create. Improve.",
  description:
    "Practical creator skills through live workshops, a monthly all-access course, and personal training. 90-minute, project-based classes for ₹279 — leave every class with something you actually made.",
  timeZone: "Asia/Kolkata",
  timeZoneLabel: "IST",
} as const;
