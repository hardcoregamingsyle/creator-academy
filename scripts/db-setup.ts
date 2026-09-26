/**
 * Database setup.
 *
 *   npm run db:setup          → create tables (safe to run any time)
 *   npm run db:seed           → create tables + schedule the first 4 weekends
 *                               of launch workshops and some 1:1 training slots
 *   npm run db:reset          → DELETE the local database file, then seed
 *
 * Add `-- --demo-data` to also create one past class with two clearly-marked
 * test students (useful for testing attendance + returning-student discounts
 * locally). Never use --demo-data on the production database.
 */
import fs from "node:fs";
import path from "node:path";

try {
  process.loadEnvFile?.(".env.local");
} catch {
  /* no .env.local — use defaults */
}

const args = new Set(process.argv.slice(2));

async function main() {
  const url = process.env.DATABASE_URL || "file:data/academy.db";

  if (args.has("--reset")) {
    if (!url.startsWith("file:")) {
      console.error("✗ --reset only works with a local file database. Refusing to touch", url);
      process.exit(1);
    }
    const file = path.resolve(url.slice("file:".length));
    for (const f of [file, `${file}-wal`, `${file}-shm`, `${file}-journal`]) {
      if (fs.existsSync(f)) fs.rmSync(f);
    }
    console.log("✓ Deleted local database", path.relative(process.cwd(), file));
  }

  // Import after env is loaded.
  const { query } = await import("../src/lib/db");
  const { createSession } = await import("../src/lib/data/sessions");
  const { createSlot } = await import("../src/lib/data/training");
  const { fromISTInputs } = await import("../src/lib/format");

  await query("SELECT 1");
  console.log("✓ Tables ready");

  if (!args.has("--seed")) return;

  const existing = await query<{ n: number }>("SELECT COUNT(*) AS n FROM class_sessions");
  if (Number(existing[0]?.n) > 0) {
    console.log("• Sessions already exist — skipping the schedule seed.");
  } else {
    // The weekend rotation from the launch plan (Sat 5:00 PM, Sun 11:00 AM IST).
    const rotation: [string, string][] = [
      ["premiere-pro-fundamentals", "scriptwriting-fundamentals"],
      ["thumbnail-fundamentals", "shorts-retention"],
      ["premiere-pro-fundamentals", "voice-audio-fundamentals"],
      ["thumbnail-fundamentals", "finding-video-ideas"],
    ];
    const firstSaturday = nextWeekday(6);
    for (let week = 0; week < rotation.length; week++) {
      const sat = addDays(firstSaturday, week * 7);
      const sun = addDays(sat, 1);
      await createSession({ workshopSlug: rotation[week][0], startsAt: fromISTInputs(ymd(sat), "17:00") });
      await createSession({ workshopSlug: rotation[week][1], startsAt: fromISTInputs(ymd(sun), "11:00") });
    }
    console.log(`✓ Scheduled ${rotation.length * 2} workshop sessions starting ${ymd(firstSaturday)}`);
  }

  const slots = await query<{ n: number }>("SELECT COUNT(*) AS n FROM training_slots");
  if (Number(slots[0]?.n) > 0) {
    console.log("• Training slots already exist — skipping.");
  } else {
    let count = 0;
    for (let d = 1; d <= 21; d++) {
      const day = addDays(todayIST(), d);
      const dow = day.getUTCDay();
      if (dow === 2 || dow === 4) {
        await createSlot(fromISTInputs(ymd(day), "19:00"));
        count++;
      }
      if (dow === 6) {
        await createSlot(fromISTInputs(ymd(day), "11:00"));
        count++;
      }
    }
    console.log(`✓ Opened ${count} personal-training slots over the next 3 weeks`);
  }

  if (args.has("--demo-data")) {
    const { addManualRegistration, markAllAttended } = await import("../src/lib/data/registrations");
    const { updateSession } = await import("../src/lib/data/sessions");
    const lastSunday = addDays(nextWeekday(0), -7);
    const id = await createSession({
      workshopSlug: "finding-video-ideas",
      startsAt: fromISTInputs(ymd(lastSunday), "11:00"),
      notes: "TEST DATA — created by db-setup --demo-data",
    });
    await updateSession(id, { status: "completed" });
    await addManualRegistration({ sessionId: id, name: "Test Student", email: "test.student@example.com" });
    await addManualRegistration({ sessionId: id, name: "Test Learner", email: "test.learner@example.com" });
    await markAllAttended(id);
    console.log("✓ Demo data: past class with 2 TEST students (both marked attended → eligible for 10% off)");
  }
}

// ── date helpers (calendar days in IST) ──
function todayIST(): Date {
  const now = new Date(Date.now() + 330 * 60_000);
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}
function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 86_400_000);
}
/** Next occurrence (strictly after today) of weekday `dow` (0 = Sunday). */
function nextWeekday(dow: number): Date {
  const t = todayIST();
  const diff = (dow - t.getUTCDay() + 7) % 7 || 7;
  return addDays(t, diff);
}
function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
