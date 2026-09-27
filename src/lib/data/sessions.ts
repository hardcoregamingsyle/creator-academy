import { execute, newId, nowIso, query, queryOne } from "@/lib/db";
import { site } from "@/lib/site";
import { getSiteSettings } from "@/lib/data/site-settings";
import { getWorkshop } from "@/lib/data/workshops";
import { type Workshop } from "@/content/workshops";

export type SessionStatus = "scheduled" | "completed" | "cancelled";

export type ClassSession = {
  id: string;
  workshopSlug: string;
  startsAt: string;
  durationMin: number;
  capacity: number;
  pricePaise: number;
  meetingLink: string | null;
  status: SessionStatus;
  notes: string | null;
  createdAt: string;
  /** Paid seats + unpaid seats still on hold. */
  seatsTaken: number;
  seatsLeft: number;
  paidCount: number;
  attendedCount: number;
  /** Workshop from the catalogue (undefined if the slug was removed). */
  workshop: Workshop | undefined;
};

type SessionRow = {
  id: string;
  workshop_slug: string;
  starts_at: string;
  duration_min: number;
  capacity: number;
  price_paise: number;
  meeting_link: string | null;
  status: SessionStatus;
  notes: string | null;
  created_at: string;
  seats_taken: number;
  paid_count: number;
  attended_count: number;
};

export function holdCutoffIso(): string {
  return new Date(Date.now() - site.seatHoldMinutes * 60_000).toISOString();
}

const SELECT_SESSION = `
  SELECT s.*,
    (SELECT COUNT(*) FROM registrations r WHERE r.session_id = s.id
       AND (r.status = 'paid' OR (r.status = 'pending' AND r.created_at > ?))) AS seats_taken,
    (SELECT COUNT(*) FROM registrations r WHERE r.session_id = s.id AND r.status = 'paid') AS paid_count,
    (SELECT COUNT(*) FROM registrations r WHERE r.session_id = s.id AND r.status = 'paid' AND r.attended = 1) AS attended_count
  FROM class_sessions s`;

async function mapSession(r: SessionRow): Promise<ClassSession> {
  const seatsTaken = Number(r.seats_taken);
  return {
    id: r.id,
    workshopSlug: r.workshop_slug,
    startsAt: r.starts_at,
    durationMin: Number(r.duration_min),
    capacity: Number(r.capacity),
    pricePaise: Number(r.price_paise),
    meetingLink: r.meeting_link,
    status: r.status,
    notes: r.notes,
    createdAt: r.created_at,
    seatsTaken,
    seatsLeft: Math.max(0, Number(r.capacity) - seatsTaken),
    paidCount: Number(r.paid_count),
    attendedCount: Number(r.attended_count),
    workshop: (await getWorkshop(r.workshop_slug)) ?? undefined,
  };
}

/** Is this session open for booking right now? */
export function isBookable(s: ClassSession): boolean {
  return s.status === "scheduled" && new Date(s.startsAt).getTime() > Date.now() && s.seatsLeft > 0;
}

/** Upcoming scheduled sessions (soonest first), optionally for one workshop. */
export async function listUpcomingSessions(opts: { workshopSlug?: string; limit?: number } = {}): Promise<ClassSession[]> {
  const args: (string | number)[] = [holdCutoffIso(), nowIso()];
  let sql = `${SELECT_SESSION} WHERE s.status = 'scheduled' AND s.starts_at > ?`;
  if (opts.workshopSlug) {
    sql += ` AND s.workshop_slug = ?`;
    args.push(opts.workshopSlug);
  }
  sql += ` ORDER BY s.starts_at ASC`;
  if (opts.limit) {
    sql += ` LIMIT ?`;
    args.push(opts.limit);
  }
  const rows = await query<SessionRow>(sql, args);
  return Promise.all(rows.map(mapSession));
}

export async function getSession(id: string): Promise<ClassSession | null> {
  const row = await queryOne<SessionRow>(`${SELECT_SESSION} WHERE s.id = ?`, [holdCutoffIso(), id]);
  return row ? await mapSession(row) : null;
}

/** All sessions for the admin dashboard. `scope` filters upcoming vs past. */
export async function listSessions(scope: "upcoming" | "past" | "all" = "all"): Promise<ClassSession[]> {
  const now = nowIso();
  let sql = SELECT_SESSION;
  const args: string[] = [holdCutoffIso()];
  if (scope === "upcoming") {
    sql += ` WHERE s.starts_at > ? ORDER BY s.starts_at ASC`;
    args.push(now);
  } else if (scope === "past") {
    sql += ` WHERE s.starts_at <= ? ORDER BY s.starts_at DESC`;
    args.push(now);
  } else {
    sql += ` ORDER BY s.starts_at DESC`;
  }
  const rows = await query<SessionRow>(sql, args);
  return Promise.all(rows.map(mapSession));
}

/**
 * The "immediately previous class": the most recent session that has already
 * started and wasn't cancelled. Used for the returning-student discount.
 */
export async function getPreviousSession(): Promise<ClassSession | null> {
  const row = await queryOne<SessionRow>(
    `${SELECT_SESSION} WHERE s.status != 'cancelled' AND s.starts_at <= ? ORDER BY s.starts_at DESC LIMIT 1`,
    [holdCutoffIso(), nowIso()],
  );
  return row ? await mapSession(row) : null;
}

export type SessionInput = {
  workshopSlug: string;
  startsAt: string; // ISO
  durationMin?: number;
  capacity?: number;
  pricePaise?: number;
  meetingLink?: string | null;
  notes?: string | null;
};

export async function createSession(input: SessionInput): Promise<string> {
  const id = newId();
  const settings = await getSiteSettings();
  await execute(
    `INSERT INTO class_sessions (id, workshop_slug, starts_at, duration_min, capacity, price_paise, meeting_link, status, notes, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'scheduled', ?, ?)`,
    [
      id,
      input.workshopSlug,
      input.startsAt,
      input.durationMin ?? (await getWorkshop(input.workshopSlug))?.durationMin ?? 90,
      input.capacity ?? site.defaultCapacity,
      input.pricePaise ?? settings.workshopPricePaise,
      input.meetingLink || null,
      input.notes || null,
      nowIso(),
    ],
  );
  return id;
}

export async function updateSession(
  id: string,
  patch: Partial<SessionInput> & { status?: SessionStatus },
): Promise<void> {
  const map: Record<string, string> = {
    workshopSlug: "workshop_slug",
    startsAt: "starts_at",
    durationMin: "duration_min",
    capacity: "capacity",
    pricePaise: "price_paise",
    meetingLink: "meeting_link",
    notes: "notes",
    status: "status",
  };
  const sets: string[] = [];
  const args: (string | number | null)[] = [];
  for (const [key, col] of Object.entries(map)) {
    const value = (patch as Record<string, unknown>)[key];
    if (value !== undefined) {
      sets.push(`${col} = ?`);
      args.push(value === "" ? null : (value as string | number | null));
    }
  }
  if (!sets.length) return;
  args.push(id);
  await execute(`UPDATE class_sessions SET ${sets.join(", ")} WHERE id = ?`, args);
}

/** Delete a session only if nobody has paid for it (otherwise cancel it instead). */
export async function deleteSession(id: string): Promise<{ ok: boolean; reason?: string }> {
  const paid = await queryOne<{ n: number }>(
    `SELECT COUNT(*) AS n FROM registrations WHERE session_id = ? AND status = 'paid'`,
    [id],
  );
  if (paid && Number(paid.n) > 0) {
    return { ok: false, reason: "This session has paid registrations — cancel it instead of deleting." };
  }
  await execute(`DELETE FROM registrations WHERE session_id = ?`, [id]);
  await execute(`DELETE FROM class_sessions WHERE id = ?`, [id]);
  return { ok: true };
}
