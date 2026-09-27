import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  BadgePercent,
  Compass,
  GraduationCap,
  Hammer,
  MessageCircle,
  Radio,
  Rocket,
  ShieldCheck,
  UserRound,
  Users,
} from "lucide-react";
import { site, training } from "@/lib/site";
import { formatINR } from "@/lib/format";
import { classStructure, workshops } from "@/content/workshops";
import { ButtonLink, Container, Eyebrow, Section, SectionHeading } from "@/components/ui";
import { ClassTimeline } from "@/components/class-timeline";

export const metadata: Metadata = {
  title: "About",
  description: `Why ${site.name} exists, how our live workshops work, and how students shape what we teach next.`,
};

const honestyCommitments = [
  {
    icon: ShieldCheck,
    title: "We don't fake reviews",
    text: "Every testimonial on this site comes from a real student's feedback form — never written or edited by us.",
  },
  {
    icon: MessageCircle,
    title: "Feedback only shows with consent",
    text: "A student's comment and name appear publicly only if they explicitly opt in, and our team reviews it first.",
  },
  {
    icon: Users,
    title: "No fake urgency",
    text: "Seat counts you see are real. We don't invent scarcity to push you into booking.",
  },
];

export default function AboutPage() {
  return (
    <>
      <Container className="py-10 sm:py-14">
        <Eyebrow>About {site.name}</Eyebrow>
        <h1 className="mt-3 max-w-2xl text-3xl font-bold sm:text-4xl">
          Practical creator skills, taught live, one focused class at a time.
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-muted">
          {site.name} runs live, project-based workshops for content creators — editing, thumbnails, scripts,
          Shorts, audio, ideas and more. No vague courses, no long sequences. You pick one skill, spend 90 minutes,
          and leave with something you actually made.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <ButtonLink href="/classes" size="lg">
            Explore classes <ArrowRight className="size-4" aria-hidden />
          </ButtonLink>
          <ButtonLink href="/personal-training" variant="outline" size="lg">
            Personal training
          </ButtonLink>
        </div>
      </Container>

      {/* ── why we exist ── */}
      <Section tone="surface">
        <Container className="grid gap-10 lg:grid-cols-2 lg:items-center">
          <div>
            <Eyebrow>Why we exist</Eyebrow>
            <h2 className="mt-3 text-3xl font-bold sm:text-4xl">Creators need skills, not another vague course</h2>
            <p className="mt-4 text-muted">
              Most creator education is either a free video that skips the details, or a long, expensive course
              that assumes you already know what you need. Neither answers a simple question: how do I actually{" "}
              <em>do</em> this thing — cut this clip, design this thumbnail, write this hook — right now?
            </p>
            <p className="mt-4 text-muted">
              So {site.name} builds classes around one skill at a time, taught live by people who do the work, with
              you making something real before the class ends.
            </p>
          </div>
          <ul className="grid gap-4 sm:grid-cols-2">
            {[
              { icon: Compass, text: "One specific skill per class — no filler" },
              { icon: Hammer, text: "You leave with a finished thing, not just notes" },
              { icon: Radio, text: "Taught live, so you can ask questions as you go" },
              { icon: Users, text: `Small groups — max ${site.defaultCapacity} students` },
            ].map(({ icon: Icon, text }) => (
              <li key={text} className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-5">
                <span className="flex size-10 items-center justify-center rounded-xl bg-accent-soft text-accent-strong">
                  <Icon className="size-5" aria-hidden />
                </span>
                <span className="text-[15px] font-medium text-ink-soft">{text}</span>
              </li>
            ))}
          </ul>
        </Container>
      </Section>

      {/* ── how we teach ── */}
      <Section>
        <Container>
          <SectionHeading
            eyebrow="How we teach"
            title="Every class follows the same structure"
            description={`${classStructure.map((c) => `${c.share}% ${c.label.toLowerCase()}`).join(", ")} — live, project-based and small enough that you're never just watching.`}
          />
          <div className="rounded-2xl border border-line bg-surface p-6 sm:p-8">
            <ClassTimeline />
          </div>
          <p className="mt-6 max-w-2xl text-muted">
            We start with why the idea works, then demonstrate it step by step on a real project, then hand it back
            to you to apply it yourself — with help if you need it. The Fundamentals classes assume no prior
            experience, and every class page lists exactly what to have ready.
          </p>
        </Container>
      </Section>

      {/* ── open-entry catalogue ── */}
      <Section tone="surface">
        <Container className="grid gap-10 lg:grid-cols-[1fr_1fr] lg:items-center">
          <div>
            <Eyebrow>Open-entry catalogue</Eyebrow>
            <h2 className="mt-3 text-3xl font-bold sm:text-4xl">Pick any class, in any order</h2>
            <p className="mt-4 text-muted">
              There&apos;s no compulsory sequence and no bundle you have to buy through. Every one of our{" "}
              {workshops.length} workshops stands on its own — take Thumbnail Fundamentals without ever touching an
              editing class, or come back for Voice &amp; Audio months after your first session with us.
            </p>
            <ButtonLink href="/classes" variant="outline" className="mt-6">
              Browse all classes <ArrowRight className="size-4" aria-hidden />
            </ButtonLink>
          </div>
          <div>
            <Eyebrow>Pricing philosophy</Eyebrow>
            <h2 className="mt-3 text-2xl font-bold sm:text-3xl">Why {formatINR(site.pricing.workshopPaise)} a class</h2>
            <p className="mt-4 text-muted">
              We priced each workshop low on purpose. Trying a new skill — or a new instructor — shouldn&apos;t mean
              committing to an expensive course upfront. Pay per class, only for what you want to learn next.
            </p>
            <p className="mt-4 text-muted">
              If you attended our most recent class, your next booking is {site.pricing.returningDiscountPercent}% off
              automatically (book before the next class starts) — our way of saying thanks for coming back, not a
              sales trick.
            </p>
          </div>
        </Container>
      </Section>

      {/* ── students shape the curriculum ── */}
      <Section>
        <Container className="grid gap-10 lg:grid-cols-2 lg:items-center">
          <div>
            <Eyebrow>You shape what we teach next</Eyebrow>
            <h2 className="mt-3 text-3xl font-bold sm:text-4xl">Every class ends with a feedback form</h2>
            <p className="mt-4 text-muted">
              After each workshop we ask what you learned, what wasn&apos;t clear, and — most importantly — what
              we should teach next. That&apos;s not a formality: it&apos;s how we decide which planned workshops get
              scheduled and which roadmap ideas move up.
            </p>
            <p className="mt-4 text-muted">
              You can also vote for a roadmap workshop directly from the classes page, any time — no need to wait
              for a class to end.
            </p>
          </div>
          <div className="rounded-2xl border border-line bg-surface p-6 sm:p-8">
            <span className="flex size-11 items-center justify-center rounded-xl bg-accent-soft text-accent-strong">
              <MessageCircle className="size-5" aria-hidden />
            </span>
            <p className="mt-5 font-display text-lg font-bold">Attended a class?</p>
            <p className="mt-1 text-[15px] text-muted">
              Tell us what worked and what to teach next — it takes two minutes and directly decides our schedule.
            </p>
            <ButtonLink href="/feedback" variant="outline" className="mt-5">
              Leave feedback
            </ButtonLink>
          </div>
        </Container>
      </Section>

      {/* ── honesty commitments ── */}
      <Section tone="dark">
        <Container>
          <SectionHeading
            dark
            eyebrow="Our commitments"
            title="What we won't do"
            description="A few things we've decided matter more than looking impressive."
          />
          <ul className="grid gap-5 sm:grid-cols-3">
            {honestyCommitments.map(({ icon: Icon, title, text }) => (
              <li key={title} className="rounded-2xl border border-dark-line bg-dark-surface p-6">
                <span className="flex size-10 items-center justify-center rounded-xl bg-deep text-on-dark">
                  <Icon className="size-5" aria-hidden />
                </span>
                <p className="mt-4 font-display text-lg font-bold text-on-dark">{title}</p>
                <p className="mt-1.5 text-[15px] text-on-dark-muted">{text}</p>
              </li>
            ))}
          </ul>
        </Container>
      </Section>

      {/* ── personal training ── */}
      <Section>
        <Container className="grid gap-10 lg:grid-cols-2 lg:items-center">
          <div>
            <span className="flex size-11 items-center justify-center rounded-xl bg-accent-soft text-accent-strong">
              <UserRound className="size-5" aria-hidden />
            </span>
            <h2 className="mt-5 text-3xl font-bold sm:text-4xl">Need more than a class?</h2>
            <p className="mt-4 text-muted">
              Workshops are small group classes on a fixed topic. Personal training is a 1:1 session focused
              entirely on your project, your channel and your questions — from a {training.durations[0].minutes}
              -minute quick fix to a full {Math.max(...training.durations.map((d) => d.minutes))}-minute review.
            </p>
            <ButtonLink href="/personal-training" className="mt-6">
              See personal training <ArrowRight className="size-4" aria-hidden />
            </ButtonLink>
          </div>
          <ul className="grid grid-cols-2 gap-3">
            {training.topics.slice(0, 6).map((t) => (
              <li key={t} className="rounded-xl border border-line bg-surface px-4 py-3 text-sm font-medium text-ink-soft">
                {t}
              </li>
            ))}
          </ul>
        </Container>
      </Section>

      {/* ── what's next ── */}
      <Section tone="surface">
        <Container>
          <SectionHeading
            eyebrow="What's next"
            title="Where we're headed"
            description="Plans, not promises — here's what we're working towards as the academy grows."
          />
          <ul className="grid gap-5 sm:grid-cols-3">
            {[
              {
                icon: Rocket,
                title: "More workshops",
                text: "The workshops on our roadmap get scheduled based on what students vote for and ask for in feedback.",
              },
              {
                icon: Users,
                title: "More specialist instructors",
                text: "As the catalogue grows, we plan to bring in more instructors who specialise in each individual skill.",
              },
              {
                icon: BadgePercent,
                title: "Same honest pricing",
                text: "Whatever we add, the plan is to keep per-class pricing simple — pay for what you want to learn.",
              },
            ].map(({ icon: Icon, title, text }) => (
              <li key={title} className="rounded-2xl border border-line bg-surface p-6">
                <span className="flex size-10 items-center justify-center rounded-xl bg-sunken text-ink">
                  <Icon className="size-5" aria-hidden />
                </span>
                <p className="mt-4 font-display text-lg font-bold">{title}</p>
                <p className="mt-1.5 text-[15px] text-muted">{text}</p>
              </li>
            ))}
          </ul>
        </Container>
      </Section>

      {/* ── final CTA ── */}
      <Section>
        <Container className="flex flex-col items-center gap-5 rounded-3xl bg-deep px-6 py-14 text-center text-on-dark sm:px-10">
          <GraduationCap className="size-8 text-accent" aria-hidden />
          <h2 className="max-w-xl text-3xl font-bold sm:text-4xl">Pick a skill and see for yourself</h2>
          <p className="max-w-xl text-on-dark-muted">
            {workshops.length} workshops, open-entry, {formatINR(site.pricing.workshopPaise)} each. Or ask us
            anything first —{" "}
            <Link href="/contact" className="font-medium text-on-dark underline underline-offset-2">
              get in touch
            </Link>
            .
          </p>
          <ButtonLink href="/classes" variant="light" size="lg">
            Explore classes <ArrowRight className="size-4" aria-hidden />
          </ButtonLink>
        </Container>
      </Section>
    </>
  );
}
