import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
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
import { getFaqGroups, type FaqItem } from "@/content/faq";
import { classStructure, getCategory } from "@/content/workshops";
import { getWorkshop, listWorkshops } from "@/lib/data/workshops";
import { listPublicTestimonials } from "@/lib/data/feedback";
import { listUpcomingSessions } from "@/lib/data/sessions";
import { getSiteSettings } from "@/lib/data/site-settings";
import { formatDateLong, formatINR, formatTimeRange } from "@/lib/format";
import { site } from "@/lib/site";
import { CategoryIcon } from "@/components/brand";
import { ClassTimeline } from "@/components/class-timeline";
import { FaqList } from "@/components/faq-list";
import { InterestForm } from "@/components/interest-form";
import { SeatsLeft } from "@/components/session-list";
import { ButtonLink, Card, Container, Stars, buttonClass, cn } from "@/components/ui";
import { WorkshopCard, WorkshopStatusBadge } from "@/components/workshop-card";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const workshop = await getWorkshop(slug);
  if (!workshop) return { title: "Class not found" };
  return { title: workshop.title, description: workshop.promise };
}

export default async function WorkshopPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const workshop = await getWorkshop(slug);
  if (!workshop) notFound();

  const category = getCategory(workshop.category);
  const simple = workshop.learn.length === 0 && workshop.forWho.length === 0;

  const [allUpcoming, testimonials, allWorkshops, settings, faqGroups] = await Promise.all([
    listUpcomingSessions(),
    listPublicTestimonials({ workshopSlug: slug, limit: 6 }),
    listWorkshops(),
    getSiteSettings(),
    getFaqGroups(),
  ]);
  const sessionsForWorkshop = allUpcoming.filter((s) => s.workshopSlug === slug);

  // A short, generically-relevant selection — every class page shows the same
  // core questions about how classes work and how booking/payment works.
  const detailFaq: FaqItem[] = [
    faqGroups[0].items[0], // What happens in a class?
    faqGroups[0].items[1], // Do I have to take classes in order?
    faqGroups[1].items[3], // returning-student discount
    faqGroups[1].items[4], // cancel or reschedule
  ];

  const nextByWorkshop = new Map<string, string>();
  for (const s of allUpcoming) {
    if (!nextByWorkshop.has(s.workshopSlug) && s.seatsLeft > 0) nextByWorkshop.set(s.workshopSlug, s.startsAt);
  }

  const relatedPool = allWorkshops.filter((w) => w.slug !== slug && w.status === "live");
  const related = [
    ...relatedPool.filter((w) => w.category === workshop.category),
    ...relatedPool.filter((w) => w.category !== workshop.category),
  ].slice(0, 3);

  const showBooking = workshop.status === "live" && sessionsForWorkshop.length > 0;
  const interestMode = workshop.status === "future" ? "vote" : "notify";

  const facts: { icon: typeof Clock; label: string }[] = [
    { icon: CircleDollarSign, label: formatINR(settings.workshopPricePaise) },
    { icon: Clock, label: `${workshop.durationMin} minutes` },
    { icon: GraduationCap, label: workshop.level },
    { icon: Video, label: "Live online · small group" },
  ];
  if (workshop.level === "Beginner") facts.push({ icon: Sparkles, label: "Open entry — no prerequisites" });

  const bookingBox = (
    <Card className="p-6 sm:p-7">
      <p className="font-mono text-xs uppercase tracking-[0.14em] text-muted">Class price</p>
      <p className="mt-1 font-display text-3xl font-bold text-ink">{formatINR(settings.workshopPricePaise)}</p>
      <p className="mt-1 text-sm text-muted">
        {workshop.durationMin} minutes · live online · max {site.defaultCapacity} students
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
                    <Link href={`/book/${s.id}`} className={cn(buttonClass("primary", "md"), "mt-3 w-full")}>
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
        Attended our previous class? Use the same email at checkout and {settings.returningDiscountPercent}% comes
        off automatically.
      </p>
    </Card>
  );

  return (
    <Container className="py-10 sm:py-14">
      <Link href="/classes" className="inline-flex items-center gap-2 text-sm font-medium text-muted hover:text-ink">
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
          <div key={f.label} className="flex items-center gap-2 text-sm font-medium text-ink-soft">
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
                Every {site.name} workshop follows the same structure — less talking, more doing.
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
          <Link href="/faq" className="text-sm font-semibold text-accent-strong underline underline-offset-2">
            All questions
          </Link>
        </div>
        <FaqList items={detailFaq} />
      </section>

      {/* ── related ── */}
      {related.length > 0 && (
        <section className="mt-16">
          <h2 className="text-2xl font-bold text-ink">Related workshops</h2>
          <div className="mt-6 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {related.map((w) => (
              <WorkshopCard key={w.slug} workshop={w} workshopPricePaise={settings.workshopPricePaise} nextSessionAt={nextByWorkshop.get(w.slug)} />
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
