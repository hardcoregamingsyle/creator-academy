import { useEffect, useRef, type ReactNode } from "react";
import { Button } from "@/components/ui";

/**
 * A small confirmation modal for irreversible customer actions (cancel and refund). The safe button ("Keep my
 * booking") has the focus, Escape and the backdrop close it, and nothing can be dismissed while a request is running.
 */
export function ConfirmDialog({
  title,
  children,
  confirmLabel,
  busy,
  onConfirm,
  onClose,
}: {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  busy: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const keepRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    keepRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-deep/60" onClick={busy ? undefined : onClose} aria-hidden />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        className="relative w-full max-w-md rounded-2xl border border-line bg-surface p-6 shadow-card"
      >
        <h3 id="confirm-dialog-title" className="font-display text-xl font-bold">
          {title}
        </h3>
        {children}
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button ref={keepRef} type="button" variant="outline" disabled={busy} onClick={onClose}>
            Keep my booking
          </Button>
          <Button type="button" variant="danger" disabled={busy} onClick={onConfirm}>
            {busy ? "Working…" : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
