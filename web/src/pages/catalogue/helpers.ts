import type { Workshop } from "@shared/content";
import type { PublicSession } from "@shared/pages/catalogue";
import type { ClassSession } from "@/lib/types";

/** The shared session components take the full `ClassSession`; the private fields are never sent to the public site, so they stay empty. */
export function toClassSession(s: PublicSession, workshop?: Workshop): ClassSession {
  return { ...s, meetingLink: null, notes: null, createdAt: "", paidCount: 0, attendedCount: 0, workshop };
}

/** `nextByWorkshop[slug]` that can't pick up inherited keys such as "constructor". */
export function nextSessionAt(nextByWorkshop: Record<string, string>, slug: string): string | undefined {
  return Object.hasOwn(nextByWorkshop, slug) ? nextByWorkshop[slug] : undefined;
}
