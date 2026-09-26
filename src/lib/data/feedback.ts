import { execute, newId, nowIso, query, queryOne } from "@/lib/db";
import { getWorkshop } from "@/content/workshops";

/**
 * Post-class feedback. Public display requires BOTH the student's consent
 * (`consentPublic`) and a team member's approval (`approved`). Never invent
 * or edit reviews — only real students' words, with permission.
 */

export type AttendAgain = "yes" | "maybe" | "no";

export type Feedback = {
  id: string;
  registrationCode: string | null;
  workshopSlug: string | null;
  workshopTitle: string | null;
  rating: number;
  learned: string | null;
  unclear: string | null;
  improve: string | null;
  teachNext: string | null;
  attendAgain: AttendAgain | null;
  publicComment: string | null;
  displayName: string | null;
  consentPublic: boolean;
  approved: boolean;
  createdAt: string;
};

type FeedbackRow = {
  id: string;
  registration_code: string | null;
  workshop_slug: string | null;
  rating: number;
  learned: string | null;
  unclear: string | null;
  improve: string | null;
  teach_next: string | null;
  attend_again: AttendAgain | null;
  public_comment: string | null;
  display_name: string | null;
  consent_public: number;
  approved: number;
  created_at: string;
};

function mapFeedback(r: FeedbackRow): Feedback {
  return {
    id: r.id,
    registrationCode: r.registration_code,
    workshopSlug: r.workshop_slug,
    workshopTitle: r.workshop_slug ? getWorkshop(r.workshop_slug)?.title ?? r.workshop_slug : null,
    rating: Number(r.rating),
    learned: r.learned,
    unclear: r.unclear,
    improve: r.improve,
    teachNext: r.teach_next,
    attendAgain: r.attend_again,
    publicComment: r.public_comment,
    displayName: r.display_name,
    consentPublic: Number(r.consent_public) === 1,
    approved: Number(r.approved) === 1,
    createdAt: r.created_at,
  };
}

export type FeedbackInput = {
  registrationCode?: string | null;
  workshopSlug?: string | null;
  rating: number;
  learned?: string | null;
  unclear?: string | null;
  improve?: string | null;
  teachNext?: string | null;
  attendAgain?: AttendAgain | null;
  publicComment?: string | null;
  displayName?: string | null;
  consentPublic?: boolean;
};

export async function createFeedback(input: FeedbackInput): Promise<{ ok: true } | { ok: false; error: string }> {
  const rating = Math.round(Number(input.rating));
  if (!(rating >= 1 && rating <= 5)) return { ok: false, error: "Please choose a rating from 1 to 5 stars." };

  let workshopSlug = input.workshopSlug || null;
  const code = input.registrationCode?.trim().toUpperCase() || null;
  if (code) {
    const reg = await queryOne<{ workshop_slug: string }>(
      `SELECT s.workshop_slug FROM registrations r JOIN class_sessions s ON s.id = r.session_id WHERE r.code = ?`,
      [code],
    );
    if (reg) workshopSlug = reg.workshop_slug;
  }
  if (workshopSlug && !getWorkshop(workshopSlug)) workshopSlug = null;

  const clean = (v?: string | null) => (v?.trim() ? v.trim().slice(0, 2000) : null);
  await execute(
    `INSERT INTO feedback (id, registration_code, workshop_slug, rating, learned, unclear, improve, teach_next,
       attend_again, public_comment, display_name, consent_public, approved, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
    [
      newId(),
      code,
      workshopSlug,
      rating,
      clean(input.learned),
      clean(input.unclear),
      clean(input.improve),
      clean(input.teachNext),
      input.attendAgain ?? null,
      clean(input.publicComment),
      clean(input.displayName)?.slice(0, 60) ?? null,
      input.consentPublic ? 1 : 0,
      nowIso(),
    ],
  );
  return { ok: true };
}

export async function listFeedback(opts: { workshopSlug?: string } = {}): Promise<Feedback[]> {
  const rows = opts.workshopSlug
    ? await query<FeedbackRow>(`SELECT * FROM feedback WHERE workshop_slug = ? ORDER BY created_at DESC`, [opts.workshopSlug])
    : await query<FeedbackRow>(`SELECT * FROM feedback ORDER BY created_at DESC`);
  return rows.map(mapFeedback);
}

/** Approve/unapprove for public display. Only possible when the student consented. */
export async function setFeedbackApproved(id: string, approved: boolean): Promise<void> {
  await execute(`UPDATE feedback SET approved = ? WHERE id = ? AND consent_public = 1`, [approved ? 1 : 0, id]);
}

export async function deleteFeedback(id: string): Promise<void> {
  await execute(`DELETE FROM feedback WHERE id = ?`, [id]);
}

export type Testimonial = {
  id: string;
  quote: string;
  name: string;
  rating: number;
  workshopTitle: string | null;
};

/** Consented + approved comments for the public site. Empty until real students opt in. */
export async function listPublicTestimonials(opts: { limit?: number; workshopSlug?: string } = {}): Promise<Testimonial[]> {
  const args: (string | number)[] = [];
  let sql = `SELECT * FROM feedback WHERE approved = 1 AND consent_public = 1 AND public_comment IS NOT NULL`;
  if (opts.workshopSlug) {
    sql += ` AND workshop_slug = ?`;
    args.push(opts.workshopSlug);
  }
  sql += ` ORDER BY created_at DESC LIMIT ?`;
  args.push(opts.limit ?? 6);
  const rows = await query<FeedbackRow>(sql, args);
  return rows.map((r) => {
    const f = mapFeedback(r);
    return {
      id: f.id,
      quote: f.publicComment ?? "",
      name: f.displayName || "Student",
      rating: f.rating,
      workshopTitle: f.workshopTitle,
    };
  });
}

export type FeedbackStats = {
  count: number;
  averageRating: number | null;
  wouldAttendAgain: { yes: number; maybe: number; no: number };
  byWorkshop: { workshopSlug: string; workshopTitle: string; count: number; averageRating: number }[];
};

export async function feedbackStats(): Promise<FeedbackStats> {
  const all = await listFeedback();
  const count = all.length;
  const averageRating = count ? all.reduce((s, f) => s + f.rating, 0) / count : null;
  const wouldAttendAgain = { yes: 0, maybe: 0, no: 0 };
  for (const f of all) if (f.attendAgain) wouldAttendAgain[f.attendAgain]++;
  const groups = new Map<string, number[]>();
  for (const f of all) {
    if (!f.workshopSlug) continue;
    groups.set(f.workshopSlug, [...(groups.get(f.workshopSlug) ?? []), f.rating]);
  }
  const byWorkshop = [...groups.entries()].map(([slug, ratings]) => ({
    workshopSlug: slug,
    workshopTitle: getWorkshop(slug)?.title ?? slug,
    count: ratings.length,
    averageRating: ratings.reduce((a, b) => a + b, 0) / ratings.length,
  }));
  return { count, averageRating, wouldAttendAgain, byWorkshop };
}
