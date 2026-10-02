import { Link, useLocation } from "react-router-dom";
import {
  CalendarDays,
  IndianRupee,
  LayoutDashboard,
  LibraryBig,
  Mail,
  MessageSquareQuote,
  Send,
  Share2,
  Sparkles,
  Ticket,
  TrendingUp,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/components/ui";

const navItems: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard },
  { href: "/admin/pricing", label: "Pricing", icon: IndianRupee },
  { href: "/admin/sessions", label: "Sessions", icon: CalendarDays },
  { href: "/admin/classes", label: "Classes", icon: LibraryBig },
  { href: "/admin/bookings", label: "Bookings", icon: Ticket },
  { href: "/admin/passes", label: "Monthly Pass", icon: Sparkles },
  { href: "/admin/training", label: "Personal training", icon: UserRound },
  { href: "/admin/feedback", label: "Feedback", icon: MessageSquareQuote },
  { href: "/admin/demand", label: "Demand", icon: TrendingUp },
  { href: "/admin/messages", label: "Messages", icon: Mail },
  { href: "/admin/emails", label: "Emails", icon: Send },
  { href: "/admin/socials", label: "Socials", icon: Share2 },
];

function isActivePath(pathname: string, href: string): boolean {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(href + "/");
}

/**
 * The admin nav, rendered either as a vertical sidebar list (desktop) or a
 * horizontally scrollable pill row (mobile top bar). Highlights the active
 * item from the current location.
 */
export function AdminNavLinks({ variant }: { variant: "sidebar" | "topbar" }) {
  const { pathname } = useLocation();

  if (variant === "topbar") {
    return (
      <nav aria-label="Admin" className="flex items-center gap-1 overflow-x-auto px-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {navItems.map((item) => {
          const active = isActivePath(pathname, item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              to={item.href}
              className={cn(
                "flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-2 text-sm font-medium transition-colors",
                active ? "bg-deep text-on-dark" : "text-muted hover:bg-sunken hover:text-ink",
              )}
            >
              <Icon className="size-4" aria-hidden />
              {item.label}
            </Link>
          );
        })}
      </nav>
    );
  }

  return (
    <nav aria-label="Admin" className="flex flex-col gap-1">
      {navItems.map((item) => {
        const active = isActivePath(pathname, item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            to={item.href}
            className={cn(
              "flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-[15px] font-medium transition-colors",
              active ? "bg-deep text-on-dark" : "text-ink-soft hover:bg-sunken",
            )}
          >
            <Icon className="size-4" aria-hidden />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
