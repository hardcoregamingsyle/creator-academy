/**
 * Categories, the class structure, and the Workshop shape.
 *
 * The workshop catalogue itself (the actual list of workshops) used to live
 * here as a static array. It now lives in the `workshops` DB table (see
 * src/lib/data/workshops.ts) so the team can add/edit/price workshops from
 * /admin/classes without a deploy. Categories stay fixed here — they're tied
 * to icons in src/components/brand.tsx.
 */

export type CategorySlug =
  | "editing"
  | "thumbnails"
  | "scriptwriting"
  | "storytelling"
  | "shorts"
  | "audio"
  | "recording"
  | "obs"
  | "ideas"
  | "analytics"
  | "strategy";

export type Category = {
  slug: CategorySlug;
  name: string;
  /** Short description used on category cards. */
  blurb: string;
};

export const categories: Category[] = [
  { slug: "editing", name: "Editing", blurb: "Cut, pace and finish videos people watch to the end." },
  { slug: "thumbnails", name: "Thumbnails", blurb: "Design thumbnails that earn the click." },
  { slug: "scriptwriting", name: "Scriptwriting", blurb: "Hooks, structure and scripts with no wasted lines." },
  { slug: "storytelling", name: "Storytelling", blurb: "Tension, curiosity and payoffs that keep people watching." },
  { slug: "shorts", name: "Shorts", blurb: "Short-form hooks, pacing and retention." },
  { slug: "audio", name: "Audio", blurb: "Clean, clear voice and sound that feels professional." },
  { slug: "recording", name: "Recording", blurb: "Framing, lighting and a repeatable recording workflow." },
  { slug: "obs", name: "OBS", blurb: "Screen recording and streaming setups that just work." },
  { slug: "ideas", name: "Ideas", blurb: "Find video ideas you actually want to make." },
  { slug: "analytics", name: "Analytics", blurb: "Read your numbers and turn them into decisions." },
  { slug: "strategy", name: "Strategy", blurb: "Positioning, content pillars and systems for growth." },
];

export type WorkshopStatus = "live" | "planned" | "future";
export type Level = "Beginner" | "Intermediate" | "Advanced";

export type Workshop = {
  slug: string;
  title: string;
  category: CategorySlug;
  status: WorkshopStatus;
  level: Level;
  durationMin: number;
  /** The transformation, in one sentence. This is the headline we sell. */
  promise: string;
  /** Two–three sentence description. */
  summary: string;
  /** What you'll learn (topics). */
  learn: string[];
  /** What you'll create — the finished thing students leave with. Short. */
  outcome: string;
  /** A sentence expanding on the outcome. */
  outcomeDetail: string;
  /** Who it's for. */
  forWho: string[];
  /** Software / things to have ready. */
  bring: string[];
};

export function getCategory(slug: string): Category | undefined {
  return categories.find((c) => c.slug === slug);
}

/** The 20 / 60 / 20 class structure used by every workshop. */
export const classStructure = [
  { key: "explain", label: "Explain", share: 20, description: "The concept, simply — why it works." },
  { key: "demonstrate", label: "Demonstrate", share: 60, description: "Watch it done live, step by step." },
  { key: "create", label: "Create", share: 20, description: "You apply it and make your own." },
] as const;
