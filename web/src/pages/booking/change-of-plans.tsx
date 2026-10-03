import { useRef, useState, type ReactNode } from "react";
import { CalendarClock, Mail, Undo2 } from "lucide-react";
import { formatDateLong, formatINR, formatTimeRange, plural } from "@shared/format";
import type {
  BookingChangeOptions,
  BookingView,
  MoveBookingResponse,
  RefundBookingResponse,
} from "@shared/pages/booking";
import { api, errorMessage } from "@/lib/api";
import { ConfirmDialog } from "@/components/booking/confirm-dialog";
import { Button, ButtonLink, Card, Notice, cn } from "@/components/ui";

/** What the page shows after a successful change (the page reloads its data, then shows this above the booking). */
export type ChangeFlash = { kind: "refunded" | "moved"; message: string; code: string };

const DAY_MS = 24 * 3_600_000;

export function mailtoSubject(contactEmail: string, code: string, topic = "refund or change request"): string {
  return `mailto:${contactEmail}?subject=${encodeURIComponent(`Booking ${code}: ${topic}`)}`;
}

/**
 * "Change of plans?" on a paid booking: cancel for a refund and/or move to another date, as far as the published
 * policy allows (24h or more before the class, or any time if we cancelled it); otherwise it explains the policy.
 */
export function ChangeOfPlans({
  reg,
  options,
  contactEmail,
  onChanged,
}: {
  reg: BookingView;
  options: BookingChangeOptions;
  contactEmail: string;
  onChanged: (flash: ChangeFlash) => void;
}) {
  const [panel, setPanel] = useState<"none" | "move">("none");
  const [step, setStep] = useState<"pick" | "confirm">("pick");
  const [selected, setSelected] = useState("");
  const [refundOpen, setRefundOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false); // blocks a second click before React has re-rendered the disabled button

  const code = encodeURIComponent(reg.code);
  const { canRefund, canMove, alternatives } = options;
  const target = alternatives.find((s) => s.id === selected);
  const free = options.refundAmountPaise <= 0;
  // "Refunded to your original payment method in …" is the sentence for a real card/UPI refund; other notes stand alone.
  const viaApi = options.refundMethodNote.startsWith("Refunded");

  async function run<T extends { ok: boolean }>(call: () => Promise<T>, done: (res: T) => void) {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setError(null);
    try {
      done(await call());
    } catch (err) {
      setError(errorMessage(err));
      setRefundOpen(false);
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  const doRefund = () =>
    run(
      () => api.post<RefundBookingResponse>(`/api/booking/${code}/refund`),
      (res) => {
        if (!res.ok) throw new Error(res.message);
        setRefundOpen(false);
        onChanged({ kind: "refunded", message: res.message, code: reg.code });
      },
    );

  const doMove = () =>
    run(
      () => api.post<MoveBookingResponse>(`/api/booking/${code}/move`, { sessionId: selected }),
      (res) => {
        if (!res.ok) throw new Error(res.message);
        setPanel("none");
        setStep("pick");
        setSelected("");
        onChanged({ kind: "moved", message: res.message, code: reg.code });
      },
    );

  return (
    <Card className="mt-10 p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-sunken text-ink-soft">
          <CalendarClock className="size-5" aria-hidden />
        </span>
        <div>
          <h2 id="change-of-plans-title" className="font-display text-lg font-bold">
            Change of plans?
          </h2>
          <p className="mt-1 text-sm text-ink-soft">{options.reason}</p>
        </div>
      </div>

      {error && (
        <Notice tone="error" className="mt-4">
          {error}
        </Notice>
      )}

      {!canRefund && !canMove && (
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <ButtonLink href={mailtoSubject(contactEmail, reg.code)} variant="outline">
            <Mail className="size-4" aria-hidden /> Email us
          </ButtonLink>
          <span className="text-sm text-muted">Quote your registration ID {reg.code}.</span>
        </div>
      )}

      {(canRefund || canMove) && (
        <div className={cn("mt-5 grid gap-4", canRefund && canMove && "sm:grid-cols-2")}>
          {canMove && (
            <OptionBox
              icon={<CalendarClock className="size-4" aria-hidden />}
              title="Move to another date"
              body={`Free, and you keep the same registration ID. ${plural(options.movesLeft, "move")} left on this booking.`}
            >
              <Button
                type="button"
                variant={panel === "move" ? "ghost" : "primary"}
                size="sm"
                disabled={pending}
                onClick={() => {
                  setPanel(panel === "move" ? "none" : "move");
                  setStep("pick");
                  setError(null);
                }}
              >
                {panel === "move" ? "Close" : "Choose a new date"}
              </Button>
            </OptionBox>
          )}
          {canRefund && (
            <OptionBox
              icon={<Undo2 className="size-4" aria-hidden />}
              title={free ? "Cancel this booking" : "Cancel and get a refund"}
              body={
                free || !viaApi
                  ? options.refundMethodNote
                  : `${formatINR(options.refundAmountPaise)} ${options.refundMethodNote.replace(/^Refunded/, "refunded")}`
              }
            >
              <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => setRefundOpen(true)}>
                {free ? "Cancel booking" : "Cancel and refund"}
              </Button>
            </OptionBox>
          )}
        </div>
      )}

      {canMove && panel === "move" && (
        <div className="mt-5 rounded-xl border border-line bg-sunken/50 p-4">
          {alternatives.length === 0 ? (
            <p className="text-sm text-ink-soft">
              No other dates for this workshop have a free seat right now. Check the{" "}
              <a href="/schedule" className="font-semibold underline underline-offset-2">
                schedule
              </a>{" "}
              again later, or cancel for a refund instead.
            </p>
          ) : step === "pick" ? (
            <fieldset disabled={pending}>
              <legend className="text-sm font-semibold text-ink">Pick your new date</legend>
              <div className="mt-3 space-y-2">
                {alternatives.map((s) => (
                  <label
                    key={s.id}
                    className={cn(
                      "flex cursor-pointer items-center gap-3 rounded-xl border bg-surface px-4 py-3 text-sm transition-colors",
                      selected === s.id ? "border-ink ring-2 ring-ink/10" : "border-line hover:border-line-strong",
                    )}
                  >
                    <input
                      type="radio"
                      name="new-session"
                      value={s.id}
                      checked={selected === s.id}
                      onChange={() => setSelected(s.id)}
                      className="size-4 accent-[var(--color-accent-strong)]"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold text-ink">{formatDateLong(s.startsAt)}</span>
                      <span className="block text-muted">{formatTimeRange(s.startsAt, s.durationMin)}</span>
                    </span>
                    <span className="shrink-0 text-xs font-medium text-muted">
                      {plural(s.seatsLeft, "seat")} left
                    </span>
                  </label>
                ))}
              </div>
              <Button type="button" className="mt-4" size="sm" disabled={!selected} onClick={() => setStep("confirm")}>
                Continue
              </Button>
            </fieldset>
          ) : (
            target && (
              <div>
                <p className="text-sm font-semibold text-ink">Move your booking to this date?</p>
                <p className="mt-2 text-[15px] text-ink-soft">
                  <span className="font-semibold text-ink">{formatDateLong(target.startsAt)}</span>,{" "}
                  {formatTimeRange(target.startsAt, target.durationMin)}
                </p>
                <p className="mt-1 text-sm text-muted">
                  Nothing more to pay. Your registration ID {reg.code} and your join link stay the same, and we will email you the new details.
                </p>
                {new Date(target.startsAt).getTime() - Date.now() < DAY_MS && (
                  <Notice tone="warning" className="mt-3">
                    That class starts in less than 24 hours, so once you move you will not be able to cancel or move this booking online again.
                  </Notice>
                )}
                <div className="mt-4 flex flex-wrap gap-3">
                  <Button type="button" size="sm" disabled={pending} onClick={doMove}>
                    {pending ? "Moving…" : "Yes, move my booking"}
                  </Button>
                  <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => setStep("pick")}>
                    Back
                  </Button>
                </div>
              </div>
            )
          )}
        </div>
      )}

      {(canRefund || canMove) && !options.cancelledByUs && options.deadlineAt && (
        <p className="mt-5 text-xs text-muted">
          After that deadline (24 hours before the class), cancelling and moving online close; email us and we will do our best to help.
        </p>
      )}

      {refundOpen && (
        <ConfirmDialog
          title={free ? "Cancel this booking?" : `Cancel and get ${formatINR(options.refundAmountPaise)} back?`}
          busy={pending}
          confirmLabel={free ? "Yes, cancel my booking" : `Yes, cancel and refund ${formatINR(options.refundAmountPaise)}`}
          onConfirm={doRefund}
          onClose={() => setRefundOpen(false)}
        >
          <ul className="mt-3 space-y-2 text-sm text-ink-soft">
            {viaApi && !free ? (
              <li>
                <span className="font-semibold text-ink">{formatINR(options.refundAmountPaise)}</span>{" "}
                {options.refundMethodNote.replace(/^Refunded/, "goes back")}
              </li>
            ) : (
              <li>{options.refundMethodNote}</li>
            )}
            <li>Your seat is released straight away, so it can go to someone else.</li>
            <li className="font-semibold text-ink">This can&apos;t be undone.</li>
          </ul>
        </ConfirmDialog>
      )}
    </Card>
  );
}

function OptionBox({ icon, title, body, children }: { icon: ReactNode; title: string; body: string; children: ReactNode }) {
  return (
    <div className="flex flex-col rounded-xl border border-line p-4">
      <p className="flex items-center gap-2 font-semibold text-ink">
        <span className="text-muted">{icon}</span> {title}
      </p>
      <p className="mt-1.5 flex-1 text-sm text-ink-soft">{body}</p>
      <div className="mt-4">{children}</div>
    </div>
  );
}
