import { createContext, useContext, useState, type FormEvent, type ReactNode } from "react";
import type { ActionResult } from "@shared/api-types";
import { errorMessage } from "@/lib/api";
import { Button, Notice } from "@/components/ui";

export type { ActionResult };

/** Mirrors the (unexported) Variant/Size union in components/ui.tsx. */
type ButtonVariant = "primary" | "dark" | "outline" | "ghost" | "light" | "danger";
type ButtonSize = "sm" | "md" | "lg";

/**
 * Shared client helpers for admin forms.
 *
 * `ActionForm` runs an async action on submit, tracks the pending state itself
 * and shows the returned message in a Notice (success or error). The action
 * receives the form's FormData (including the clicked button's name/value) and
 * returns an `ActionResult`. Pages bind ids by closing over them:
 *
 *   <ActionForm
 *     action={(fd) => api.postForm<ActionResult>("/api/admin/passes/" + id + "/status", fd)}
 *     onDone={(r) => r.ok && reload()}
 *   >
 *
 * Call `reload()` (from `useApi`) in `onDone` to refresh the page's data after a
 * successful change. Fields are left as typed unless `resetOnSuccess` is set —
 * use that for "create" forms that should clear after saving.
 *
 * `SubmitButton` / `ConfirmButton` are submit buttons that disable themselves
 * while the enclosing `ActionForm` is submitting. `ConfirmButton` additionally
 * asks `window.confirm(message)` before the click is allowed to submit — use
 * it for destructive actions (refund, cancel, delete).
 */

export type AdminAction = (formData: FormData) => Promise<ActionResult>;

const PendingContext = createContext(false);

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
  const pending = useContext(PendingContext);
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
  const pending = useContext(PendingContext);
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
  onDone,
  children,
  className,
  quiet,
  resetOnSuccess,
}: {
  action: AdminAction;
  /** Runs after every submit with the result (also for failures) — typically `(r) => r.ok && reload()`. */
  onDone?: (result: ActionResult) => void;
  children: ReactNode;
  className?: string;
  /** Only show errors (for small inline toggles where the change itself is the feedback). */
  quiet?: boolean;
  /** Clear the form's fields after a successful submit (for "add new" forms). */
  resetOnSuccess?: boolean;
}) {
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<ActionResult | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    const form = e.currentTarget;
    const submitter = (e.nativeEvent as SubmitEvent).submitter;
    const formData = new FormData(form, submitter);

    setPending(true);
    setResult(null);
    let res: ActionResult;
    try {
      res = await action(formData);
    } catch (err) {
      res = { ok: false, message: errorMessage(err) };
    }
    setPending(false);
    setResult(res);
    if (res.ok && resetOnSuccess) form.reset();
    onDone?.(res);
  }

  return (
    <PendingContext.Provider value={pending}>
      <form onSubmit={onSubmit} className={className}>
        {children}
        {result && !(quiet && result.ok) && (
          <Notice tone={result.ok ? "success" : "error"} className="mt-4">
            {result.message}
          </Notice>
        )}
      </form>
    </PendingContext.Provider>
  );
}
