import { Link } from "react-router-dom";
import { ArrowDown, CalendarClock, Clock3, MousePointerClick, RefreshCw, Sparkles } from "lucide-react";
import { formatINR } from "@shared/format";
import type { PersonalTrainingPageData } from "@shared/pages/training";
import { useApi } from "@/lib/useApi";
import { usePageMeta } from "@/lib/usePageMeta";
import { ApiErrorNotice } from "@/components/api-error-notice";
import { FaqList } from "@/components/faq-list";
import { PageSkeleton } from "@/components/page-skeleton";
import { Price } from "@/components/price";
import { ButtonLink, Container, EmptyState, Eyebrow, Notice, Section, SectionHeading } from "@/components/ui";
import { TrainingForm } from "./training-form";

const howItWorks = [
  { icon: Sparkles, title: "Topic", body: "Tell us what you want help with." },
  { icon: Clock3, title: "Duration", body: "Pick a session length that fits." },
  { icon: CalendarClock, title: "Time", body: "Choose an open time that works for you." },
  { icon: MousePointerClick, title: "Book", body: "Pay securely and you're confirmed." },
];

export function Component() {
  usePageMeta({
    title: "Personal training",
    description: "1:1 help on your own project, at your own pace — book a private session with our instructors.",
  });
  const { data, error, reload } = useApi<PersonalTrainingPageData>("/api/pages/personal-training");

  if (error) return <ApiErrorNotice error={error} onRetry={reload} />;
  if (!data) return <PageSkeleton />;
  return <PersonalTraining data={data} />;
}

function PersonalTraining({ data }: { data: PersonalTrainingPageData }) {
  const { paymentMode: mode, durations, topics, slotsByDuration, workshopPaise, contactEmail, faq } = data;
  const anySlots = durations.some((d) => (slotsByDuration[d.minutes]?.length ?? 0) > 0);

  return (
    <>
      {/* Hero */}
      <div className="border-b border-line py-10 sm:py-14">
        <Container className="grid items-center gap-10 lg:grid-cols-[1.2fr_1fr]">
          <div className="max-w-2xl">
            <Eyebrow>Personal training</Eyebrow>
            <h1 className="mt-3 text-3xl font-bold sm:text-5xl">1:1 help on your own project</h1>
            <p className="mt-4 text-base text-muted sm:text-lg">
              Workshops teach one skill to a small group on a fixed topic. Personal training is different — it&apos;s
              a private session with one of our instructors, focused entirely on you: your video, thumbnail, script or
              channel, your questions, your pace.
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <ButtonLink href="#book" size="lg">
                Book a session <ArrowDown className="size-4" aria-hidden />
              </ButtonLink>
              <ButtonLink href="/classes" variant="outline" size="lg">
                Or join a {formatINR(workshopPaise)} group class
              </ButtonLink>
            </div>
          </div>
          <ul className="grid gap-3">
            {durations.map((d) => (
              <li key={d.minutes} className="flex items-center justify-between gap-4 rounded-2xl border border-line bg-surface p-5 shadow-card">
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
        </Container>
      </div>

      {/* How it works */}
      <Container className="py-10">
        <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {howItWorks.map((s, i) => (
            <li key={s.title} className="flex items-start gap-3 rounded-2xl border border-line bg-surface p-4">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-strong">
                <s.icon className="size-4" aria-hidden />
              </span>
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">Step {i + 1}</p>
                <p className="font-semibold text-ink">{s.title}</p>
                <p className="text-sm text-muted">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </Container>

      {/* Booking */}
      <Section tone="surface" id="book">
        <Container>
          <SectionHeading eyebrow="Book a session" title="Choose your topic, length and time" />
          {mode === "disabled" ? (
            <Notice tone="warning" title="Online booking is paused">
              We&apos;re finishing our payment setup. Please check back soon or{" "}
              <a href={`mailto:${contactEmail}`} className="font-semibold underline underline-offset-2">
                contact us
              </a>{" "}
              to arrange a session.
            </Notice>
          ) : anySlots ? (
            <TrainingForm slotsByDuration={slotsByDuration} demoMode={mode === "demo"} durations={durations} topics={topics} />
          ) : (
            <EmptyState
              icon={<CalendarClock className="size-5" aria-hidden />}
              title="No open times right now"
              action={
                <ButtonLink href="/contact?topic=personal-training" variant="outline">
                  Ask us for a time
                </ButtonLink>
              }
            >
              We&apos;re new, so times fill in as our instructors open them up. Tell us when you&apos;d like a
              session and we&apos;ll get back to you.
            </EmptyState>
          )}
        </Container>
      </Section>

      {/* FAQ */}
      {faq && (
        <Section>
          <Container>
            <SectionHeading eyebrow="FAQ" title="Personal training questions" />
            <div className="max-w-2xl">
              <FaqList items={faq} />
            </div>
          </Container>
        </Section>
      )}

      {/* Rescheduling note */}
      <Section tone="surface">
        <Container>
          <div className="mx-auto flex max-w-2xl flex-col items-center gap-3 rounded-2xl border border-line bg-surface p-6 text-center">
            <RefreshCw className="size-5 text-muted" aria-hidden />
            <p className="text-[15px] text-ink-soft">
              Need to reschedule? Let us know at least 24 hours before your session for a free move to another time.
              See our{" "}
              <Link to="/policies/refunds" className="font-medium text-accent-strong underline underline-offset-2">
                cancellation &amp; refund policy
              </Link>{" "}
              for details.
            </p>
          </div>
        </Container>
      </Section>
    </>
  );
}
