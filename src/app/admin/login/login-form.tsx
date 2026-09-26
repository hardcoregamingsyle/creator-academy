"use client";

import { useActionState } from "react";
import { LogIn } from "lucide-react";
import { Button, Field, Input, Notice } from "@/components/ui";
import { loginAction, type LoginState } from "./actions";

export function LoginForm() {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(loginAction, null);

  return (
    <form action={formAction} className="space-y-5">
      <Field label="Admin password" htmlFor="password">
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          autoFocus
          required
          disabled={pending}
        />
      </Field>
      {state?.error && <Notice tone="error">{state.error}</Notice>}
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        <LogIn className="size-4" aria-hidden />
        {pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
