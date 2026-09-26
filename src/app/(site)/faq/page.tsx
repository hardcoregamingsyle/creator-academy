import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, MessageCircleQuestion } from "lucide-react";
import { faqGroups } from "@/content/faq";
import { site } from "@/lib/site";
import { ButtonLink, Container, Eyebrow } from "@/components/ui";
import { FaqList } from "@/components/faq-list";

export const metadata: Metadata = {
  title: "FAQ",
  description: `Answers to common questions about ${site.name} — classes, booking & payment, personal training and more.`,
};

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export default function FaqPage() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqGroups.flatMap((group) =>
      group.items.map((item) => ({
        "@type": "Question",
        name: item.q,
        acceptedAnswer: { "@type": "Answer", text: item.a },
      })),
    ),
  };

  return (
    <Container className="py-10 sm:py-14">
      <Eyebrow>FAQ</Eyebrow>
      <h1 className="mt-3 text-3xl font-bold sm:text-4xl">Frequently asked questions</h1>
      <p className="mt-4 max-w-2xl text-lg text-muted">
        Everything about classes, booking, payment and personal training. Can&apos;t find your answer?{" "}
        <Link href="/contact" className="font-semibold text-accent-strong underline underline-offset-2">
          Get in touch
        </Link>
        .
      </p>

      <nav aria-label="FAQ categories" className="mt-8 flex flex-wrap gap-2">
        {faqGroups.map((group) => (
          <a
            key={group.title}
            href={`#${slugify(group.title)}`}
            className="rounded-full border border-line-strong bg-surface px-4 py-2 text-sm font-medium text-ink-soft transition-colors hover:border-ink hover:text-ink"
          >
            {group.title}
          </a>
        ))}
      </nav>

      <div className="mt-10 space-y-12 sm:mt-12 sm:space-y-14">
        {faqGroups.map((group) => (
          <section key={group.title} id={slugify(group.title)}>
            <h2 className="text-xl font-bold sm:text-2xl">{group.title}</h2>
            <FaqList items={group.items} className="mt-4" />
          </section>
        ))}
      </div>

      <div className="mt-14 rounded-2xl border border-line bg-surface p-6 text-center shadow-card sm:p-8">
        <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-accent-soft text-accent-strong">
          <MessageCircleQuestion className="size-6" aria-hidden />
        </span>
        <h2 className="mt-4 font-display text-xl font-bold">Still have a question?</h2>
        <p className="mt-2 text-muted">
          Email {site.contactEmail} or use the contact form — we usually reply {site.replyTime}.
        </p>
        <ButtonLink href="/contact" className="mt-6">
          Contact us <ArrowRight className="size-4" aria-hidden />
        </ButtonLink>
      </div>

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
    </Container>
  );
}
