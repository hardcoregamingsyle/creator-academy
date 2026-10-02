import { execute, query, queryOne, seedOnce } from "@/lib/db";
import type { CategorySlug, Level, Workshop, WorkshopStatus } from "@/content/workshops";

/**
 * The workshop catalogue — editable from /admin/classes. Categories and the
 * 20/60/20 class structure stay fixed in code (src/content/workshops.ts,
 * tied to icons); only the workshop definitions themselves live here.
 * Seeded once from SEED_WORKSHOPS the first time the table is read, so the
 * catalogue that already shipped in src/content/workshops.ts doesn't
 * disappear when this table goes live.
 */

type Row = {
  slug: string;
  title: string;
  category_slug: string;
  status: string;
  level: string;
  duration_min: number;
  price_paise: number;
  promise: string;
  summary: string;
  learn_json: string;
  outcome: string;
  outcome_detail: string;
  for_who_json: string;
  bring_json: string;
  sort_order: number;
};

function mapRow(r: Row): Workshop {
  return {
    slug: r.slug,
    title: r.title,
    category: r.category_slug as CategorySlug,
    status: r.status as WorkshopStatus,
    level: r.level as Level,
    durationMin: Number(r.duration_min),
    promise: r.promise,
    summary: r.summary,
    learn: JSON.parse(r.learn_json) as string[],
    outcome: r.outcome,
    outcomeDetail: r.outcome_detail,
    forWho: JSON.parse(r.for_who_json) as string[],
    bring: JSON.parse(r.bring_json) as string[],
  };
}

export type WorkshopInput = {
  slug: string;
  title: string;
  category: CategorySlug;
  status: WorkshopStatus;
  level: Level;
  durationMin: number;
  promise: string;
  summary: string;
  learn: string[];
  outcome: string;
  outcomeDetail: string;
  forWho: string[];
  bring: string[];
};

function ensureSeeded(): Promise<void> {
  return seedOnce("workshops", "workshops", seedWorkshops);
}

async function seedWorkshops(): Promise<void> {
  const now = new Date().toISOString();
  for (let i = 0; i < SEED_WORKSHOPS.length; i++) {
    const w = SEED_WORKSHOPS[i];
    // INSERT OR IGNORE (keyed on the slug primary key) makes this safe if two
    // requests both see an empty table and race to seed it concurrently.
    await execute(
      `INSERT OR IGNORE INTO workshops
         (slug, title, category_slug, status, level, duration_min, price_paise, promise, summary, learn_json, outcome, outcome_detail, for_who_json, bring_json, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        w.slug,
        w.title,
        w.category,
        w.status,
        w.level,
        w.durationMin,
        0, // seed rows carry no per-workshop price override; the site-wide workshop price applies
        w.promise,
        w.summary,
        JSON.stringify(w.learn),
        w.outcome,
        w.outcomeDetail,
        JSON.stringify(w.forWho),
        JSON.stringify(w.bring),
        i * 10,
        now,
        now,
      ],
    );
  }
}

export async function listWorkshops(): Promise<Workshop[]> {
  await ensureSeeded();
  const rows = await query<Row>(`SELECT * FROM workshops ORDER BY sort_order ASC`);
  return rows.map(mapRow);
}

/**
 * Every workshop keyed by slug, in ONE query. Use this when resolving the
 * workshop for many rows (sessions, registrations, feedback…) instead of
 * calling getWorkshop() per row — each call is a network round trip, and
 * Workers cap subrequests and CPU per request.
 */
export async function workshopMap(): Promise<Map<string, Workshop>> {
  return new Map((await listWorkshops()).map((w) => [w.slug, w]));
}

export async function getWorkshop(slug: string): Promise<Workshop | null> {
  await ensureSeeded();
  const row = await queryOne<Row>(`SELECT * FROM workshops WHERE slug = ?`, [slug]);
  return row ? mapRow(row) : null;
}

export async function liveWorkshops(): Promise<Workshop[]> {
  return (await listWorkshops()).filter((w) => w.status === "live");
}

export async function plannedWorkshops(): Promise<Workshop[]> {
  return (await listWorkshops()).filter((w) => w.status === "planned");
}

export async function futureWorkshops(): Promise<Workshop[]> {
  return (await listWorkshops()).filter((w) => w.status === "future");
}

export async function workshopsInCategory(slug: CategorySlug): Promise<Workshop[]> {
  return (await listWorkshops()).filter((w) => w.category === slug);
}

export async function createWorkshop(input: WorkshopInput): Promise<{ ok: boolean; error?: string }> {
  await ensureSeeded();
  const existing = await queryOne(`SELECT slug FROM workshops WHERE slug = ?`, [input.slug]);
  if (existing) return { ok: false, error: "A workshop with this slug already exists." };
  const rows = await query<{ max_order: number | null }>(`SELECT MAX(sort_order) AS max_order FROM workshops`);
  const nextOrder = (rows[0]?.max_order ?? -10) + 10;
  const now = new Date().toISOString();
  await execute(
    `INSERT INTO workshops
       (slug, title, category_slug, status, level, duration_min, price_paise, promise, summary, learn_json, outcome, outcome_detail, for_who_json, bring_json, sort_order, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.slug.trim(),
      input.title.trim(),
      input.category,
      input.status,
      input.level,
      input.durationMin,
      input.promise.trim(),
      input.summary.trim(),
      JSON.stringify(input.learn),
      input.outcome.trim(),
      input.outcomeDetail.trim(),
      JSON.stringify(input.forWho),
      JSON.stringify(input.bring),
      nextOrder,
      now,
      now,
    ],
  );
  return { ok: true };
}

export async function updateWorkshop(
  slug: string,
  input: Omit<WorkshopInput, "slug">,
): Promise<{ ok: boolean; error?: string }> {
  const existing = await queryOne(`SELECT slug FROM workshops WHERE slug = ?`, [slug]);
  if (!existing) return { ok: false, error: "Workshop not found." };
  await execute(
    `UPDATE workshops SET
       title = ?, category_slug = ?, status = ?, level = ?, duration_min = ?,
       promise = ?, summary = ?, learn_json = ?, outcome = ?, outcome_detail = ?,
       for_who_json = ?, bring_json = ?, updated_at = ?
     WHERE slug = ?`,
    [
      input.title.trim(),
      input.category,
      input.status,
      input.level,
      input.durationMin,
      input.promise.trim(),
      input.summary.trim(),
      JSON.stringify(input.learn),
      input.outcome.trim(),
      input.outcomeDetail.trim(),
      JSON.stringify(input.forWho),
      JSON.stringify(input.bring),
      new Date().toISOString(),
      slug,
    ],
  );
  return { ok: true };
}

/** Blocked if any class has ever been scheduled for this workshop — cancel/reassign those sessions first. */
export async function deleteWorkshop(slug: string): Promise<{ ok: boolean; error?: string }> {
  const sessions = await queryOne<{ n: number }>(`SELECT COUNT(*) AS n FROM class_sessions WHERE workshop_slug = ?`, [
    slug,
  ]);
  if (sessions && Number(sessions.n) > 0) {
    return { ok: false, error: "This workshop has scheduled or past classes — it can't be deleted." };
  }
  await execute(`DELETE FROM workshops WHERE slug = ?`, [slug]);
  return { ok: true };
}

const DEFAULT_DURATION = 90;

function futureWorkshop(
  slug: string,
  title: string,
  category: CategorySlug,
  promise: string,
  outcome: string,
): WorkshopInput {
  return {
    slug,
    title,
    category,
    status: "future",
    level: "Intermediate",
    durationMin: DEFAULT_DURATION,
    promise,
    summary: `${promise} This workshop is on our roadmap — tell us you want it and we'll prioritise it.`,
    learn: [],
    outcome,
    outcomeDetail: "The full outline will be published when this workshop is scheduled.",
    forWho: [],
    bring: [],
  };
}

/** Seed data — the catalogue that shipped in src/content/workshops.ts before it moved to the DB. */
const SEED_WORKSHOPS: WorkshopInput[] = [
  // ─────────────────────────── LAUNCH WORKSHOPS ───────────────────────────
  {
    slug: "premiere-pro-fundamentals",
    title: "Premiere Pro Fundamentals",
    category: "editing",
    status: "live",
    level: "Beginner",
    durationMin: DEFAULT_DURATION,
    promise: "Turn your raw footage into a finished Short in 90 minutes.",
    summary:
      "Go from an empty project to an exported Short. We set up a clean project, cut for pace, add text and captions, balance music and sound effects, and export with the right settings — step by step, live.",
    learn: [
      "Interface & project organisation",
      "Importing footage",
      "Cutting & pacing",
      "Text & captions",
      "Basic transitions",
      "Audio, music & SFX",
      "Export settings",
    ],
    outcome: "One finished Short",
    outcomeDetail: "You export a complete, captioned Short that is ready to upload.",
    forWho: [
      "Complete beginners who have never opened Premiere Pro",
      "Creators who edit in phone apps and want to move to a real editor",
      "Anyone whose edits feel slow or messy",
    ],
    bring: [
      "A laptop/desktop with Adobe Premiere Pro (the free trial works)",
      "A few minutes of your own raw footage — or use our sample clips",
      "Headphones",
    ],
  },
  {
    slug: "thumbnail-fundamentals",
    title: "Thumbnail Fundamentals",
    category: "thumbnails",
    status: "live",
    level: "Beginner",
    durationMin: DEFAULT_DURATION,
    promise: "Design a clickable YouTube thumbnail from scratch.",
    summary:
      "Learn why some thumbnails get clicked and others get scrolled past — then build one yourself. Composition, contrast, text and curiosity, applied live in Photoshop.",
    learn: [
      "Composition",
      "Visual hierarchy",
      "Contrast",
      "Text that reads on a phone",
      "Subject placement",
      "Curiosity",
      "Photoshop basics",
      "Common thumbnail mistakes",
    ],
    outcome: "One finished thumbnail",
    outcomeDetail: "You leave with a finished 1280×720 thumbnail for a real (or planned) video.",
    forWho: [
      "Creators designing their own thumbnails for the first time",
      "Anyone whose thumbnails look cluttered or hard to read",
      "Editors who want to offer thumbnails to clients",
    ],
    bring: [
      "Adobe Photoshop (free trial) — or Photopea, a free browser alternative",
      "A photo of your subject/face or a screenshot from your video",
      "A video idea or title you want a thumbnail for",
    ],
  },
  {
    slug: "scriptwriting-fundamentals",
    title: "Scriptwriting Fundamentals",
    category: "scriptwriting",
    status: "live",
    level: "Beginner",
    durationMin: DEFAULT_DURATION,
    promise: "Write your first high-retention Short script in 90 minutes.",
    summary:
      "Turn an idea into a tight script: a hook in the first line, curiosity that pulls viewers forward, a clear structure and a payoff worth waiting for. Then cut every line that doesn't earn its place.",
    learn: [
      "Idea → premise",
      "Hooks",
      "Curiosity & open loops",
      "Story structure",
      "Payoffs",
      "Removing unnecessary lines",
      "Shorts vs long-form scripts",
    ],
    outcome: "One complete Short script",
    outcomeDetail: "You finish a complete, recording-ready script for a Short.",
    forWho: [
      "Creators who ramble on camera or lose their point",
      "Anyone who starts videos without a plan",
      "Faceless and voiceover creators",
    ],
    bring: ["Google Docs, Notion or a notebook", "One video idea you want to make (we'll help if you don't have one)"],
  },
  {
    slug: "shorts-retention",
    title: "Shorts Retention",
    category: "shorts",
    status: "live",
    level: "Beginner",
    durationMin: DEFAULT_DURATION,
    promise: "Find — and fix — the moments where viewers swipe away.",
    summary:
      "Retention isn't luck. We break down first-second hooks, information density, pattern changes and pacing, then apply them to a real Short so it holds attention to the end.",
    learn: [
      "The first-second hook",
      "Information density",
      "Pattern changes",
      "Visual progression",
      "Pacing",
      "Open loops",
      "Ending & payoff",
    ],
    outcome: "An improved Short",
    outcomeDetail: "You re-edit an existing Short (yours or our sample) with a stronger hook, pace and ending.",
    forWho: [
      "Creators whose Shorts get views but low watch-through",
      "Editors who want a clear retention checklist",
      "Anyone starting on Shorts, Reels or TikTok",
    ],
    bring: [
      "One of your existing Shorts — or use our sample",
      "Any editor you're comfortable with (Premiere Pro, CapCut, DaVinci Resolve…)",
    ],
  },
  {
    slug: "voice-audio-fundamentals",
    title: "Voice & Audio Fundamentals",
    category: "audio",
    status: "live",
    level: "Beginner",
    durationMin: DEFAULT_DURATION,
    promise: "Make your voice sound clean and clear — with the gear you already have.",
    summary:
      "Bad audio makes people leave faster than bad video. Learn mic positioning, how to treat your room, and a simple processing chain — noise reduction, EQ and compression — to turn a rough recording into a clean voice track.",
    learn: [
      "Mic positioning",
      "Recording environment",
      "Noise reduction",
      "EQ",
      "Compression",
      "Music volume",
      "SFX & silence",
      "Voice clarity",
    ],
    outcome: "A cleaned voice track",
    outcomeDetail: "You process a raw recording of your voice into a clean, balanced voice track.",
    forWho: [
      "Voiceover, commentary and faceless creators",
      "Anyone recording on a phone or a budget mic",
      "Creators who've been told their audio is hard to hear",
    ],
    bring: ["Any microphone — a phone mic is fine", "Audacity (free) or Premiere Pro / Audition", "Headphones"],
  },
  {
    slug: "finding-video-ideas",
    title: "Finding Video Ideas",
    category: "ideas",
    status: "live",
    level: "Beginner",
    durationMin: DEFAULT_DURATION,
    promise: "Leave with 20 video ideas you actually want to make.",
    summary:
      "Stop staring at a blank page. Learn repeatable ways to find ideas — from problems, questions, search behaviour and your community — and how to find an original angle instead of copying what already exists.",
    learn: [
      "Finding problems & questions",
      "Trends",
      "Search behaviour",
      "Community research",
      "Competitor research",
      "Finding original angles",
      "Turning one idea into multiple videos",
    ],
    outcome: "20 usable video ideas",
    outcomeDetail: "You build a list of 20 video ideas for your niche, each with an angle.",
    forWho: [
      "Creators who run out of ideas",
      "Anyone starting a new channel or niche",
      "Creators who keep copying trends and want original concepts",
    ],
    bring: ["A notebook or doc", "Your channel/niche (or the one you're planning)"],
  },

  // ─────────────────────────── PLANNED (next up) ───────────────────────────
  {
    slug: "advanced-premiere-pro",
    title: "Advanced Premiere Pro",
    category: "editing",
    status: "planned",
    level: "Intermediate",
    durationMin: DEFAULT_DURATION,
    promise: "Edit faster and add the polish that makes videos feel professional.",
    summary:
      "For editors who know the basics. Build an efficient workflow and use keyframes, speed ramps, adjustment layers, advanced captions and layered sound design with intent.",
    learn: [
      "Advanced editing workflow",
      "Keyframes",
      "Speed ramps",
      "Advanced captions",
      "Adjustment layers",
      "Better sound design",
      "Professional editing techniques",
    ],
    outcome: "A polished, advanced edit",
    outcomeDetail: "You rebuild a short sequence using speed ramps, keyframed motion and layered sound.",
    forWho: ["Editors comfortable with Premiere Pro basics", "Creators who want a more professional finish"],
    bring: ["Adobe Premiere Pro", "Footage from a recent project"],
  },
  {
    slug: "advanced-thumbnail-design",
    title: "Advanced Thumbnail Design",
    category: "thumbnails",
    status: "planned",
    level: "Intermediate",
    durationMin: DEFAULT_DURATION,
    promise: "Go from 'nice design' to thumbnails built on a real concept.",
    summary:
      "Thumbnail psychology, visual storytelling and competitive research — then a faster Photoshop workflow to produce stronger concepts and variations worth testing.",
    learn: [
      "Thumbnail psychology",
      "Visual storytelling",
      "Competitive research",
      "Stronger concepts",
      "Advanced Photoshop workflow",
      "A/B testing concepts",
    ],
    outcome: "3 concepts + 1 finished design",
    outcomeDetail: "You sketch three thumbnail concepts for one video and finish the strongest.",
    forWho: ["Creators who already make their own thumbnails", "Designers who want to specialise in thumbnails"],
    bring: ["Adobe Photoshop or Photopea", "A video you want to package"],
  },
  {
    slug: "storytelling-for-youtubers",
    title: "Storytelling for YouTubers",
    category: "storytelling",
    status: "planned",
    level: "Intermediate",
    durationMin: DEFAULT_DURATION,
    promise: "Make any topic feel like a story people need to see the end of.",
    summary:
      "Structure, tension, escalation and emotional progression — the tools that make viewers care. Learn how they work differently in long-form and in Shorts.",
    learn: [
      "Story structure",
      "Tension",
      "Escalation",
      "Curiosity",
      "Emotional progression",
      "Payoffs",
      "Long-form vs Shorts storytelling",
    ],
    outcome: "A story outline for your next video",
    outcomeDetail: "You outline your next video beat by beat, with tension and a payoff.",
    forWho: ["Creators whose videos feel flat", "Anyone who finished Scriptwriting Fundamentals and wants more"],
    bring: ["A doc or notebook", "An upcoming video idea"],
  },
  {
    slug: "short-form-content-strategy",
    title: "Short-Form Content Strategy",
    category: "shorts",
    status: "planned",
    level: "Intermediate",
    durationMin: DEFAULT_DURATION,
    promise: "Build a Shorts pipeline you can keep up every week.",
    summary:
      "Stop making every Short from zero. Define content pillars, repeatable formats, series and hook systems, and learn to repurpose one piece of content across platforms.",
    learn: [
      "Content pillars",
      "Series & repeatable formats",
      "Hook systems",
      "Repurposing",
      "Building a consistent content pipeline",
    ],
    outcome: "A 30-day Shorts plan",
    outcomeDetail: "You leave with pillars, formats and a 30-day posting plan for your channel.",
    forWho: ["Creators who post inconsistently", "Anyone growing on Shorts, Reels or TikTok"],
    bring: ["Your channel/page", "A doc or spreadsheet"],
  },
  {
    slug: "better-video-recording",
    title: "Better Video Recording",
    category: "recording",
    status: "planned",
    level: "Beginner",
    durationMin: DEFAULT_DURATION,
    promise: "Look sharper on camera and on screen — without buying new gear.",
    summary:
      "Camera positioning, framing, lighting and backgrounds, plus clean screen recordings with OBS and a recording workflow that saves you time in the edit.",
    learn: ["Camera positioning", "Framing", "Lighting", "Background", "Screen recording", "OBS basics", "Recording workflow"],
    outcome: "An improved recording setup",
    outcomeDetail: "You set up, test and record a short clip with better framing, light and sound.",
    forWho: ["Creators recording on a phone or webcam", "Gaming and tutorial creators who screen record"],
    bring: ["Your camera or phone", "OBS Studio (free) if you screen record"],
  },
  {
    slug: "youtube-analytics",
    title: "YouTube Analytics",
    category: "analytics",
    status: "planned",
    level: "Beginner",
    durationMin: DEFAULT_DURATION,
    promise: "Read your analytics and know exactly what to change next.",
    summary:
      "CTR, retention, average view duration, traffic sources and audience behaviour — what each actually tells you, and how to find the weak point in any video.",
    learn: [
      "CTR",
      "Retention",
      "Average view duration",
      "Watch time",
      "Traffic sources",
      "Audience behaviour",
      "Finding weak points",
      "Turning analytics into content decisions",
    ],
    outcome: "A video analysis + 3 improvements",
    outcomeDetail: "You analyse one of your own videos and write three concrete improvements.",
    forWho: ["Creators with at least a few uploads", "Anyone who opens YouTube Studio and feels lost"],
    bring: ["Access to your YouTube Studio", "One video you want to analyse"],
  },
  {
    slug: "youtube-strategy",
    title: "YouTube Strategy",
    category: "strategy",
    status: "planned",
    level: "Intermediate",
    durationMin: DEFAULT_DURATION,
    promise: "Turn a collection of uploads into a channel with a clear direction.",
    summary:
      "Channel positioning, audience, content pillars, packaging and upload strategy — and how to build content systems so your channel is repeatable, not random.",
    learn: [
      "Channel positioning",
      "Content pillars",
      "Audience",
      "Upload strategy",
      "Packaging",
      "Content systems",
      "Building a repeatable channel",
    ],
    outcome: "A one-page channel strategy",
    outcomeDetail: "You leave with a one-page strategy: positioning, audience, pillars and cadence.",
    forWho: ["Creators who feel their channel lacks direction", "Anyone planning a new channel"],
    bring: ["Your channel (or channel idea)", "A doc or notebook"],
  },

  // ─────────────────────────── FUTURE (roadmap) ───────────────────────────
  futureWorkshop(
    "after-effects-fundamentals",
    "After Effects Fundamentals",
    "editing",
    "Animate text, graphics and simple effects for your videos.",
    "An animated title or lower third",
  ),
  futureWorkshop(
    "motion-graphics-for-creators",
    "Motion Graphics for Creators",
    "editing",
    "Add motion graphics that explain ideas and keep viewers watching.",
    "A motion graphic for your video",
  ),
  futureWorkshop(
    "obs-and-streaming",
    "OBS & Streaming",
    "obs",
    "Set up OBS scenes, sources and audio for clean streams and recordings.",
    "A working OBS scene setup",
  ),
  futureWorkshop(
    "professional-sound-design",
    "Professional Sound Design",
    "audio",
    "Use sound effects, ambience and music to make edits feel alive.",
    "A sound-designed sequence",
  ),
  futureWorkshop(
    "creator-branding",
    "Creator Branding",
    "strategy",
    "Build a consistent look, voice and identity for your channel.",
    "A simple brand kit",
  ),
  futureWorkshop(
    "social-media-content-strategy",
    "Social Media Content Strategy",
    "strategy",
    "Plan content across Instagram, YouTube and Facebook without burning out.",
    "A cross-platform content plan",
  ),
  futureWorkshop(
    "creator-monetization",
    "Creator Monetization",
    "strategy",
    "Understand the realistic ways creators earn — and which fit you.",
    "A monetisation plan for your stage",
  ),
  futureWorkshop(
    "advanced-youtube-analytics",
    "Advanced YouTube Analytics",
    "analytics",
    "Go deeper into cohorts, returning viewers and packaging experiments.",
    "A channel-level analysis",
  ),
  futureWorkshop(
    "content-repurposing",
    "Content Repurposing",
    "shorts",
    "Turn one video into Shorts, posts and clips across platforms.",
    "A repurposing plan for one video",
  ),
  futureWorkshop(
    "ai-tools-for-creators",
    "AI Tools for Creators",
    "strategy",
    "Use AI tools to speed up research, scripting and editing — responsibly.",
    "A personal AI-assisted workflow",
  ),
];
