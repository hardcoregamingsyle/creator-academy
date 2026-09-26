/**
 * Contact form topics. Kept in a plain (non-"use client") module so the
 * server page can import the array directly — a constant exported from a
 * client component becomes an opaque client reference, not the real value.
 */
export const CONTACT_TOPICS = [
  "A workshop",
  "Personal training",
  "Payments & refunds",
  "My booking",
  "Suggest a workshop",
  "Something else",
] as const;
