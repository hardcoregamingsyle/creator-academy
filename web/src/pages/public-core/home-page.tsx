import { Link } from "react-router-dom";
import { ArrowRight, CalendarDays, MessageSquareQuote, UserRound } from "lucide-react";
import { categories } from "@shared/content";
import type { HomePageData } from "@shared/pages/public-core";
import { ApiErrorNotice } from "@/components/api-error-notice";
import { CategoryIcon } from "@/components/brand";
import { FaqList } from "@/components/faq-list";
import { NotFound } from "@/components/not-found";
import { PageSkeleton } from "@/components/page-skeleton";
import { SessionList } from "@/components/session-list";
import { ButtonLink, Container, EmptyState, Eyebrow, Section, SectionHeading, Stars } from "@/components/ui";
import { WorkshopCard } from "@/components/workshop-card";
import { useApi } from "@/lib/useApi";
import { usePageMeta } from "@/lib/usePageMeta";
import { FinalCta, Hero, HowItWorks, PersonalTrainingTeaser, Socials, ValueEquation, WhyUs } from "./home-sections";

export function Component() {
  usePageMeta();
  const { data, error, reload } = useApi<HomePageData>("/api/pages/home");
  if (error?.status === 404) return <NotFound />;
  if (error) return <ApiErrorNotice error={error} onRetry={reload} />;
  if (!data) return <PageSkeleton />;
  return <Home data={data} />;
}

function Home({ data }: { data: HomePageData }) {
  const { workshopPricePaise: workshopPaise } = data;
  const statsBySlug = new Map(data.categoryStats.map((s) => [s.slug, s]));

  return (
    <>
      <Hero next={data.nextSession} workshopPaise={workshopPaise} defaultCapacity={data.defaultCapacity} />
      <ValueEquation workshopPaise={workshopPaise} />

      {/* ── Explore by skill ── */}
      <Section id="explore">
        <Container>
          <SectionHeading
            eyebrow="Explore classes"
            title="Pick the skill you need"
            description="Every workshop stands on its own — no compulsory course sequence. Choose a category to see what's available."
            action={
              <ButtonLink href="/classes" variant="outline">
                Browse all {data.workshopCount} workshops <ArrowRight className="size-4" aria-hidden />
              </ButtonLink>
            }
          />
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {categories.map((c) => {
              const stats = statsBySlug.get(c.slug);
              const total = stats?.total ?? 0;
              const live = stats?.live ?? 0;
              return (
                <li key={c.slug}>
                  <Link
                    to={`/classes?category=${c.slug}`}
                    className="group flex h-full flex-col rounded-2xl border border-line bg-surface p-4 transition-colors hover:border-ink sm:p-5"
                  >
                    <span className="flex size-10 items-center justify-center rounded-xl bg-sunken text-ink transition-colors group-hover:bg-deep group-hover:text-on-dark">
                      <CategoryIcon category={c.slug} />
                    </span>
                    <span className="mt-4 font-display text-lg font-bold">{c.name}</span>
                    <span className="mt-1 hidden text-sm text-muted sm:block">{c.blurb}</span>
                    <span className="mt-3 text-xs font-semibold text-muted">
                      {live > 0 ? <span className="text-success">{live} open for booking</span> : `${total} coming soon`}
                    </span>
                  </Link>
                </li>
              );
            })}
            <li>
              <Link
                to="/personal-training"
                className="flex h-full flex-col justify-between rounded-2xl bg-deep p-4 text-on-dark transition-colors hover:bg-deep-soft sm:p-5"
              >
                <span className="flex size-10 items-center justify-center rounded-xl bg-dark-surface">
                  <UserRound className="size-5" aria-hidden />
                </span>
                <span>
                  <span className="mt-4 block font-display text-lg font-bold">Personal training</span>
                  <span className="mt-1 hidden text-sm text-on-dark-muted sm:block">1:1 help on anything above.</span>
                </span>
              </Link>
            </li>
          </ul>
        </Container>
      </Section>

      {/* ── Launch workshops ── */}
      <Section tone="surface">
        <Container>
          <SectionHeading
            eyebrow="Open for booking"
            title={
              <>
                Six workshops. Six things you&apos;ll <span className="marker">actually make.</span>
              </>
            }
            description="No vague “learn YouTube” classes. Each one answers a simple question: what will I be able to do after 90 minutes?"
          />
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {data.liveWorkshops.map((w) => (
              <WorkshopCard
                key={w.slug}
                workshop={w}
                workshopPricePaise={workshopPaise}
                nextSessionAt={Object.hasOwn(data.nextByWorkshop, w.slug) ? data.nextByWorkshop[w.slug] : undefined}
              />
            ))}
          </div>
        </Container>
      </Section>

      <HowItWorks />

      {/* ── Upcoming sessions ── */}
      <Section>
        <Container>
          <SectionHeading
            eyebrow="This month"
            title="Upcoming live classes"
            description="Classes run on weekends — usually Saturday evening and Sunday morning (IST). Pick a date that works for you."
            action={
              <ButtonLink href="/schedule" variant="outline">
                Full schedule <CalendarDays className="size-4" aria-hidden />
              </ButtonLink>
            }
          />
          {data.upcomingCount > 0 ? (
            <SessionList sessions={data.upcoming} />
          ) : (
            <EmptyState icon={<CalendarDays className="size-5" />} title="New dates are being scheduled">
              Check back soon, or browse the classes and ask to be notified.
            </EmptyState>
          )}
        </Container>
      </Section>

      <WhyUs workshopPaise={workshopPaise} returningDiscountPercent={data.returningDiscountPercent} defaultCapacity={data.defaultCapacity} />
      <PersonalTrainingTeaser durations={data.durations} />

      {/* ── Student feedback ── */}
      <Section>
        <Container>
          <SectionHeading
            eyebrow="Student feedback"
            title="What students say"
            description="Only real students, shared with their permission. We never write or edit reviews."
          />
          {data.testimonials.length ? (
            <ul className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              {data.testimonials.map((t) => (
                <li key={t.id} className="flex flex-col rounded-2xl border border-line bg-surface p-6 shadow-card">
                  <Stars rating={t.rating} />
                  <blockquote className="mt-4 flex-1 text-[15px] leading-relaxed text-ink-soft">“{t.quote}”</blockquote>
                  <p className="mt-5 text-sm font-semibold text-ink">
                    {t.name}
                    {t.workshopTitle && <span className="font-normal text-muted"> · {t.workshopTitle}</span>}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              icon={<MessageSquareQuote className="size-5" />}
              title="Our first students' reviews will appear here"
              action={
                <ButtonLink href="/feedback" variant="outline" size="sm">
                  Attended a class? Leave feedback
                </ButtonLink>
              }
            >
              We&apos;re a new academy, and we won&apos;t fake reviews. After every class students rate it and tell us
              what to improve — with their permission, their words will be shown here.
            </EmptyState>
          )}
        </Container>
      </Section>

      {/* ── FAQ ── */}
      <Section tone="surface">
        <Container className="grid gap-10 lg:grid-cols-[1fr_1.6fr]">
          <div>
            <Eyebrow>FAQ</Eyebrow>
            <h2 className="mt-3 text-3xl font-bold sm:text-4xl">Questions, answered</h2>
            <p className="mt-4 text-muted">
              Can&apos;t find what you&apos;re looking for?{" "}
              <Link to="/contact" className="font-semibold text-accent-strong underline underline-offset-2">
                Get in touch
              </Link>
              .
            </p>
            <ButtonLink href="/faq" variant="outline" className="mt-6">
              All questions <ArrowRight className="size-4" aria-hidden />
            </ButtonLink>
          </div>
          <FaqList items={data.faq} />
        </Container>
      </Section>

      <Socials socials={data.socials} />
      <FinalCta workshopPaise={workshopPaise} />
    </>
  );
}
