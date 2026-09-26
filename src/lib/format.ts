/**
 * Formatting helpers — safe to use in both server and client components.
 * All dates are displayed in Indian Standard Time.
 */

const TZ = "Asia/Kolkata";

/** ₹299 / ₹269.10 — whole rupees drop the decimals. */
export function formatINR(paise: number): string {
  const rupees = paise / 100;
  const whole = Number.isInteger(rupees);
  return (
    "₹" +
    rupees.toLocaleString("en-IN", {
      minimumFractionDigits: whole ? 0 : 2,
      maximumFractionDigits: 2,
    })
  );
}

function fmt(iso: string | Date, options: Intl.DateTimeFormatOptions): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return new Intl.DateTimeFormat("en-IN", { timeZone: TZ, ...options }).format(d);
}

/** "Sat, 26 Sep" */
export function formatDateShort(iso: string | Date): string {
  return fmt(iso, { weekday: "short", day: "numeric", month: "short" });
}

/** "Saturday, 26 September 2026" */
export function formatDateLong(iso: string | Date): string {
  return fmt(iso, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

/** "5:00 pm" → normalised to "5:00 PM" */
export function formatTime(iso: string | Date): string {
  return fmt(iso, { hour: "numeric", minute: "2-digit", hour12: true }).toUpperCase();
}

/** "Sat, 26 Sep · 5:00 PM IST" */
export function formatDateTime(iso: string | Date): string {
  return `${formatDateShort(iso)} · ${formatTime(iso)} IST`;
}

/** Time range: "5:00 PM – 6:30 PM IST" */
export function formatTimeRange(iso: string, durationMin: number): string {
  const end = new Date(new Date(iso).getTime() + durationMin * 60_000);
  return `${formatTime(iso)} – ${formatTime(end)} IST`;
}

/** Weekday name in IST: "Saturday" */
export function formatWeekday(iso: string | Date): string {
  return fmt(iso, { weekday: "long" });
}

/** Day of month + short month for calendar chips: { day: "26", month: "Sep", weekday: "Sat" } */
export function dateParts(iso: string | Date): { day: string; month: string; weekday: string } {
  return {
    day: fmt(iso, { day: "numeric" }),
    month: fmt(iso, { month: "short" }),
    weekday: fmt(iso, { weekday: "short" }),
  };
}

/** Convert an ISO timestamp to IST form-input values: { date: "2026-09-26", time: "17:00" } */
export function toISTInputs(iso: string): { date: string; time: string } {
  const d = new Date(new Date(iso).getTime() + 330 * 60_000); // UTC+5:30, no DST
  const s = d.toISOString();
  return { date: s.slice(0, 10), time: s.slice(11, 16) };
}

/** Convert IST form-input values ("2026-09-26", "17:00") to an ISO UTC timestamp. */
export function fromISTInputs(date: string, time: string): string {
  const d = new Date(`${date}T${time}:00+05:30`);
  if (Number.isNaN(d.getTime())) throw new Error("Invalid date/time");
  return d.toISOString();
}

/** "3 hours ago"-style relative label for admin lists. */
export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return `${days} d ago`;
}

export function plural(n: number, one: string, many = one + "s"): string {
  return `${n} ${n === 1 ? one : many}`;
}
