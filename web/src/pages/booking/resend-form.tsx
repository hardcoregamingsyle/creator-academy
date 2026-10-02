import { useState, type FormEvent } from "react";
import { Send } from "lucide-react";
import { isEmail } from "@shared/validate";
import type { ResendRequest, ResendResponse } from "@shared/pages/booking";
import { api, errorMessage } from "@/lib/api";
import { Button, Field, Input, Notice } from "@/components/ui";

/** Emails a student the links to their bookings (never shows them on screen). */
export function ResendForm() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!isEmail(email)) return setError("Please enter a valid email address.");
    setState("sending");
    const request: ResendRequest = { email };
    try {
      const res = await api.post<ResendResponse>("/api/booking/resend", request);
      if (!res.ok) {
        setState("idle");
        return setError(res.error ?? "Something went wrong.");
      }
      setState("sent");
    } catch (err) {
      setState("idle");
      setError(errorMessage(err, "Something went wrong."));
    }
  }

  if (state === "sent") {
    return (
      <Notice tone="success" title="Check your inbox">
        If there are bookings for {email}, we&apos;ve just emailed you the links. It can take a minute — check your
        spam folder too.
      </Notice>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <Field label="Email you booked with" htmlFor="lookup-email">
        <Input
          id="lookup-email"
          type="email"
          autoComplete="email"
          inputMode="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          disabled={state === "sending"}
        />
      </Field>
      {error && <Notice tone="error">{error}</Notice>}
      <Button type="submit" variant="outline" className="w-full" disabled={state === "sending"}>
        <Send className="size-4" aria-hidden />
        {state === "sending" ? "Sending…" : "Email me my booking links"}
      </Button>
    </form>
  );
}
