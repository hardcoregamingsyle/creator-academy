import { useEffect, useState, type FormEvent } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { Mail, Search } from "lucide-react";
import type { BookingLookupResponse } from "@shared/pages/booking";
import { errorMessage } from "@/lib/api";
import { useSite } from "@/lib/site-context";
import { useApi } from "@/lib/useApi";
import { usePageMeta } from "@/lib/usePageMeta";
import { Button, Card, Container, Field, Input, Notice } from "@/components/ui";
import { ResendForm } from "./resend-form";

export function Component() {
  usePageMeta({ title: "Find my booking", noindex: true });
  const site = useSite();
  const [params, setParams] = useSearchParams();
  const raw = params.get("code") ?? "";
  const [value, setValue] = useState(raw);
  useEffect(() => setValue(raw), [raw]);

  const lookup = useApi<BookingLookupResponse>(raw.trim() ? `/api/pages/booking-lookup?code=${encodeURIComponent(raw.trim())}` : null);

  if (lookup.data?.redirect) return <Navigate to={lookup.data.redirect} replace />;
  const error = lookup.data?.error ?? (lookup.error ? errorMessage(lookup.error) : null);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (value === raw && raw.trim()) lookup.reload();
    else setParams(value ? { code: value } : {});
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
          <form onSubmit={onSubmit} className="space-y-5" noValidate>
            <Field
              label="Booking ID"
              htmlFor="code"
              hint='Workshop bookings start with "CA-", personal training bookings with "PT-" — look for it in your confirmation email.'
            >
              <Input
                id="code"
                name="code"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="CA-7K3P-9QXM"
                autoCapitalize="characters"
                autoComplete="off"
                required
              />
            </Field>
            {error && <Notice tone="error">{error}</Notice>}
            <Button type="submit" size="lg" className="w-full" disabled={lookup.loading}>
              <Search className="size-4" aria-hidden /> {lookup.loading ? "Searching…" : "Find my booking"}
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
            {site.contactEmail ? (
              <a
                href={`mailto:${site.contactEmail}`}
                className="font-medium text-accent-strong underline underline-offset-2"
              >
                {site.contactEmail}
              </a>
            ) : (
              "us"
            )}{" "}
            and we&apos;ll help you find it.
          </span>
        </p>
      </div>
    </Container>
  );
}
