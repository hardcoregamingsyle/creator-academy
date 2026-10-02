import type { ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  BadgePercent,
  Check,
  CircleDollarSign,
  Clock,
  GraduationCap,
  ListChecks,
  Package,
  Sparkles,
  Users2,
  Video,
} from "lucide-react";
import { brand } from "@shared/brand";
import { classStructure, getCategory } from "@shared/content";
import { formatDateLong, formatTimeRange } from "@shared/format";
import type { ClassDetailPageData } from "@shared/pages/catalogue";
import { ApiErrorNotice } from "@/components/api-error-notice";
import { CategoryIcon } from "@/components/brand";
import { ClassTimeline } from "@/components/class-timeline";
import { FaqList } from "@/components/faq-list";
import { InterestForm } from "@/components/interest-form";
import { NotFound } from "@/components/not-found";
import { PageSkeleton } from "@/components/page-skeleton";
import { Price } from "@/components/price";
import { SeatsLeft } from "@/components/session-list";
import { ButtonLink, Card, Container, Stars, buttonClass, cn } from "@/components/ui";
import { WorkshopCard, WorkshopStatusBadge } from "@/components/workshop-card";
import { useApi } from "@/lib/useApi";
import { usePageMeta } from "@/lib/usePageMeta";
import { nextSessionAt, toClassSession } from "./helpers";

export function Component() {
  const { slug } = useParams();
  const { data, error, reload } = useApi<ClassDetailPageData>(slug ? `/api/pages/classes/${encodeURIComponent(slug)}` : null);
  usePageMeta(error?.status === 404 ? { title: "Class not found" } : { title: data?.workshop.title, description: data?.workshop.promise });

  if (!slug || error?.status === 404) return <NotFound />;
  if (error) return <ApiErrorNotice error={error} onRetry={reload} />;
  if (!data) return <PageSkeleton />;

  return <WorkshopDetail data={data} />;
}

function WorkshopDetail({ data }: { data: ClassDetailPageData }) {
  const { workshop, testimonials, faq, related, nextByWorkshop, workshopPricePaise, returningDiscountPercent, defaultCapacity } = data;
  const sessionsForWorkshop = data.sessions.map((s) => toClassSession(s, workshop));

  const category = getCategory(workshop.category);
  const simple = workshop.learn.length === 0 && workshop.forWho.length === 0;

  const showBooking = workshop.status === "live" && sessionsForWorkshop.length > 0;
  const interestMode = workshop.status === "future" ? "vote" : "notify";

  const facts: { key: string; icon: typeof Clock; label: ReactNode }[] = [
    { key: "price", icon: CircleDollarSign, label: <Price paise={workshopPricePaise} /> },
    { key: "duration", icon: Clock, label: `${workshop.durationMin} minutes` },
    { key: "level", icon: GraduationCap, label: workshop.level },
    { key: "format", icon: Video, label: "Live online · small group" },
  ];
  if (workshop.level === "Beginner") facts.push({ key: "entry", icon: Sparkles, label: "Open entry — no prerequisites" });

  const bookingBox = (
    <Card className="p-6 sm:p-7">
      <p className="font-mono text-xs uppercase tracking-[0.14em] text-muted">Class price</p>
      <p className="mt-1 font-display text-3xl font-bold text-ink">
        <Price paise={workshopPricePaise} />
      </p>
      <p className="mt-1 text-sm text-muted">
        {workshop.durationMin} minutes · live online · max {defaultCapacity} students
      </p>

      <div className="mt-6 border-t border-line pt-6">
        {showBooking ? (
          <>
            <h2 className="text-base font-bold text-ink">Upcoming sessions</h2>
            <ul className="mt-3 space-y-3">
              {sessionsForWorkshop.map((s) => (
                <li key={s.id} className="rounded-xl border border-line bg-paper p-4">
                  <p className="font-semibold leading-snug text-ink">{formatDateLong(s.startsAt)}</p>
                  <p className="mt-0.5 text-sm text-ink-soft">{formatTimeRange(s.startsAt, s.durationMin)}</p>
                  <SeatsLeft session={s} className="mt-2" />
                  {s.seatsLeft > 0 ? (
                    <Link to={`/book/${s.id}`} className={cn(buttonClass("primary", "md"), "mt-3 w-full")}>
                      Book class <ArrowRight className="size-4" aria-hidden />
                    </Link>
                  ) : (
                    <span className={cn(buttonClass("outline", "md"), "mt-3 w-full pointer-events-none opacity-60")}>
                      Full
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </>
        ) : (
          <>
            <h2 className="text-base font-bold text-ink">
              {interestMode === "vote" ? "Vote for this workshop" : "Get notified when dates open"}
            </h2>
            <p className="mt-1 text-sm text-muted">
              {interestMode === "vote"
                ? "We schedule new workshops based on demand — tell us you want this one."
                : sessionsForWorkshop.length === 0 && workshop.status === "live"
                  ? "No sessions are scheduled right now. Leave your email and we'll let you know as soon as one opens."
                  : "This workshop's outline is ready but not yet scheduled. Leave your email and we'll let you know as soon as a date opens."}
            </p>
            <InterestForm className="mt-4" workshopSlug={workshop.slug} workshopTitle={workshop.title} mode={interestMode} />
          </>
        )}
      </div>

      <p className="mt-6 flex items-start gap-2 text-xs text-muted">
        <BadgePercent className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        Attended our previous class? Use the same email at checkout and {returningDiscountPercent}% comes
        off automatically.
      </p>
    </Card>
  );

  return (
    <Container className="py-10 sm:py-14">
      <Link to="/classes" className="inline-flex items-center gap-2 text-sm font-medium text-muted hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden /> Back to classes
      </Link>

      {/* ── hero ── */}
      <div className="mt-6 flex flex-wrap items-center gap-3">
        {category && (
          <span className="inline-flex items-center gap-2 text-sm font-medium text-muted">
            <span className="flex size-8 items-center justify-center rounded-lg bg-sunken text-ink">
              <CategoryIcon category={workshop.category} className="size-4" />
            </span>
            {category.name}
          </span>
        )}
        <WorkshopStatusBadge status={workshop.status} />
      </div>
      <h1 className="mt-4 text-3xl font-bold sm:text-4xl">{workshop.title}</h1>
      <p className="mt-4 max-w-2xl text-xl text-muted sm:text-2xl">{workshop.promise}</p>

      <dl className="mt-6 flex flex-wrap gap-x-6 gap-y-2.5">
        {facts.map((f) => (
          <div key={f.key} className="flex items-center gap-2 text-sm font-medium text-ink-soft">
            <f.icon className="size-4 shrink-0 text-muted" aria-hidden />
            <dd>{f.label}</dd>
          </div>
        ))}
      </dl>

      {/* ── main content ── */}
      {simple ? (
        <div className="mt-10 grid gap-8 lg:grid-cols-[1fr_380px] lg:items-start lg:gap-12">
          <div className="order-2 space-y-10 lg:order-1">
            <section>
              <h2 className="text-xl font-bold text-ink">What you&apos;ll create</h2>
              <div className="mt-4 rounded-2xl bg-accent-soft px-5 py-4">
                <p className="flex items-center gap-2 font-display text-lg font-bold text-accent-strong">
                  <Check className="size-5 shrink-0" aria-hidden strokeWidth={2.5} />
                  {workshop.outcome}
                </p>
                <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">{workshop.outcomeDetail}</p>
              </div>
            </section>
            <section>
              <h2 className="text-xl font-bold text-ink">On our roadmap</h2>
              <p className="mt-3 text-[15px] leading-relaxed text-muted">{workshop.summary}</p>
              <p className="mt-3 text-[15px] leading-relaxed text-muted">
                We build our schedule around what students ask for. Vote for this workshop and we&apos;ll factor it
                into what we teach next — once it&apos;s ready, it&apos;ll move to &ldquo;Coming soon&rdquo; and then
                open for booking.
              </p>
            </section>
          </div>
          <div className="order-1 lg:order-2 lg:sticky lg:top-24">{bookingBox}</div>
        </div>
      ) : (
        <div className="mt-10 grid gap-8 lg:grid-cols-[1fr_380px] lg:items-start lg:gap-12">
          <div className="order-2 space-y-10 lg:order-1">
            <p className="text-[17px] leading-relaxed text-ink-soft">{workshop.summary}</p>

            {workshop.learn.length > 0 && (
              <section>
                <h2 className="flex items-center gap-2 text-xl font-bold text-ink">
                  <ListChecks className="size-5 text-accent-strong" aria-hidden /> What you&apos;ll learn
                </h2>
                <ul className="mt-4 grid gap-x-6 gap-y-3 sm:grid-cols-2">
                  {workshop.learn.map((item) => (
                    <li key={item} className="flex items-start gap-2.5 text-[15px] text-ink-soft">
                      <Check className="mt-0.5 size-4 shrink-0 text-track-green" aria-hidden strokeWidth={2.5} />
                      {item}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section>
              <h2 className="text-xl font-bold text-ink">What you&apos;ll create</h2>
              <div className="mt-4 rounded-2xl bg-accent-soft px-5 py-4">
                <p className="flex items-center gap-2 font-display text-lg font-bold text-accent-strong">
                  <Check className="size-5 shrink-0" aria-hidden strokeWidth={2.5} />
                  {workshop.outcome}
                </p>
                <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">{workshop.outcomeDetail}</p>
              </div>
            </section>

            {workshop.forWho.length > 0 && (
              <section>
                <h2 className="flex items-center gap-2 text-xl font-bold text-ink">
                  <Users2 className="size-5 text-accent-strong" aria-hidden /> Who it&apos;s for
                </h2>
                <ul className="mt-4 space-y-2.5">
                  {workshop.forWho.map((item) => (
                    <li key={item} className="flex items-start gap-2.5 text-[15px] text-ink-soft">
                      <span className="mt-2 size-1.5 shrink-0 rounded-full bg-accent" aria-hidden />
                      {item}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {workshop.bring.length > 0 && (
              <section>
                <h2 className="flex items-center gap-2 text-xl font-bold text-ink">
                  <Package className="size-5 text-accent-strong" aria-hidden /> What to have ready
                </h2>
                <ul className="mt-4 space-y-2.5">
                  {workshop.bring.map((item) => (
                    <li key={item} className="flex items-start gap-2.5 text-[15px] text-ink-soft">
                      <span className="mt-2 size-1.5 shrink-0 rounded-full bg-accent" aria-hidden />
                      {item}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section>
              <h2 className="text-xl font-bold text-ink">Inside this class</h2>
              <p className="mt-1.5 text-[15px] text-muted">
                Every {brand.name} workshop follows the same structure — less talking, more doing.
              </p>
              <div className="mt-5 rounded-2xl border border-line bg-surface p-6">
                <ClassTimeline durationMin={workshop.durationMin} />
              </div>
              <p className="sr-only">
                {classStructure.map((c) => `${c.label}: ${c.share}% — ${c.description}`).join(" ")}
              </p>
            </section>
          </div>

          <div className="order-1 lg:order-2 lg:sticky lg:top-24">{bookingBox}</div>
        </div>
      )}

      {/* ── testimonials (only if real ones exist) ── */}
      {testimonials.length > 0 && (
        <section className="mt-16">
          <h2 className="text-2xl font-bold text-ink">What students say</h2>
          <ul className="mt-6 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {testimonials.map((t) => (
              <li key={t.id} className="flex flex-col rounded-2xl border border-line bg-surface p-6 shadow-card">
                <Stars rating={t.rating} />
                <blockquote className="mt-4 flex-1 text-[15px] leading-relaxed text-ink-soft">
                  &ldquo;{t.quote}&rdquo;
                </blockquote>
                <p className="mt-5 text-sm font-semibold text-ink">{t.name}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── faq ── */}
      <section className="mt-16">
        <div className="mb-5 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-2xl font-bold text-ink">Common questions</h2>
          <Link to="/faq" className="text-sm font-semibold text-accent-strong underline underline-offset-2">
            All questions
          </Link>
        </div>
        <FaqList items={faq} />
      </section>

      {/* ── related ── */}
      {related.length > 0 && (
        <section className="mt-16">
          <h2 className="text-2xl font-bold text-ink">Related workshops</h2>
          <div className="mt-6 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {related.map((w) => (
              <WorkshopCard key={w.slug} workshop={w} workshopPricePaise={workshopPricePaise} nextSessionAt={nextSessionAt(nextByWorkshop, w.slug)} />
            ))}
          </div>
        </section>
      )}

      <div className="mt-16 flex justify-center">
        <ButtonLink href="/classes" variant="outline">
          Browse all classes <ArrowRight className="size-4" aria-hidden />
        </ButtonLink>
      </div>
    </Container>
  );
}
