import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays, CheckCircle2, Sparkles, Users, Wallet } from "lucide-react";
import { CategoryIcon } from "@/components/brand";
import { Button, Card, Container, EmptyState, Eyebrow, Section, SectionHeading } from "@/components/ui";
import { passesOnSale } from "@/lib/data/monthly-pass";
import { listUpcomingSessions } from "@/lib/data/sessions";
import { getSiteSettings } from "@/lib/data/site-settings";
import { formatDateShort, formatINR, formatTimeRange, istMonthKey } from "@/lib/format";
import { paymentMode } from "@/lib/payments";
import { PassForm } from "./pass-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Monthly All-Access Pass",
  description: "One price, every workshop this month. Learn the complete creator skill set instead of one class at a time.",
};

export default async function MonthlyPassPage() {
  const [months, allUpcoming, mode, settings] = await Promise.all([
    Promise.resolve(passesOnSale()),
    listUpcomingSessions(),
    Promise.resolve(paymentMode()),
    getSiteSettings(),
  ]);

  const byMonth = new Map(months.map((m) => [m.monthKey, allUpcoming.filter((s) => istMonthKey(s.startsAt) === m.monthKey)]));
  const price = settings.monthlyPassPricePaise;
  const perClassPrice = settings.workshopPricePaise;

  return (
    <>
      {/* Hero */}
      <div className="border-b border-line py-14 sm:py-20">
        <Container className="grid items-center gap-10 lg:grid-cols-[1.1fr_1fr]">
          <div>
            <Eyebrow>Monthly Creator Course</Eyebrow>
            <h1 className="mt-3 text-4xl font-bold sm:text-5xl">
              Every workshop. <span className="marker">One price.</span>
            </h1>
            <p className="mt-5 max-w-xl text-lg text-muted">
              Don&apos;t want to learn just one skill? The All-Access Pass covers every live workshop scheduled this
              month — editing, thumbnails, scripts, audio, ideas, and whatever else we run — for one flat price.
              No per-class payments.
            </p>
            <ul className="mt-7 space-y-3 text-[15px] text-ink-soft">
              {[
                "Every workshop scheduled this month, included",
                "Same live, small-group, project-based classes",
                "Book each class with your pass email — instantly confirmed, free",
                "No prerequisites, no fixed order — same open-entry classes as always",
              ].map((t) => (
                <li key={t} className="flex gap-3">
                  <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" aria-hidden />
                  {t}
                </li>
              ))}
            </ul>
            <p className="mt-6 text-sm text-muted">
              Only want one specific skill?{" "}
              <Link href="/classes" className="font-semibold text-accent-strong underline underline-offset-2">
                Book a single ₹{perClassPrice / 100} workshop
              </Link>{" "}
              instead — both options stay open, always.
            </p>
          </div>

          <Card className="p-6 sm:p-8">
            <div className="flex items-center justify-between">
              <Eyebrow>All-Access Pass</Eyebrow>
              <span className="flex size-10 items-center justify-center rounded-full bg-accent-soft text-accent-strong">
                <Sparkles className="size-5" aria-hidden />
              </span>
            </div>
            <p className="mt-4 font-display text-4xl font-bold">{formatINR(price)}</p>
            <p className="mt-1 text-sm text-muted">per calendar month</p>
            <div className="mt-6 space-y-2.5 border-t border-line pt-6 text-[15px]">
              <div className="flex justify-between text-ink-soft">
                <span className="flex items-center gap-2">
                  <CalendarDays className="size-4" aria-hidden /> Typical month
                </span>
                <span>~8 workshops</span>
              </div>
              <div className="flex justify-between text-ink-soft">
                <span className="flex items-center gap-2">
                  <Wallet className="size-4" aria-hidden /> Priced individually
                </span>
                <span className="line-through">{formatINR(perClassPrice * 8)}</span>
              </div>
              <div className="flex justify-between font-semibold text-ink">
                <span className="flex items-center gap-2">
                  <Users className="size-4" aria-hidden /> Your price
                </span>
                <span>{formatINR(price)}</span>
              </div>
            </div>
            <a href="#get-pass" className="mt-6 block">
              <Button size="lg" className="w-full">
                Get this month&apos;s pass
              </Button>
            </a>
          </Card>
        </Container>
      </div>

      {/* What's included */}
      <Section>
        <Container>
          <SectionHeading
            eyebrow="Included this month"
            title="Here's what your pass actually covers"
            description="Real, scheduled classes — not a vague promise. Every session below is included the moment your pass is active."
          />
          <div className="grid gap-8 md:grid-cols-2">
            {months.map((m) => {
              const sessions = byMonth.get(m.monthKey) ?? [];
              return (
                <div key={m.monthKey}>
                  <h3 className="font-display text-xl font-bold">{m.label}</h3>
                  {sessions.length ? (
                    <ul className="mt-4 space-y-2.5">
                      {sessions.map((s) => (
                        <li key={s.id} className="flex items-center gap-3 rounded-xl border border-line bg-surface p-3.5">
                          {s.workshop && (
                            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-sunken text-ink">
                              <CategoryIcon category={s.workshop.category} className="size-4" />
                            </span>
                          )}
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-ink">{s.workshop?.title ?? "Workshop"}</p>
                            <p className="text-sm text-muted">
                              {formatDateShort(s.startsAt)} · {formatTimeRange(s.startsAt, s.durationMin)}
                            </p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <EmptyState icon={<CalendarDays className="size-5" />} title="Being finalised" className="mt-4">
                      We&apos;re still scheduling {m.label}&apos;s classes — your pass covers whatever gets added, at
                      no extra cost.
                    </EmptyState>
                  )}
                </div>
              );
            })}
          </div>
        </Container>
      </Section>

      {/* Purchase */}
      <Section id="get-pass" tone="surface">
        <Container className="grid gap-10 lg:grid-cols-[1fr_420px]">
          <div>
            <Eyebrow>Get your pass</Eyebrow>
            <h2 className="mt-3 text-3xl font-bold sm:text-4xl">Learn the complete creator skill set</h2>
            <p className="mt-4 max-w-md text-muted">
              Pick a month, enter your details, and pay once. Every class that month is then instantly free at
              checkout with the same email — no code to remember, nothing to redeem.
            </p>
            <div className="mt-8 rounded-2xl border border-line bg-surface p-5">
              <h3 className="font-semibold text-ink">How it works</h3>
              <ol className="mt-3 space-y-2 text-sm text-ink-soft">
                <li>1. Buy the pass for a month, with your email.</li>
                <li>2. Browse the schedule and pick any class that month.</li>
                <li>3. Book it with the same email — ₹0, instantly confirmed.</li>
                <li>4. Repeat for every class that month, at no extra cost.</li>
              </ol>
            </div>
          </div>
          <Card className="p-6 sm:p-7">
            {mode === "disabled" ? (
              <EmptyState icon={<Wallet className="size-5" />} title="Online payment is paused">
                We&apos;re finishing our payment setup. Please check back soon or contact us to arrange a pass.
              </EmptyState>
            ) : (
              <PassForm months={months} pricePaise={price} demoMode={mode === "demo"} />
            )}
          </Card>
        </Container>
      </Section>
    </>
  );
}
