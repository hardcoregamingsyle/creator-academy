import { Link } from "react-router-dom";
import { useMemo, useState, type ReactNode } from "react";
import { ArrowRight, CheckCircle2, Lock } from "lucide-react";
import { formatDateShort, formatINR, formatTime } from "@shared/format";
import { isEmail } from "@shared/validate";
import type {
  TrainingBookRequest,
  TrainingBookResponse,
  TrainingDurationOption,
  TrainingSlotOption,
  TrainingTopicOption,
} from "@shared/pages/training";
import { api, errorMessage } from "@/lib/api";
import { Price } from "@/components/price";
import { Button, Field, Input, Notice, Textarea, cn } from "@/components/ui";
import { DemoPaymentDialog, PaymentSpinner, paymentButtonLabel, usePayment } from "@/components/payment/use-payment";

/** Sentinel value for the "Something else" topic option. */
const OTHER = "__other__";

export function TrainingForm({
  slotsByDuration,
  demoMode,
  durations,
  topics,
}: {
  slotsByDuration: Record<number, TrainingSlotOption[]>;
  demoMode: boolean;
  durations: TrainingDurationOption[];
  topics: TrainingTopicOption[];
}) {
  const payment = usePayment();

  const [topic, setTopic] = useState("");
  const [customTopic, setCustomTopic] = useState("");
  const [duration, setDuration] = useState<number | null>(null);
  const [slotId, setSlotId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [goals, setGoals] = useState("");
  const [accept, setAccept] = useState(false);
  const [creating, setCreating] = useState(false);

  const busy = creating || payment.busy;

  const topicChosen = topic !== "";
  const effectiveTopic = topic === OTHER ? customTopic.trim() : topic;

  const slotsForDuration = duration ? (slotsByDuration[duration] ?? []) : [];
  const selectedDuration = durations.find((d) => d.minutes === duration) ?? null;
  const selectedSlot = slotsForDuration.find((s) => s.id === slotId) ?? null;
  const timeChosen = slotId !== null && selectedSlot !== null;

  // Group already-sorted slots by day, preserving chronological order.
  const groupedSlots = useMemo(() => {
    const groups: { label: string; slots: TrainingSlotOption[] }[] = [];
    for (const s of slotsForDuration) {
      const label = formatDateShort(s.startsAt);
      const last = groups[groups.length - 1];
      if (last && last.label === label) last.slots.push(s);
      else groups.push({ label, slots: [s] });
    }
    return groups;
  }, [slotsForDuration]);

  function chooseDuration(minutes: number) {
    setDuration(minutes);
    const stillAvailable = (slotsByDuration[minutes] ?? []).some((s) => s.id === slotId);
    if (!stillAvailable) setSlotId(null);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    payment.setError(null);

    if (!effectiveTopic) return payment.setError("Please choose or describe a topic.");
    if (!duration) return payment.setError("Please choose a session length.");
    if (!slotId) return payment.setError("Please choose a time.");
    if (name.trim().length < 2) return payment.setError("Please enter your name.");
    if (!isEmail(email)) return payment.setError("Please enter a valid email address — your joining details are sent there.");
    if (!accept) return payment.setError("Please accept the terms and refund policy to continue.");

    const request: TrainingBookRequest = {
      slotId,
      topic: effectiveTopic,
      durationMin: duration,
      name,
      email,
      phone,
      goals,
      acceptTerms: accept,
    };

    setCreating(true);
    let res: TrainingBookResponse;
    try {
      res = await api.post<TrainingBookResponse>("/api/book/training", request);
    } catch (err) {
      setCreating(false);
      payment.setError(errorMessage(err, "Something went wrong."));
      return;
    }
    setCreating(false);
    await payment.pay("training", res.code);
  }

  const idleLabel = selectedDuration ? `Continue to payment · ${formatINR(selectedDuration.paise)}` : "Continue to payment";

  return (
    <form onSubmit={onSubmit} className="space-y-10" noValidate>
      {/* Step 1 — topic */}
      <StepSection number={1} label="Topic" title="What do you want help with?">
        <div className="grid gap-2.5 sm:grid-cols-2">
          {topics.map((t) => (
            <RadioCard key={t.id} name="topic" checked={topic === t.label} onSelect={() => setTopic(t.label)} disabled={busy}>
              {t.label}
            </RadioCard>
          ))}
          <RadioCard name="topic" checked={topic === OTHER} onSelect={() => setTopic(OTHER)} disabled={busy}>
            Something else
          </RadioCard>
        </div>
        {topic === OTHER && (
          <div className="mt-3">
            <Input
              value={customTopic}
              onChange={(e) => setCustomTopic(e.target.value)}
              placeholder="Tell us what you want help with"
              maxLength={120}
              disabled={busy}
              aria-label="Describe what you want help with"
            />
          </div>
        )}
      </StepSection>

      {/* Step 2 — duration */}
      <StepSection number={2} label="Duration" title="How long do you need?" disabled={!topicChosen}>
        <div className="grid gap-3 sm:grid-cols-3">
          {durations.map((d) => (
            <RadioCard
              key={d.minutes}
              name="duration"
              checked={duration === d.minutes}
              onSelect={() => chooseDuration(d.minutes)}
              disabled={busy || !topicChosen}
            >
              <Price paise={d.paise} className="font-display text-xl font-bold text-ink" />
              <span className="mt-1 block text-sm font-semibold text-ink-soft">
                {d.label} · {d.minutes} min
              </span>
              <span className="mt-1 block text-xs text-muted">{d.blurb}</span>
            </RadioCard>
          ))}
        </div>
      </StepSection>

      {/* Step 3 — time */}
      <StepSection number={3} label="Time" title="Choose a time" disabled={!duration}>
        {duration && groupedSlots.length === 0 && (
          <Notice tone="warning">
            No open times for a {duration}-minute session right now. Try a different length above.
          </Notice>
        )}
        {duration && groupedSlots.length > 0 && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {groupedSlots.map((g) => (
              <div key={g.label} className="rounded-xl border border-line bg-surface p-3">
                <p className="mb-2 text-sm font-semibold text-ink">{g.label}</p>
                <div className="flex flex-wrap gap-2">
                  {g.slots.map((s) => (
                    <RadioChip key={s.id} name="slot" checked={slotId === s.id} onSelect={() => setSlotId(s.id)} disabled={busy}>
                      {formatTime(s.startsAt)}
                    </RadioChip>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </StepSection>

      {/* Step 4 — details + pay */}
      <StepSection number={4} label="Your details" title="Your details" disabled={!timeChosen}>
        <div className="space-y-5">
          <Field label="Full name" htmlFor="pt-name">
            <Input
              id="pt-name"
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              required
              disabled={busy || !timeChosen}
            />
          </Field>
          <Field label="Email" htmlFor="pt-email" hint="Your confirmation and joining link are sent here.">
            <Input
              id="pt-email"
              type="email"
              autoComplete="email"
              inputMode="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              disabled={busy || !timeChosen}
            />
          </Field>
          <Field label="Phone" htmlFor="pt-phone" optional hint="Only used if we need to reach you about this session.">
            <Input
              id="pt-phone"
              type="tel"
              autoComplete="tel"
              inputMode="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="98765 43210"
              disabled={busy || !timeChosen}
            />
          </Field>
          <Field
            label="What do you want help with?"
            htmlFor="pt-goals"
            optional
            hint="Any files, links or context we should know before the session."
          >
            <Textarea
              id="pt-goals"
              value={goals}
              onChange={(e) => setGoals(e.target.value)}
              placeholder="Tell us about your project or question…"
              maxLength={2000}
              disabled={busy || !timeChosen}
            />
          </Field>

          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-line bg-paper p-4 text-sm text-ink-soft">
            <input
              type="checkbox"
              checked={accept}
              onChange={(e) => setAccept(e.target.checked)}
              className="mt-0.5 size-4 shrink-0 accent-[#6D28D9]"
              disabled={busy || !timeChosen}
            />
            <span>
              I agree to the{" "}
              <Link to="/policies/terms" target="_blank" className="font-medium text-accent-strong underline underline-offset-2">
                terms
              </Link>{" "}
              and{" "}
              <Link to="/policies/refunds" target="_blank" className="font-medium text-accent-strong underline underline-offset-2">
                cancellation &amp; refund policy
              </Link>
              . If I&apos;m under 18, a parent or guardian has approved this booking.
            </span>
          </label>

          {selectedDuration && (
            <div className="rounded-xl border border-line p-4 text-[15px]">
              <div className="flex justify-between gap-4 text-ink-soft">
                <span>
                  {selectedDuration.label} · {selectedDuration.minutes} min
                  {selectedSlot ? ` · ${formatDateShort(selectedSlot.startsAt)}, ${formatTime(selectedSlot.startsAt)}` : ""}
                </span>
                <Price paise={selectedDuration.paise} className="shrink-0" />
              </div>
              <div className="mt-3 flex justify-between border-t border-line pt-3 font-semibold text-ink">
                <span>Total</span>
                <span className="font-display text-lg">{formatINR(selectedDuration.paise)}</span>
              </div>
            </div>
          )}

          {payment.error && <Notice tone="error">{payment.error}</Notice>}

          <Button type="submit" size="lg" className="w-full" disabled={busy || !timeChosen}>
            {busy ? <PaymentSpinner /> : <Lock className="size-4" aria-hidden />}
            {creating ? "Reserving your session…" : paymentButtonLabel(payment.state, idleLabel)}
            {!busy && <ArrowRight className="size-4" aria-hidden />}
          </Button>

          {demoMode && (
            <Notice tone="warning" title="Demo mode">
              Payments aren&apos;t connected yet — the next step simulates a payment so you can test the booking
              flow. No money is charged.
            </Notice>
          )}
        </div>
      </StepSection>

      <DemoPaymentDialog payment={payment} />
    </form>
  );
}

// ───────────────────────── small building blocks ─────────────────────────

function StepSection({
  number,
  label,
  title,
  disabled,
  children,
}: {
  number: number;
  label: string;
  title: string;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={cn("transition-opacity", disabled && "pointer-events-none opacity-40")} aria-disabled={disabled}>
      <p className="font-mono text-xs font-semibold uppercase tracking-[0.14em] text-muted">
        Step {number} · {label}
      </p>
      <p className="mt-1 mb-4 text-lg font-bold text-ink">{title}</p>
      {children}
    </div>
  );
}

function RadioCard({
  name,
  checked,
  onSelect,
  disabled,
  children,
}: {
  name: string;
  checked: boolean;
  onSelect: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <label
      className={cn(
        "relative block rounded-xl border p-3.5 pr-10 text-sm font-medium transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent-strong",
        disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer",
        checked
          ? "border-accent-strong bg-accent-soft ring-1 ring-accent-strong"
          : "border-line bg-surface hover:border-line-strong",
      )}
    >
      <input
        type="radio"
        name={name}
        checked={checked}
        onChange={onSelect}
        disabled={disabled}
        className="sr-only"
      />
      <div className="text-ink">{children}</div>
      {checked && (
        <CheckCircle2 className="absolute right-3.5 top-3.5 size-5 fill-accent-strong text-white" aria-hidden />
      )}
    </label>
  );
}

function RadioChip({
  name,
  checked,
  onSelect,
  disabled,
  children,
}: {
  name: string;
  checked: boolean;
  onSelect: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <label
      className={cn(
        "rounded-full border px-4 py-2 text-sm font-semibold transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent-strong",
        disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer",
        checked ? "border-accent-strong bg-accent-strong text-white" : "border-line-strong bg-surface text-ink-soft hover:border-ink",
      )}
    >
      <input
        type="radio"
        name={name}
        checked={checked}
        onChange={onSelect}
        disabled={disabled}
        className="sr-only"
      />
      {children}
    </label>
  );
}
