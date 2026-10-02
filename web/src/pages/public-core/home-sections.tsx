import {
  ArrowRight,
  BadgePercent,
  CalendarDays,
  Check,
  CircleDollarSign,
  Clock,
  CreditCard,
  GraduationCap,
  Hammer,
  LayoutGrid,
  MousePointerClick,
  Radio,
  Sparkles,
  UserRound,
  Users,
  Video,
} from "lucide-react";
import { formatDateLong, formatINR, formatTimeRange } from "@shared/format";
import type { HomeSocial, HomeTrainingDuration, PublicSession } from "@shared/pages/public-core";
import { SocialIcon } from "@/components/brand";
import { ClassTimeline } from "@/components/class-timeline";
import { Price } from "@/components/price";
import { SeatsLeft } from "@/components/session-list";
import { ButtonLink, Container, Eyebrow, Section, SectionHeading } from "@/components/ui";

export function Hero({ next, workshopPaise, defaultCapacity }: { next: PublicSession | null; workshopPaise: number; defaultCapacity: number }) {
  return (
    <section className="relative overflow-hidden border-b border-line">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.5] [background-image:linear-gradient(to_right,var(--color-line)_1px,transparent_1px)] [background-size:96px_100%] [mask-image:linear-gradient(to_bottom,black,transparent_85%)]"
        aria-hidden
      />
      <Container className="relative grid items-center gap-12 py-14 sm:py-20 lg:grid-cols-[1.15fr_1fr] lg:py-24">
        <div>
          <Eyebrow className="animate-fade-up">Live creator workshops · {formatINR(workshopPaise)} per class</Eyebrow>
          <h1 className="mt-5 animate-fade-up text-5xl font-extrabold leading-[0.98] tracking-[-0.035em] [animation-delay:80ms] sm:text-7xl">
            Learn. <span className="marker">Create.</span>
            <br />
            Improve.
          </h1>
          <p className="mt-6 max-w-xl animate-fade-up text-lg text-muted [animation-delay:160ms] sm:text-xl">
            Practical creator skills through live workshops and personal training. Pick one skill, spend 90 minutes,
            and leave with something you actually made.
          </p>
          <div className="mt-8 flex animate-fade-up flex-col gap-3 [animation-delay:240ms] sm:flex-row">
            <ButtonLink href="/classes" size="lg">
              Explore classes <ArrowRight className="size-4" aria-hidden />
            </ButtonLink>
            <ButtonLink href="/personal-training" variant="outline" size="lg">
              Personal training
            </ButtonLink>
          </div>
          <ul className="mt-10 grid max-w-xl animate-fade-up grid-cols-2 gap-x-6 gap-y-3 text-[15px] text-ink-soft [animation-delay:320ms]">
            {[
              { icon: Clock, text: "90-minute live classes" },
              { icon: Hammer, text: "Leave with a finished project" },
              { icon: Users, text: `Small groups (max ${defaultCapacity})` },
              { icon: LayoutGrid, text: "No prerequisites — pick any class" },
            ].map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-2.5">
                <Icon className="size-4 shrink-0 text-accent-strong" aria-hidden />
                {text}
              </li>
            ))}
          </ul>
        </div>

        <div className="animate-pop [animation-delay:120ms]">
          <NextClassCard next={next} />
        </div>
      </Container>
    </section>
  );
}

function NextClassCard({ next }: { next: PublicSession | null }) {
  return (
    <div className="relative">
      <div className="absolute -inset-3 -z-10 rotate-[-2deg] rounded-[28px] bg-marker/60" aria-hidden />
      <div className="rounded-3xl bg-deep p-6 text-on-dark shadow-lift sm:p-8">
        <div className="flex items-center justify-between">
          <p className="flex items-center gap-2 font-mono text-xs uppercase tracking-[0.16em] text-on-dark-muted">
            <span className="size-2.5 animate-rec rounded-full bg-accent" aria-hidden />
            Next live class
          </p>
          {next && <SeatsLeft session={next} dark />}
        </div>
        {next && next.workshop ? (
          <>
            <h2 className="mt-6 text-3xl font-bold leading-tight text-on-dark sm:text-4xl">{next.workshop.title}</h2>
            <p className="mt-2 text-on-dark-muted">{next.workshop.promise}</p>
            <p className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-1 font-medium">
              <span className="inline-flex items-center gap-2">
                <CalendarDays className="size-4 text-on-dark-muted" aria-hidden />
                {formatDateLong(next.startsAt)}
              </span>
              <span className="text-on-dark-muted">{formatTimeRange(next.startsAt, next.durationMin)}</span>
            </p>
            <ClassTimeline dark showDescriptions={false} className="mt-7" durationMin={next.durationMin} />
            <div className="mt-7 flex items-center justify-between gap-4 border-t border-dark-line pt-6">
              <div>
                <p className="text-xs uppercase tracking-wider text-on-dark-muted">You leave with</p>
                <p className="mt-0.5 flex items-center gap-2 font-semibold">
                  <Check className="size-4 text-marker" aria-hidden /> {next.workshop.outcome}
                </p>
              </div>
              <ButtonLink href={next.seatsLeft > 0 ? `/book/${next.id}` : `/classes/${next.workshopSlug}`} variant="light">
                {next.seatsLeft > 0 ? `Book · ${formatINR(next.pricePaise)}` : "See dates"}
              </ButtonLink>
            </div>
          </>
        ) : (
          <>
            <h2 className="mt-6 text-3xl font-bold text-on-dark">New dates coming soon</h2>
            <p className="mt-2 text-on-dark-muted">
              We&apos;re scheduling the next round of weekend workshops. Browse the classes and ask to be notified.
            </p>
            <ClassTimeline dark showDescriptions={false} className="mt-7" />
            <ButtonLink href="/classes" variant="light" className="mt-7">
              Browse classes
            </ButtonLink>
          </>
        )}
      </div>
    </div>
  );
}

export function ValueEquation({ workshopPaise }: { workshopPaise: number }) {
  const steps = [
    { big: <Price paise={workshopPaise} strikeClassName="text-on-dark-muted" />, small: "one class, no subscription" },
    { big: "90 min", small: "live, with an instructor" },
    { big: "1 skill", small: "specific and practical" },
    { big: "1 thing made", small: "you leave with a result" },
  ];
  return (
    <section className="bg-deep text-on-dark">
      <Container className="py-10 sm:py-12">
        <ol className="grid grid-cols-2 gap-y-8 lg:grid-cols-4">
          {steps.map((s, i) => (
            <li key={s.small} className="relative flex flex-col items-start px-2 lg:px-6">
              {i > 0 && <ArrowRight className="absolute -left-3 top-3 hidden size-5 text-accent lg:block" aria-hidden />}
              <span className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl">{s.big}</span>
              <span className="mt-1 text-sm text-on-dark-muted">{s.small}</span>
            </li>
          ))}
        </ol>
      </Container>
    </section>
  );
}

export function HowItWorks() {
  const steps = [
    { icon: MousePointerClick, title: "Pick a workshop", text: "Choose the one skill you want — any class, in any order." },
    { icon: CalendarDays, title: "Choose a date", text: "Select a weekend session that fits your schedule." },
    { icon: CreditCard, title: "Pay securely", text: "UPI, card or netbanking. Instant confirmation by email." },
    { icon: Video, title: "Join live & create", text: "Follow along, ask questions, and finish your project." },
  ];
  return (
    <Section id="how-it-works">
      <Container>
        <SectionHeading
          eyebrow="How it works"
          title="From booking to finished project"
          description="No accounts, no long courses. Four steps, and every class follows the same practical structure."
        />
        <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((s, i) => (
            <li key={s.title} className="rounded-2xl border border-line bg-surface p-6">
              <div className="flex items-center justify-between">
                <span className="flex size-11 items-center justify-center rounded-xl bg-accent-soft text-accent-strong">
                  <s.icon className="size-5" aria-hidden />
                </span>
                <span className="font-mono text-sm text-subtle">0{i + 1}</span>
              </div>
              <h3 className="mt-5 text-lg font-bold">{s.title}</h3>
              <p className="mt-1.5 text-[15px] text-muted">{s.text}</p>
            </li>
          ))}
        </ol>

        <div className="mt-6 rounded-2xl border border-line bg-surface p-6 sm:p-8">
          <div className="mb-6 flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-xl font-bold">Inside every 90-minute class</h3>
            <p className="text-sm text-muted">Less talking, more doing.</p>
          </div>
          <ClassTimeline />
        </div>
      </Container>
    </Section>
  );
}

export function WhyUs({
  workshopPaise,
  returningDiscountPercent,
  defaultCapacity,
}: {
  workshopPaise: number;
  returningDiscountPercent: number;
  defaultCapacity: number;
}) {
  const reasons = [
    { icon: CircleDollarSign, title: `${formatINR(workshopPaise)} per class`, text: "A low-risk way to learn one skill properly. No subscriptions or bundles." },
    { icon: Radio, title: "Live, not pre-recorded", text: "Watch it done in real time and get your questions answered." },
    { icon: Hammer, title: "Practical projects", text: "You don't just take notes — you finish something you can use." },
    { icon: Users, title: "Small groups", text: `A maximum of ${defaultCapacity} students, so there's room to ask questions.` },
    { icon: GraduationCap, title: "Beginner-friendly", text: "Fundamentals classes assume no prior experience." },
    { icon: LayoutGrid, title: "Flexible catalogue", text: "Open-entry workshops. Take exactly what you need, in any order." },
    { icon: UserRound, title: "Personal training", text: "Need deeper help? Book a 1:1 session on your own project." },
    { icon: BadgePercent, title: `${returningDiscountPercent}% off your next class`, text: "Attended the previous class? Your next one is cheaper — automatically." },
  ];
  return (
    <Section tone="dark">
      <Container>
        <SectionHeading
          dark
          eyebrow="Why learn with us"
          title="We're not trying to be the biggest academy."
          description="Here's what you actually get — and why it works for creators who want to improve one skill at a time."
        />
        <ul className="grid gap-px overflow-hidden rounded-2xl bg-dark-line sm:grid-cols-2 lg:grid-cols-4">
          {reasons.map((r) => (
            <li key={r.title} className="bg-deep p-6">
              <r.icon className="size-6 text-accent" aria-hidden />
              <h3 className="mt-4 text-lg font-bold text-on-dark">{r.title}</h3>
              <p className="mt-1.5 text-[15px] text-on-dark-muted">{r.text}</p>
            </li>
          ))}
        </ul>
      </Container>
    </Section>
  );
}

export function PersonalTrainingTeaser({ durations }: { durations: HomeTrainingDuration[] }) {
  return (
    <Section>
      <Container>
        <div className="grid overflow-hidden rounded-3xl border border-line bg-surface shadow-card lg:grid-cols-2">
          <div className="p-7 sm:p-10">
            <Eyebrow>Personal training</Eyebrow>
            <h2 className="mt-3 text-3xl font-bold sm:text-4xl">Want one-on-one help?</h2>
            <p className="mt-4 text-muted">
              Bring your own video, thumbnail, script or channel. A personal session focuses entirely on your work — your
              questions, your pace, direct feedback.
            </p>
            <ol className="mt-6 flex flex-wrap items-center gap-2 text-sm font-semibold text-ink-soft">
              {["Topic", "Duration", "Time", "Book"].map((s, i) => (
                <li key={s} className="flex items-center gap-2">
                  {i > 0 && <ArrowRight className="size-3.5 text-subtle" aria-hidden />}
                  <span className="rounded-full bg-sunken px-3 py-1">{s}</span>
                </li>
              ))}
            </ol>
            <ButtonLink href="/personal-training" className="mt-8">
              Book personal training <ArrowRight className="size-4" aria-hidden />
            </ButtonLink>
          </div>
          <ul className="grid content-center gap-3 bg-paper p-7 sm:p-10">
            {durations.map((d) => (
              <li key={d.minutes} className="flex items-center justify-between gap-4 rounded-2xl border border-line bg-surface p-5">
                <div>
                  <p className="font-display text-lg font-bold">
                    {d.minutes} min <span className="font-sans text-sm font-medium text-muted">· {d.label}</span>
                  </p>
                  <p className="text-sm text-muted">{d.blurb}</p>
                </div>
                <p className="shrink-0 font-display text-xl font-bold">
                  <Price paise={d.paise} />
                </p>
              </li>
            ))}
          </ul>
        </div>
      </Container>
    </Section>
  );
}

export function Socials({ socials }: { socials: HomeSocial[] }) {
  const live = socials.length > 0;
  return (
    <Section className="!pb-0">
      <Container>
        <div className="flex flex-col items-start justify-between gap-8 rounded-3xl bg-accent-soft p-7 sm:p-10 lg:flex-row lg:items-center">
          <div className="max-w-xl">
            <Eyebrow>Free lessons</Eyebrow>
            <h2 className="mt-3 text-3xl font-bold">
              {live ? "Learn something free every week" : "Free lessons are coming to our socials"}
            </h2>
            <p className="mt-3 text-ink-soft">
              {live
                ? "Quick editing, thumbnail and scripting tips — short, practical and free. Follow along and join a live class when you want to go deeper."
                : "We're launching short, practical editing, thumbnail and scripting tips on Instagram, YouTube and Facebook. Until then, the fastest way to learn is a live class."}
            </p>
          </div>
          <ul className="grid w-full shrink-0 grid-cols-1 gap-3 sm:grid-cols-3 lg:w-auto">
            {socials.map((s) => (
              <li key={s.id}>
                <a
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3 text-ink hover:border-ink"
                >
                  <SocialIcon platform={s.platform} className="size-5" />
                  <span>
                    <span className="block font-semibold">{s.platform}</span>
                    <span className="block text-xs text-muted">{s.handle || "Follow"}</span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      </Container>
    </Section>
  );
}

export function FinalCta({ workshopPaise }: { workshopPaise: number }) {
  return (
    <Section>
      <Container className="text-center">
        <Sparkles className="mx-auto size-7 text-accent" aria-hidden />
        <h2 className="mx-auto mt-4 max-w-3xl text-4xl font-extrabold tracking-tight sm:text-5xl">
          Pick one skill. Spend 90 minutes. <span className="marker">Make something.</span>
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-lg text-muted">
          Live weekend workshops for {formatINR(workshopPaise)}. Beginner-friendly, project-based, no
          prerequisites.
        </p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <ButtonLink href="/schedule" size="lg">
            See upcoming classes <ArrowRight className="size-4" aria-hidden />
          </ButtonLink>
          <ButtonLink href="/classes" variant="outline" size="lg">
            Browse the catalogue
          </ButtonLink>
        </div>
      </Container>
    </Section>
  );
}
