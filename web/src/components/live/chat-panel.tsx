import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { Send } from "lucide-react";
import { LIVE_LIMITS, type ChatMessage } from "@shared/live";
import { cn } from "@/components/ui";

const timeOf = (at: number) => new Date(at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

/**
 * One chat thread: the message log (announced politely to screen readers) and a
 * composer. Enter sends, Shift+Enter adds a line. The parent decides which
 * messages belong to the thread and where `onSend` goes.
 */
export function ChatPanel({
  messages,
  selfPid,
  senderLabel,
  onSend,
  disabled,
  disabledReason,
  placeholder = "Write a message…",
  emptyText,
  notice,
  logLabel = "Chat messages",
}: {
  messages: ChatMessage[];
  /** Messages from this pid are drawn on the right as "mine". */
  selfPid: string;
  /** Small caption above a message (return null for none). */
  senderLabel: (m: ChatMessage) => string | null;
  /** Return false when the message could not be sent (offline); the draft is kept. */
  onSend: (text: string) => boolean;
  disabled?: boolean;
  disabledReason?: string;
  placeholder?: string;
  emptyText: string;
  notice?: ReactNode;
  logLabel?: string;
}) {
  const [text, setText] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const inputId = useId();
  const last = messages[messages.length - 1];

  // Keep the newest message in view unless the reader has scrolled up to read older ones.
  useEffect(() => {
    const el = logRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 140;
    if (nearBottom || last?.from === selfPid) el.scrollTop = el.scrollHeight;
    // Only a new last message should scroll.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [last?.id]);

  function submit(e?: FormEvent) {
    e?.preventDefault();
    if (disabled || !text.trim()) return;
    if (onSend(text)) {
      setText("");
      setProblem(null);
    } else {
      setProblem("Not connected right now, so your message wasn't sent. It will work again once you're back online.");
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {notice && <div className="border-b border-line bg-sunken/60 px-3 py-2 text-xs text-muted">{notice}</div>}

      <div
        ref={logRef}
        role="log"
        aria-live="polite"
        aria-relevant="additions"
        aria-label={logLabel}
        tabIndex={0}
        className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3"
      >
        {messages.length === 0 && <p className="py-8 text-center text-sm text-muted">{emptyText}</p>}
        {messages.map((m) => {
          const mine = m.from === selfPid;
          const label = senderLabel(m);
          return (
            <div key={m.id} className={cn("flex flex-col", mine ? "items-end" : "items-start")}>
              {label && <span className="mb-0.5 px-1 text-[11px] font-semibold text-muted">{label}</span>}
              <p
                className={cn(
                  "max-w-[88%] whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-sm",
                  mine ? "border border-accent/30 bg-accent-soft text-ink" : "bg-sunken text-ink",
                )}
              >
                {m.text}
              </p>
              <time dateTime={new Date(m.at).toISOString()} className="px-1 pt-0.5 text-[10px] text-subtle">
                {timeOf(m.at)}
              </time>
            </div>
          );
        })}
      </div>

      <form onSubmit={submit} className="border-t border-line p-3">
        {problem && (
          <p role="alert" className="mb-2 text-xs text-danger">
            {problem}
          </p>
        )}
        <label htmlFor={inputId} className="sr-only">
          Message
        </label>
        <div className="flex items-end gap-2">
          <textarea
            id={inputId}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKeyDown}
            rows={2}
            maxLength={LIVE_LIMITS.chatMaxChars}
            disabled={disabled}
            placeholder={disabled && disabledReason ? disabledReason : placeholder}
            className="block max-h-32 min-h-11 w-full resize-none rounded-xl border border-line-strong bg-surface px-3 py-2 text-sm text-ink placeholder:text-subtle focus:border-ink focus:outline-none focus:ring-2 focus:ring-ink/10 disabled:bg-sunken"
          />
          <button
            type="submit"
            disabled={disabled || !text.trim()}
            aria-label="Send message"
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-accent-strong text-paper hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Send className="size-4" aria-hidden />
          </button>
        </div>
        <p className="mt-1 flex justify-between text-[11px] text-subtle">
          <span>Enter to send · Shift+Enter for a new line</span>
          {text.length > LIVE_LIMITS.chatMaxChars * 0.8 && (
            <span className={text.length >= LIVE_LIMITS.chatMaxChars ? "text-danger" : undefined}>
              {text.length}/{LIVE_LIMITS.chatMaxChars}
            </span>
          )}
        </p>
      </form>
    </div>
  );
}
