import { useState } from "react";
import { BellRing, Vote } from "lucide-react";
import { isEmail } from "@shared/validate";
import { api, errorMessage } from "@/lib/api";
import { Button, Field, Input, Notice, Textarea, cn } from "@/components/ui";

/**
 * "Notify me" / "Vote for this workshop" capture form, used on class pages
 * that don't have bookable sessions yet. Posts to /api/interest.
 */
export function InterestForm({
  workshopSlug,
  workshopTitle,
  mode,
  className,
}: {
  workshopSlug: string;
  workshopTitle: string;
  mode: "notify" | "vote";
  className?: string;
}) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ alreadyRegistered: boolean } | null>(null);

  const uid = workshopSlug.replace(/[^a-z0-9]/g, "-");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!isEmail(email)) {
      setError("Please enter a valid email address.");
      return;
    }

    setBusy(true);
    try {
      const res = await api.post<{ ok: boolean; alreadyRegistered?: boolean; error?: string; message?: string }>("/api/interest", {
        workshopSlug,
        email,
        name,
        note,
      });
      if (!res.ok) {
        setError(res.error ?? res.message ?? "Something went wrong. Please try again.");
        return;
      }
      setResult({ alreadyRegistered: !!res.alreadyRegistered });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    const title = result.alreadyRegistered
      ? "You're already on the list"
      : mode === "vote"
        ? "Vote counted — thanks!"
        : "You're on the list";
    const body = result.alreadyRegistered
      ? `We already have your email for ${workshopTitle} — we'll be in touch.`
      : mode === "vote"
        ? "We schedule based on demand — the more votes a workshop gets, the sooner we bring it to the calendar."
        : "We'll email you as soon as a date opens for this class.";
    return (
      <Notice tone="success" title={title} className={className}>
        {body}
      </Notice>
    );
  }

  return (
    <form onSubmit={onSubmit} className={cn("space-y-4", className)} noValidate>
      <Field label="Email" htmlFor={`interest-email-${uid}`}>
        <Input
          id={`interest-email-${uid}`}
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          required
          disabled={busy}
        />
      </Field>
      <Field label="Name" htmlFor={`interest-name-${uid}`} optional>
        <Input
          id={`interest-name-${uid}`}
          name="name"
          autoComplete="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name"
          disabled={busy}
        />
      </Field>
      <Field label="Anything specific you want covered?" htmlFor={`interest-note-${uid}`} optional>
        <Textarea
          id={`interest-note-${uid}`}
          name="note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Optional — tell us what you'd like this class to include."
          disabled={busy}
        />
      </Field>

      {error && <Notice tone="error">{error}</Notice>}

      <Button type="submit" className="w-full" disabled={busy}>
        {mode === "vote" ? <Vote className="size-4" aria-hidden /> : <BellRing className="size-4" aria-hidden />}
        {busy ? "Sending…" : mode === "vote" ? "Vote for this workshop" : "Notify me"}
      </Button>
    </form>
  );
}
