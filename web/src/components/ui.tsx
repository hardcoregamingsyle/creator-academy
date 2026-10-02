import { Link } from "react-router-dom";
import type { ComponentProps, ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, Star, XCircle } from "lucide-react";

/**
 * Shared UI primitives. Use these instead of hand-rolling buttons, inputs and
 * headings so the whole site stays consistent.
 */

export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}

// ───────────────────────── layout ─────────────────────────

export function Container({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8", className)}>{children}</div>;
}

export function Section({
  id,
  className,
  children,
  tone = "paper",
}: {
  id?: string;
  className?: string;
  children: ReactNode;
  tone?: "paper" | "surface" | "dark";
}) {
  return (
    <section
      id={id}
      className={cn(
        "py-16 sm:py-24",
        tone === "surface" && "bg-surface border-y border-line",
        tone === "dark" && "bg-deep text-on-dark",
        className,
      )}
    >
      {children}
    </section>
  );
}

/** Small mono label above headings, e.g. "HOW IT WORKS". */
export function Eyebrow({ children, className, dark }: { children: ReactNode; className?: string; dark?: boolean }) {
  return (
    <p
      className={cn(
        "font-mono text-xs font-medium uppercase tracking-[0.14em]",
        dark ? "text-on-dark-muted" : "text-muted",
        className,
      )}
    >
      <span className="mr-2 inline-block size-1.5 -translate-y-px rounded-full bg-accent align-middle" aria-hidden />
      {children}
    </p>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  align = "left",
  dark,
  className,
  action,
}: {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  align?: "left" | "center";
  dark?: boolean;
  className?: string;
  action?: ReactNode;
}) {
  return (
    <div
      className={cn(
        "mb-10 flex flex-col gap-6 sm:mb-12",
        align === "center" ? "items-center text-center" : "md:flex-row md:items-end md:justify-between",
        className,
      )}
    >
      <div className={cn("max-w-2xl", align === "center" && "mx-auto")}>
        {eyebrow && <Eyebrow dark={dark}>{eyebrow}</Eyebrow>}
        <h2 className={cn("mt-3 text-3xl font-bold sm:text-4xl", dark ? "text-on-dark" : "text-ink")}>{title}</h2>
        {description && (
          <p className={cn("mt-4 text-base sm:text-lg", dark ? "text-on-dark-muted" : "text-muted")}>{description}</p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

// ───────────────────────── buttons ─────────────────────────

type Variant = "primary" | "dark" | "outline" | "ghost" | "light" | "danger";
type Size = "sm" | "md" | "lg";

const buttonBase =
  "inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-all duration-150 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100 whitespace-nowrap";

const variants: Record<Variant, string> = {
  primary: "bg-accent-strong text-white hover:bg-[#5b21b6]",
  dark: "bg-deep text-on-dark hover:bg-deep-soft",
  outline: "border border-line-strong bg-surface text-ink hover:border-ink",
  ghost: "text-ink hover:bg-sunken",
  light: "bg-on-dark text-deep hover:bg-white",
  danger: "bg-danger text-white hover:bg-[#b91c1c]",
};

const sizes: Record<Size, string> = {
  sm: "h-9 px-4 text-sm",
  md: "h-11 px-5 text-[15px]",
  lg: "h-13 px-7 text-base",
};

export function buttonClass(variant: Variant = "primary", size: Size = "md", className?: string): string {
  return cn(buttonBase, variants[variant], sizes[size], className);
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ComponentProps<"button"> & { variant?: Variant; size?: Size }) {
  return <button className={buttonClass(variant, size, className)} {...props} />;
}

/**
 * True for paths the SPA router owns. External URLs, mailto:/tel:, #anchors and
 * the server-handled /api/* and /sitemap.xml need a real <a> instead.
 */
export function isInternalHref(href: string): boolean {
  return href.startsWith("/") && !href.startsWith("//") && !href.startsWith("/api/") && href !== "/sitemap.xml";
}

type AnchorProps = Omit<ComponentProps<"a">, "href"> & { href: string };

/** Renders a router <Link> for in-app paths and a plain <a> for everything else. */
export function AppLink({ href, ...props }: AnchorProps) {
  if (isInternalHref(href)) return <Link to={href} {...props} />;
  return <a href={href} {...props} />;
}

export function ButtonLink({
  variant = "primary",
  size = "md",
  className,
  ...props
}: AnchorProps & { variant?: Variant; size?: Size }) {
  return <AppLink className={buttonClass(variant, size, className)} {...props} />;
}

// ───────────────────────── badges & cards ─────────────────────────

type BadgeTone = "neutral" | "accent" | "success" | "warning" | "danger" | "dark" | "blue";

const badgeTones: Record<BadgeTone, string> = {
  neutral: "bg-sunken text-ink-soft",
  accent: "bg-accent-soft text-accent-strong",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  dark: "bg-deep text-on-dark",
  blue: "bg-[#e6e3fb] text-track-blue",
};

export function Badge({ tone = "neutral", className, children }: { tone?: BadgeTone; className?: string; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold leading-none",
        badgeTones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("rounded-2xl border border-line bg-surface shadow-card", className)}>{children}</div>;
}

// ───────────────────────── forms ─────────────────────────

export const inputClass =
  "block w-full rounded-xl border border-line-strong bg-surface px-3.5 py-2.5 text-[15px] text-ink placeholder:text-subtle transition-colors focus:border-ink focus:outline-none focus:ring-2 focus:ring-ink/10 disabled:bg-sunken";

export function Label({ htmlFor, children, optional }: { htmlFor?: string; children: ReactNode; optional?: boolean }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-semibold text-ink">
      {children}
      {optional && <span className="ml-1.5 font-normal text-muted">(optional)</span>}
    </label>
  );
}

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(inputClass, className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cn(inputClass, "min-h-24 resize-y", className)} {...props} />;
}

export function Select({ className, ...props }: ComponentProps<"select">) {
  return <select className={cn(inputClass, "appearance-auto pr-8", className)} {...props} />;
}

export function Field({
  label,
  htmlFor,
  optional,
  hint,
  children,
  className,
}: {
  label: ReactNode;
  htmlFor?: string;
  optional?: boolean;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <Label htmlFor={htmlFor} optional={optional}>
        {label}
      </Label>
      {children}
      {hint && <p className="mt-1.5 text-xs text-muted">{hint}</p>}
    </div>
  );
}

// ───────────────────────── feedback ─────────────────────────

const noticeStyles = {
  info: { box: "bg-accent-soft border-[#dbc7f7] text-accent-strong", Icon: Info },
  success: { box: "bg-success-soft border-[#c7c2f0] text-success", Icon: CheckCircle2 },
  warning: { box: "bg-warning-soft border-[#f3dc9b] text-warning", Icon: AlertTriangle },
  error: { box: "bg-danger-soft border-[#f6c7c3] text-danger", Icon: XCircle },
} as const;

export function Notice({
  tone = "info",
  title,
  children,
  className,
}: {
  tone?: keyof typeof noticeStyles;
  title?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  const { box, Icon } = noticeStyles[tone];
  return (
    <div role={tone === "error" ? "alert" : "status"} className={cn("flex gap-3 rounded-xl border p-4 text-sm", box, className)}>
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={cn(title ? "mt-1" : null, "leading-relaxed")}>{children}</div>}
      </div>
    </div>
  );
}

export function Stars({ rating, className, size = "size-4" }: { rating: number; className?: string; size?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-0.5", className)} aria-label={`${rating} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          aria-hidden
          className={cn(size, i <= Math.round(rating) ? "fill-accent text-accent" : "fill-transparent text-line-strong")}
        />
      ))}
    </span>
  );
}

export function EmptyState({
  icon,
  title,
  children,
  action,
  className,
}: {
  icon?: ReactNode;
  title: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-2xl border border-dashed border-line-strong bg-surface/60 px-6 py-12 text-center", className)}>
      {icon && <div className="mx-auto mb-4 flex size-11 items-center justify-center rounded-full bg-sunken text-muted">{icon}</div>}
      <p className="font-display text-lg font-bold text-ink">{title}</p>
      {children && <div className="mx-auto mt-2 max-w-md text-sm text-muted">{children}</div>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
