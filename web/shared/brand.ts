/** Static brand facts safe to ship in the client bundle. Env-driven values (contact email, legal details) come from GET /api/site. */
export const brand = {
  name: "CREATEVA",
  tagline: "Learn. Create. Improve.",
  description:
    "Professional software only: Adobe Photoshop and Adobe Premiere Pro. Practical creator skills through live workshops, a monthly all-access course, and personal training. 90-minute, project-based classes for ₹279 — leave every class with something you actually made.",
  /** The software the classes teach. Add a tool here and every notice on the site updates. */
  software: ["Adobe Photoshop", "Adobe Premiere Pro"],
  timeZone: "Asia/Kolkata",
  timeZoneLabel: "IST",
} as const;
