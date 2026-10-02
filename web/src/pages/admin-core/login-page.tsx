import { useEffect, useRef, useState, type FormEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { LogIn } from "lucide-react";
import type { ActionResult } from "@shared/api-types";
import { ApiErrorNotice } from "@/components/api-error-notice";
import { Logo } from "@/components/brand";
import { Button, Card, Field, Input, Notice } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import type { AdminSessionInfo } from "@/lib/types";
import { useApi } from "@/lib/useApi";
import { usePageMeta } from "@/lib/usePageMeta";

type LoginProbe = AdminSessionInfo & { adminConfigured?: boolean };

function LoginForm() {
  const navigate = useNavigate();
  const passwordRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (error && !pending) passwordRef.current?.focus();
  }, [error, pending]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    const password = String(new FormData(e.currentTarget).get("password") ?? "");

    setPending(true);
    setError(null);
    try {
      await api.post<ActionResult>("/api/admin/login", { password });
      navigate("/admin", { replace: true });
    } catch (err) {
      setError(errorMessage(err));
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <Field label="Admin password" htmlFor="password">
        <Input
          ref={passwordRef}
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          autoFocus
          required
          disabled={pending}
        />
      </Field>
      {error && <Notice tone="error">{error}</Notice>}
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        <LogIn className="size-4" aria-hidden />
        {pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}

export function Component() {
  usePageMeta({ title: "Admin sign in", noindex: true });
  const { data, error, loading, reload } = useApi<LoginProbe>("/api/admin/session");

  if (data?.admin) return <Navigate to="/admin" replace />;

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-paper px-4 py-12" role="status" aria-busy="true">
        <span className="sr-only">Loading…</span>
      </div>
    );
  }

  if (error && error.status !== 401) {
    return (
      <div className="min-h-dvh bg-paper">
        <ApiErrorNotice error={error} onRetry={reload} title="We couldn't reach the server" />
      </div>
    );
  }

  const configured = data?.adminConfigured !== false;

  return (
    <div className="flex min-h-dvh items-center justify-center bg-paper px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <Logo />
        </div>
        <Card className="p-6 sm:p-8">
          <h1 className="text-2xl font-bold text-ink">Admin sign in</h1>
          <p className="mt-1 text-sm text-muted">For the team running the academy — not for students.</p>

          {!configured ? (
            <Notice tone="warning" title="Admin login isn't set up yet" className="mt-6">
              Set an <code className="font-mono">ADMIN_PASSWORD</code> environment variable (e.g. in{" "}
              <code className="font-mono">.env.local</code>) to enable admin sign-in.
            </Notice>
          ) : (
            <div className="mt-6">
              <LoginForm />
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
