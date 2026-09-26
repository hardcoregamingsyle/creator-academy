import Link from "next/link";
import type { SVGProps } from "react";
import {
  BarChart3,
  BookOpen,
  Clapperboard,
  ImageIcon,
  Lightbulb,
  Mic,
  MonitorPlay,
  PenLine,
  Smartphone,
  TrendingUp,
  Video,
  type LucideIcon,
} from "lucide-react";
import { site } from "@/lib/site";
import type { CategorySlug } from "@/content/workshops";
import { cn } from "./ui";

/** Logo mark: a play button with a recording light. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("size-8", className)} aria-hidden>
      <rect width="32" height="32" rx="9" fill="currentColor" />
      <path d="M12.5 10.2v11.6c0 .8.9 1.3 1.6.9l9.2-5.8c.6-.4.6-1.3 0-1.7l-9.2-5.8c-.7-.5-1.6 0-1.6.8Z" fill="#FFFFFF" />
      <circle cx="25" cy="7" r="3.2" fill="#DC2626" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

export function Logo({ className, dark }: { className?: string; dark?: boolean }) {
  return (
    <Link
      href="/"
      className={cn("group inline-flex items-center gap-2.5", dark ? "text-on-dark" : "text-ink", className)}
      aria-label={`${site.name} — home`}
    >
      <LogoMark className={dark ? "text-on-dark [&_path]:fill-ink" : "text-ink"} />
      <span className="font-display text-lg font-bold tracking-tight">{site.name}</span>
    </Link>
  );
}

const categoryIcons: Record<CategorySlug, LucideIcon> = {
  editing: Clapperboard,
  thumbnails: ImageIcon,
  scriptwriting: PenLine,
  storytelling: BookOpen,
  shorts: Smartphone,
  audio: Mic,
  recording: Video,
  obs: MonitorPlay,
  ideas: Lightbulb,
  analytics: BarChart3,
  strategy: TrendingUp,
};

export function CategoryIcon({ category, className }: { category: CategorySlug; className?: string }) {
  const Icon = categoryIcons[category];
  return <Icon className={cn("size-5", className)} aria-hidden strokeWidth={1.9} />;
}

// ───────────────────────── social icons (brand marks) ─────────────────────────

export function InstagramIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden {...props}>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function YouTubeIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
      <path d="M21.6 7.2a2.5 2.5 0 0 0-1.8-1.8C18.2 5 12 5 12 5s-6.2 0-7.8.4A2.5 2.5 0 0 0 2.4 7.2 26 26 0 0 0 2 12a26 26 0 0 0 .4 4.8 2.5 2.5 0 0 0 1.8 1.8c1.6.4 7.8.4 7.8.4s6.2 0 7.8-.4a2.5 2.5 0 0 0 1.8-1.8A26 26 0 0 0 22 12a26 26 0 0 0-.4-4.8ZM10 15V9l5.2 3L10 15Z" />
    </svg>
  );
}

export function FacebookIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
      <path d="M13.5 21v-7.5H16l.4-3h-2.9V8.6c0-.9.3-1.5 1.5-1.5h1.5V4.4c-.3 0-1.2-.1-2.2-.1-2.2 0-3.7 1.3-3.7 3.8v2.4H8v3h2.6V21h2.9Z" />
    </svg>
  );
}

export const socialIcons = {
  Instagram: InstagramIcon,
  YouTube: YouTubeIcon,
  Facebook: FacebookIcon,
} as const;
