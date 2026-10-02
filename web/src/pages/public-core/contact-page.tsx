import { Link, useSearchParams } from "react-router-dom";
import { Clock, HelpCircle, Mail, Search } from "lucide-react";
import { Card, Container, Eyebrow } from "@/components/ui";
import { useSite } from "@/lib/site-context";
import { usePageMeta } from "@/lib/usePageMeta";
import { ContactForm } from "./contact-form";
import { CONTACT_TOPICS } from "./topics";

function slugifyTopic(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function Component() {
  const site = useSite();
  usePageMeta({
    title: "Contact",
    description: `Get in touch with ${site.name} about a workshop, personal training, payments or your booking.`,
  });

  const [searchParams] = useSearchParams();
  const topicParam = searchParams.get("topic");
  const initialTopic = CONTACT_TOPICS.find((t) => slugifyTopic(t) === topicParam?.toLowerCase().trim()) ?? null;

  return (
    <Container className="py-10 sm:py-14">
      <Eyebrow>Contact</Eyebrow>
      <h1 className="mt-3 text-3xl font-bold sm:text-4xl">Get in touch</h1>
      <p className="mt-4 max-w-xl text-lg text-muted">
        Questions about a workshop, personal training, payments or a booking you&apos;ve already made — we read
        every message ourselves.
      </p>

      <div className="mt-10 grid gap-8 lg:grid-cols-[1fr_420px] lg:gap-12">
        <div className="order-2 space-y-4 lg:order-1">
          <Card className="p-6">
            <span className="flex size-11 items-center justify-center rounded-xl bg-accent-soft text-accent-strong">
              <Mail className="size-5" aria-hidden />
            </span>
            <p className="mt-4 font-display text-lg font-bold">Email us directly</p>
            {site.contactEmail ? (
              <a href={`mailto:${site.contactEmail}`} className="mt-1 block text-[15px] font-medium text-accent-strong underline underline-offset-2">
                {site.contactEmail}
              </a>
            ) : (
              <span className="mt-2 block h-5 w-48 animate-pulse rounded-full bg-sunken" aria-hidden />
            )}
            <p className="mt-3 flex items-center gap-2 text-sm text-muted">
              <Clock className="size-4 shrink-0" aria-hidden />
              We usually reply {site.replyTime}.
            </p>
          </Card>

          <Card className="p-6">
            <span className="flex size-11 items-center justify-center rounded-xl bg-sunken text-ink">
              <Search className="size-5" aria-hidden />
            </span>
            <p className="mt-4 font-display text-lg font-bold">Already booked a class?</p>
            <p className="mt-1 text-[15px] text-muted">
              Look up your booking by its ID, or get your booking links emailed to you instantly.
            </p>
            <Link to="/booking" className="mt-4 inline-block text-[15px] font-semibold text-accent-strong underline underline-offset-2">
              Find my booking
            </Link>
          </Card>

          <Card className="p-6">
            <span className="flex size-11 items-center justify-center rounded-xl bg-sunken text-ink">
              <HelpCircle className="size-5" aria-hidden />
            </span>
            <p className="mt-4 font-display text-lg font-bold">Common questions</p>
            <p className="mt-1 text-[15px] text-muted">
              Booking, refunds, what to bring — most answers are already in our FAQ.
            </p>
            <Link to="/faq" className="mt-4 inline-block text-[15px] font-semibold text-accent-strong underline underline-offset-2">
              Read the FAQ
            </Link>
          </Card>
        </div>

        <div className="order-1 lg:order-2">
          <Card className="p-6 sm:p-7 lg:sticky lg:top-24">
            <h2 className="text-xl font-bold">Send us a message</h2>
            <p className="mt-1 mb-6 text-sm text-muted">Takes under a minute.</p>
            <ContactForm initialTopic={initialTopic} />
          </Card>
        </div>
      </div>
    </Container>
  );
}
