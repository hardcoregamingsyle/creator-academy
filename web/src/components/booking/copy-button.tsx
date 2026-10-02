import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/components/ui";

/**
 * Small "copy to clipboard" button for booking IDs. Shared by the workshop
 * booking page and the personal-training booking page.
 */
export function CopyButton({
  value,
  label = "Copy",
  className,
}: {
  value: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard API unavailable (e.g. insecure context) — the ID is already visible on screen.
    }
  }

  return (
    <button
      type="button"
      onClick={onCopy}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border border-line-strong bg-surface px-2.5 py-1 text-xs font-semibold text-ink-soft transition-colors hover:border-ink hover:text-ink",
        className,
      )}
      aria-label={copied ? "Copied to clipboard" : `${label} ${value} to clipboard`}
    >
      {copied ? <Check className="size-3.5 text-success" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
      {copied ? "Copied" : label}
    </button>
  );
}
