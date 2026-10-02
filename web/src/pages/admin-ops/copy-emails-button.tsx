import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui";

/** Copies a comma-separated list of emails to the clipboard. */
export function CopyEmailsButton({ emails }: { emails: string[] }) {
  const [copied, setCopied] = useState(false);

  async function handleClick() {
    try {
      await navigator.clipboard.writeText(emails.join(", "));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API unavailable (e.g. insecure context) — nothing more we can do.
    }
  }

  return (
    <Button type="button" variant="outline" size="sm" onClick={handleClick} disabled={emails.length === 0}>
      {copied ? (
        <>
          <Check className="size-3.5" aria-hidden /> Copied
        </>
      ) : (
        <>
          <Copy className="size-3.5" aria-hidden /> Copy emails
        </>
      )}
    </Button>
  );
}
