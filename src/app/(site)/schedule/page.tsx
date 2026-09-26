import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays } from "lucide-react";
import { liveWorkshops } from "@/content/workshops";
import { listUpcomingSessions, type ClassSession } from "@/lib/data/sessions";
import { dateParts, formatDateShort } from "@/lib/format";
import { SessionList } from "@/components/session-list";
import { Container, EmptyState, Eyebrow, cn } from "@/components/ui";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Schedule" };

const DAY_MS = 24 * 60 * 60 * 1000;

/** IST calendar parts (year/month/day-of-month/day-of-week) for an instant. */
function istParts(input: string | Date): { y: number; m: number; day: number; dow: number } {
  const d = typeof input === "string" ? new Date(input) : input;
  const shifted = new Date(d.getTime() + 330 * 60_000); // Asia/Kolkata = UTC+5:30, no DST
  return { y: shifted.getUTCFullYear(), m: shifted.getUTCMonth(), day: shifted.getUTCDate(), dow: shifted.getUTCDay() };
}

/** The Saturday (as a UTC-midnight timestamp) of the weekend containing this IST day. */
function weekendAnchor(p: { y: number; m: number; day: number; dow: number }): number {
  const base = Date.UTC(p.y, p.m, p.day);
  if (p.dow === 6) return base; // Saturday itself
  if (p.dow === 0) return base - DAY_MS; // Sunday -> previous Saturday
  return base + (6 - p.dow) * DAY_MS; // weekday -> upcoming Saturday
}

type Group = { key: string; anchor: number; label: string; sessions: ClassSession[] };

/** Groups sessions by weekend ("This weekend" / "Next weekend" / "Weekend of 10–11 Oct"), with
 *  weekday sessions grouped separately by the week they fall in. */
function buildGroups(sessions: ClassSession[]): Group[] {
  const nowAnchor = weekendAnchor(istParts(new Date()));
  const map = new Map<string, Group>();

  for (const s of sessions) {
    const p = istParts(s.startsAt);
    let key: string;
    let anchor: number;
    let label: string;

    if (p.dow === 0 || p.dow === 6) {
      anchor = weekendAnchor(p);
      key = `weekend-${anchor}`;
      const weeksAway = Math.round((anchor - nowAnchor) / (7 * DAY_MS));
      if (weeksAway === 0) label = "This weekend";
      else if (weeksAway === 1) label = "Next weekend";
      else {
        const sat = dateParts(new Date(anchor));
        const sun = dateParts(new Date(anchor + DAY_MS));
        label =
          sat.month === sun.month
            ? `Weekend of ${sat.day}–${sun.day} ${sat.month}`
            : `Weekend of ${sat.day} ${sat.month} – ${sun.day} ${sun.month}`;
      }
    } else {
      const monday = Date.UTC(p.y, p.m, p.day) - (p.dow - 1) * DAY_MS;
      anchor = monday;
      key = `week-${anchor}`;
      label = `Week of ${formatDateShort(new Date(monday))}`;
    }

    let group = map.get(key);
    if (!group) {
      group = { key, anchor, label, sessions: [] };
      map.set(key, group);
    }
    group.sessions.push(s);
  }

  return [...map.values()].sort((a, b) => a.anchor - b.anchor);
}

function chipClass(active: boolean): string {
  return cn(
    "inline-flex items-center rounded-full border px-4 py-2 text-sm font-medium transition-colors",
    active ? "border-ink bg-ink text-on-dark" : "border-line-strong bg-surface text-ink-soft hover:border-ink hover:text-ink",
  );
}

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ workshop?: string }>;
}) {
  const { workshop: workshopParam } = await searchParams;
  const allUpcoming = await listUpcomingSessions();

  const scheduledSlugs = new Set(allUpcoming.map((s) => s.workshopSlug));
  const filterableWorkshops = liveWorkshops.filter((w) => scheduledSlugs.has(w.slug));
  const activeWorkshop = filterableWorkshops.find((w) => w.slug === workshopParam)?.slug;

  const filtered = activeWorkshop ? allUpcoming.filter((s) => s.workshopSlug === activeWorkshop) : allUpcoming;
  const groups = buildGroups(filtered);

  return (
    <Container className="py-10 sm:py-14">
      <Eyebrow>Schedule</Eyebrow>
      <h1 className="mt-3 text-3xl font-bold sm:text-4xl">Upcoming classes</h1>
      <p className="mt-4 max-w-2xl text-lg text-muted">
        We rotate workshops based on demand — usually Saturday evenings and Sunday mornings (IST). Don&apos;t see the
        class you want?{" "}
        <Link href="/classes" className="font-semibold text-accent-strong underline underline-offset-2">
          Get notified from its class page
        </Link>
        , or book{" "}
        <Link href="/personal-training" className="font-semibold text-accent-strong underline underline-offset-2">
          personal training
        </Link>
        .
      </p>

      {filterableWorkshops.length > 0 && (
        <nav aria-label="Filter by workshop" className="mt-8 flex flex-wrap gap-2">
          <Link href="/schedule" aria-current={!activeWorkshop ? "page" : undefined} className={chipClass(!activeWorkshop)}>
            All classes
          </Link>
          {filterableWorkshops.map((w) => (
            <Link
              key={w.slug}
              href={`/schedule?workshop=${w.slug}`}
              aria-current={activeWorkshop === w.slug ? "page" : undefined}
              className={chipClass(activeWorkshop === w.slug)}
            >
              {w.title}
            </Link>
          ))}
        </nav>
      )}

      {groups.length > 0 ? (
        <div className="mt-10 space-y-10">
          {groups.map((g) => (
            <section key={g.key}>
              <h2 className="text-xl font-bold text-ink">{g.label}</h2>
              <SessionList sessions={g.sessions} showWorkshop={!activeWorkshop} className="mt-4" />
            </section>
          ))}
        </div>
      ) : (
        <div className="mt-10">
          <EmptyState icon={<CalendarDays className="size-5" />} title="Nothing scheduled right now">
            {activeWorkshop
              ? "There's no upcoming session for this workshop yet. Visit its class page to get notified when one opens."
              : "New dates are added regularly. Check back soon, or browse the classes to see what's coming."}
          </EmptyState>
        </div>
      )}
    </Container>
  );
}
