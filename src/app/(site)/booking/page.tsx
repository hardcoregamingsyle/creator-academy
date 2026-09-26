import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Mail, Search } from "lucide-react";
import { getRegistrationByCode } from "@/lib/data/registrations";
import { getTrainingBookingByCode } from "@/lib/data/training";
import { site } from "@/lib/site";
import { Button, Card, Container, Field, Input, Notice } from "@/components/ui";
import { ResendForm } from "./resend-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Find my booking", robots: { index: false } };

export default async function FindBookingPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const { code: raw } = await searchParams;
  let error: string | null = null;

  if (typeof raw === "string" && raw.trim()) {
    const code = raw.trim().toUpperCase();
    if (code.startsWith("CA-")) {
      const reg = await getRegistrationByCode(code);
      if (reg) redirect(`/booking/${reg.code}`);
      error = `We couldn't find a workshop booking with the ID "${code}". Double-check it against your confirmation email.`;
    } else if (code.startsWith("PT-")) {
      const booking = await getTrainingBookingByCode(code);
      if (booking) redirect(`/training/${booking.code}`);
      error = `We couldn't find a personal training booking with the ID "${code}". Double-check it against your confirmation email.`;
    } else {
      error = `That doesn't look like a booking ID. Workshop bookings start with "CA-", personal training bookings start with "PT-".`;
    }
  }

  return (
    <Container className="py-10 sm:py-14">
      <div className="mx-auto max-w-xl">
        <span className="flex size-12 items-center justify-center rounded-full bg-sunken text-ink">
          <Search className="size-5" aria-hidden />
        </span>
        <h1 className="mt-4 text-3xl font-bold sm:text-4xl">Find my booking</h1>
        <p className="mt-3 text-muted">
          Enter the booking ID from your confirmation email to see your ticket, joining details and calendar links.
        </p>

        <Card className="mt-8 p-6 sm:p-7">
          <form method="GET" action="/booking" className="space-y-5" noValidate>
            <Field
              label="Booking ID"
              htmlFor="code"
              hint='Workshop bookings start with "CA-", personal training bookings with "PT-" — look for it in your confirmation email.'
            >
              <Input
                id="code"
                name="code"
                defaultValue={raw ?? ""}
                placeholder="CA-7K3P-9QXM"
                autoCapitalize="characters"
                autoComplete="off"
                required
              />
            </Field>
            {error && <Notice tone="error">{error}</Notice>}
            <Button type="submit" size="lg" className="w-full">
              <Search className="size-4" aria-hidden /> Find my booking
            </Button>
          </form>
        </Card>

        <Card className="mt-4 p-6 sm:p-7">
          <h2 className="flex items-center gap-2 text-lg font-bold">
            <Mail className="size-5 text-muted" aria-hidden /> Lost your booking ID?
          </h2>
          <p className="mt-1 mb-5 text-sm text-muted">
            Enter the email you booked with and we&apos;ll email you the links to your bookings. For your privacy,
            bookings are only ever sent to that inbox — never shown here.
          </p>
          <ResendForm />
        </Card>

        <p className="mt-6 text-sm text-muted">
          <span>
            Still stuck? Check your spam folder, or email{" "}
            <a
              href={`mailto:${site.contactEmail}`}
              className="font-medium text-accent-strong underline underline-offset-2"
            >
              {site.contactEmail}
            </a>{" "}
            and we&apos;ll help you find it.
          </span>
        </p>
      </div>
    </Container>
  );
}
