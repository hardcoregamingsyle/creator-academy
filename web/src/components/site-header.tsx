import { Link, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { Logo } from "./brand";
import { ThemeToggle } from "./theme-toggle";
import { buttonClass, cn } from "./ui";

const nav = [
  { href: "/classes", label: "Classes" },
  { href: "/monthly-pass", label: "Monthly Pass" },
  { href: "/schedule", label: "Schedule" },
  { href: "/personal-training", label: "Personal training" },
  { href: "/faq", label: "FAQ" },
];

export function SiteHeader() {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  const isActive = (href: string) => !href.includes("#") && (pathname === href || pathname.startsWith(href + "/"));

  return (
    <header className="sticky top-0 z-40 border-b border-line/80 bg-paper/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <Logo />
        <nav aria-label="Main" className="hidden items-center gap-1 lg:flex">
          {nav.map((item) => (
            <Link
              key={item.href}
              to={item.href}
              className={cn(
                "rounded-full px-3.5 py-2 text-[15px] font-medium transition-colors",
                isActive(item.href) ? "bg-sunken text-ink" : "text-muted hover:text-ink",
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-1.5">
          <ThemeToggle />
          <div className="hidden sm:block">
            <Link to="/classes" className={buttonClass("dark", "sm")}>
              Explore classes
            </Link>
          </div>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="inline-flex size-10 items-center justify-center rounded-full text-ink hover:bg-sunken lg:hidden"
            aria-expanded={open}
            aria-controls="mobile-nav"
            aria-label={open ? "Close menu" : "Open menu"}
          >
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </div>

      {open && (
        <div id="mobile-nav" className="fixed inset-x-0 top-16 bottom-0 z-40 overflow-y-auto bg-paper lg:hidden">
          <nav aria-label="Mobile" className="flex flex-col gap-1 px-4 py-6">
            {nav.map((item) => (
              <Link
                key={item.href}
                to={item.href}
                onClick={() => setOpen(false)}
                className={cn(
                  "rounded-xl px-4 py-3.5 font-display text-xl font-semibold",
                  isActive(item.href) ? "bg-sunken text-ink" : "text-ink hover:bg-sunken",
                )}
              >
                {item.label}
              </Link>
            ))}
            <Link to="/classes" onClick={() => setOpen(false)} className={buttonClass("primary", "lg", "mt-6")}>
              Explore classes
            </Link>
          </nav>
        </div>
      )}
    </header>
  );
}
