"use client";

import type { ReactNode } from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Button, Notice } from "@/components/ui";

/** Mirrors the (unexported) Variant/Size union in components/ui.tsx. */
type ButtonVariant = "primary" | "dark" | "outline" | "ghost" | "light" | "danger";
type ButtonSize = "sm" | "md" | "lg";

/**
 * Shared client helpers for admin server-action forms.
 *
 * `ActionForm` wraps a server action of shape
 *   (prevState: ActionResult | null, formData: FormData) => Promise<ActionResult>
 * in `useActionState` and shows a success/error Notice after it runs.
 *
 * `SubmitButton` / `ConfirmButton` are submit buttons that pick up the
 * pending state of their enclosing form via `useFormStatus`. `ConfirmButton`
 * additionally asks `window.confirm(message)` before the click is allowed to
 * submit — use it for destructive actions (refund, cancel, delete).
 *
 * Other admin pages import these three (and the `ActionResult` type) from
 * this file rather than re-implementing them.
 */

export type ActionResult = { ok: boolean; message: string };

export type AdminAction = (prevState: ActionResult | null, formData: FormData) => Promise<ActionResult>;

export function SubmitButton({
  children,
  className,
  variant = "primary",
  size = "md",
  pendingLabel,
  name,
  value,
}: {
  children: ReactNode;
  className?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  pendingLabel?: ReactNode;
  name?: string;
  value?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} size={size} className={className} disabled={pending} name={name} value={value}>
      {pending && pendingLabel ? pendingLabel : children}
    </Button>
  );
}

export function ConfirmButton({
  message,
  children,
  className,
  variant = "danger",
  size = "md",
  name,
  value,
}: {
  message: string;
  children: ReactNode;
  className?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  name?: string;
  value?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant={variant}
      size={size}
      className={className}
      disabled={pending}
      name={name}
      value={value}
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </Button>
  );
}

export function ActionForm({
  action,
  children,
  className,
  quiet,
}: {
  action: AdminAction;
  children: ReactNode;
  className?: string;
  /** Only show errors (for small inline toggles where the change itself is the feedback). */
  quiet?: boolean;
}) {
  const [state, formAction] = useActionState<ActionResult | null, FormData>(action, null);
  return (
    <form action={formAction} className={className}>
      {children}
      {state && !(quiet && state.ok) && (
        <Notice tone={state.ok ? "success" : "error"} className="mt-4">
          {state.message}
        </Notice>
      )}
    </form>
  );
}
