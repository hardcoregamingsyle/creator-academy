"use client";

import { useState } from "react";
import { ArrowRight, Star } from "lucide-react";
import { Button, ButtonLink, Field, Input, Notice, Select, Textarea, cn } from "@/components/ui";

type AttendAgain = "yes" | "maybe" | "no";

export function FeedbackForm({
  initialCode,
  lockedWorkshop,
  liveWorkshops,
  returningDiscountPercent,
}: {
  initialCode: string;
  lockedWorkshop: { slug: string; title: string } | null;
  liveWorkshops: { slug: string; title: string }[];
  returningDiscountPercent: number;
}) {
  const [code, setCode] = useState(initialCode);
  const [workshopSlug, setWorkshopSlug] = useState("");
  const [rating, setRating] = useState(0);
  const [learned, setLearned] = useState("");
  const [unclear, setUnclear] = useState("");
  const [improve, setImprove] = useState("");
  const [teachNext, setTeachNext] = useState("");
  const [attendAgain, setAttendAgain] = useState<AttendAgain | "">("");
  const [publicComment, setPublicComment] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [consentPublic, setConsentPublic] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (rating < 1) return setError("Please choose a star rating.");

    setBusy(true);
    const res = await fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        registrationCode: lockedWorkshop ? initialCode : code,
        workshopSlug: lockedWorkshop ? lockedWorkshop.slug : workshopSlug,
        rating,
        learned,
        unclear,
        improve,
        teachNext,
        attendAgain: attendAgain || null,
        publicComment,
        displayName,
        consentPublic,
      }),
    })
      .then((r) => r.json())
      .catch(() => ({ ok: false, error: "Network error — please try again." }));
    setBusy(false);

    if (!res.ok) {
      setError(res.error ?? "Something went wrong. Please try again.");
      return;
    }
    setSubmitted(true);
  }

  if (submitted) {
    return (
      <Notice tone="success" title="Thanks for the feedback">
        <p>
          It goes straight to our team and shapes what we schedule next. As a thank-you for attending, book your next
          class before our next class starts and {returningDiscountPercent}% comes off automatically at
          checkout — just use the same email.
        </p>
        <ButtonLink href="/schedule" size="sm" className="mt-4">
          See the schedule <ArrowRight className="size-4" aria-hidden />
        </ButtonLink>
      </Notice>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6" noValidate>
      {!lockedWorkshop && (
        <>
          <Field label="Registration ID" htmlFor="fb-code" optional hint="From your confirmation email, e.g. CA-7K3P-9QXM.">
            <Input
              id="fb-code"
              name="code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="CA-XXXX-XXXX"
              disabled={busy}
              className="uppercase"
            />
          </Field>
          {liveWorkshops.length > 0 && (
            <Field label="Which workshop was this for?" htmlFor="fb-workshop" optional>
              <Select id="fb-workshop" name="workshopSlug" value={workshopSlug} onChange={(e) => setWorkshopSlug(e.target.value)} disabled={busy}>
                <option value="">Choose a workshop</option>
                {liveWorkshops.map((w) => (
                  <option key={w.slug} value={w.slug}>
                    {w.title}
                  </option>
                ))}
              </Select>
            </Field>
          )}
        </>
      )}

      <div>
        <span id="fb-rating-label" className="mb-1.5 block text-sm font-semibold text-ink">
          Overall rating
        </span>
        <StarRatingInput value={rating} onChange={setRating} disabled={busy} labelledBy="fb-rating-label" />
      </div>

      <Field label="What did you learn?" htmlFor="fb-learned" optional>
        <Textarea id="fb-learned" value={learned} onChange={(e) => setLearned(e.target.value)} rows={3} disabled={busy} />
      </Field>
      <Field label="What wasn't clear?" htmlFor="fb-unclear" optional>
        <Textarea id="fb-unclear" value={unclear} onChange={(e) => setUnclear(e.target.value)} rows={3} disabled={busy} />
      </Field>
      <Field label="What should we improve?" htmlFor="fb-improve" optional>
        <Textarea id="fb-improve" value={improve} onChange={(e) => setImprove(e.target.value)} rows={3} disabled={busy} />
      </Field>
      <Field label="What should we teach next?" htmlFor="fb-teach-next" optional>
        <Textarea id="fb-teach-next" value={teachNext} onChange={(e) => setTeachNext(e.target.value)} rows={3} disabled={busy} />
      </Field>

      <div>
        <span id="fb-attend-again-label" className="mb-1.5 block text-sm font-semibold text-ink">
          Would you attend another class?
        </span>
        <ChoiceGroup
          name="attendAgain"
          labelledBy="fb-attend-again-label"
          value={attendAgain}
          onChange={(v) => setAttendAgain(v as AttendAgain)}
          disabled={busy}
          options={[
            { value: "yes", label: "Yes" },
            { value: "maybe", label: "Maybe" },
            { value: "no", label: "No" },
          ]}
        />
      </div>

      <div className="rounded-xl border border-line bg-paper p-4 sm:p-5">
        <p className="font-display text-base font-bold text-ink">Optional: share this publicly</p>
        <p className="mt-1 text-sm text-muted">
          Nothing is shown on the site without your consent below, and our team reviews every comment before it goes
          live.
        </p>
        <div className="mt-4 space-y-4">
          <Field label="Anything you'd like to say publicly about the class?" htmlFor="fb-public-comment" optional>
            <Textarea
              id="fb-public-comment"
              value={publicComment}
              onChange={(e) => setPublicComment(e.target.value)}
              rows={3}
              disabled={busy}
            />
          </Field>
          <Field label="Name to show" htmlFor="fb-display-name" optional hint='e.g. "Aarav, Pune"'>
            <Input
              id="fb-display-name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Aarav, Pune"
              disabled={busy}
            />
          </Field>
          <label className="flex cursor-pointer items-start gap-3 text-sm text-ink-soft">
            <input
              type="checkbox"
              checked={consentPublic}
              onChange={(e) => setConsentPublic(e.target.checked)}
              className="mt-0.5 size-4 shrink-0 accent-[#6D28D9]"
              disabled={busy}
            />
            <span>
              You can show my comment and name on the website. Optional — I can leave this unchecked and my feedback
              stays private.
            </span>
          </label>
        </div>
      </div>

      {error && <Notice tone="error">{error}</Notice>}

      <Button type="submit" size="lg" className="w-full" disabled={busy}>
        {busy ? "Sending…" : "Submit feedback"}
        {!busy && <ArrowRight className="size-4" aria-hidden />}
      </Button>
    </form>
  );
}

// ───────────────────────── star rating ─────────────────────────

function StarRatingInput({
  value,
  onChange,
  disabled,
  labelledBy,
}: {
  value: number;
  onChange: (n: number) => void;
  disabled?: boolean;
  labelledBy?: string;
}) {
  const [hover, setHover] = useState(0);
  return (
    <div role="radiogroup" aria-labelledby={labelledBy} className="mt-1.5 flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((n) => {
        const id = `fb-rating-${n}`;
        const filled = (hover || value) >= n;
        return (
          <span key={n} className="contents" onMouseEnter={() => setHover(n)} onMouseLeave={() => setHover(0)}>
            <input
              id={id}
              type="radio"
              name="rating"
              value={n}
              checked={value === n}
              onChange={() => onChange(n)}
              className="peer sr-only"
              disabled={disabled}
            />
            <label
              htmlFor={id}
              className="cursor-pointer rounded-lg p-1 peer-focus-visible:ring-2 peer-focus-visible:ring-ink/40 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-paper"
            >
              <Star
                className={cn("size-8 transition-colors", filled ? "fill-accent text-accent" : "fill-transparent text-line-strong")}
                aria-hidden
              />
              <span className="sr-only">
                {n} star{n > 1 ? "s" : ""}
              </span>
            </label>
          </span>
        );
      })}
    </div>
  );
}

// ───────────────────────── pill choice group ─────────────────────────

function ChoiceGroup({
  name,
  options,
  value,
  onChange,
  disabled,
  labelledBy,
}: {
  name: string;
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  labelledBy?: string;
}) {
  return (
    <div role="radiogroup" aria-labelledby={labelledBy} className="mt-1.5 flex flex-wrap gap-2">
      {options.map((opt) => {
        const id = `${name}-${opt.value}`;
        const checked = value === opt.value;
        return (
          <span key={opt.value} className="contents">
            <input
              id={id}
              type="radio"
              name={name}
              value={opt.value}
              checked={checked}
              onChange={() => onChange(opt.value)}
              className="peer sr-only"
              disabled={disabled}
            />
            <label
              htmlFor={id}
              className={cn(
                "cursor-pointer rounded-full border px-4 py-2 text-sm font-medium transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-ink/40 peer-focus-visible:ring-offset-2",
                checked ? "border-deep bg-deep text-on-dark" : "border-line-strong bg-surface text-ink-soft hover:border-ink",
              )}
            >
              {opt.label}
            </label>
          </span>
        );
      })}
    </div>
  );
}
