import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { cn } from "./ui";

const STORAGE_KEY = "ca-theme";

function currentTheme(): "light" | "dark" {
  if (typeof document === "undefined") return "light";
  const attr = document.documentElement.getAttribute("data-theme");
  if (attr === "light" || attr === "dark") return attr;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/** The saved choice, or null when there is none or storage can't be read (blocked cookies, some in-app webviews throw on access). */
function readSavedTheme(): "light" | "dark" | null {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved === "light" || saved === "dark" ? saved : null;
  } catch {
    return null;
  }
}

/**
 * Light/dark toggle. Defaults to the visitor's system preference; once they
 * click it, the choice is remembered (localStorage) and overrides the
 * system setting from then on. The <head> script in index.html applies the
 * saved choice before paint, so there's no flash on load.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const [theme, setTheme] = useState<"light" | "dark" | null>(null);

  useEffect(() => {
    setTheme(currentTheme());
    // Follow system changes live, as long as the visitor hasn't chosen explicitly.
    if (readSavedTheme()) return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      // Once the visitor has toggled in this session (even if it couldn't be saved) the explicit choice wins over the system setting.
      if (document.documentElement.hasAttribute("data-theme")) return;
      setTheme(mq.matches ? "dark" : "light");
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  function toggle() {
    const next = currentTheme() === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* private browsing, etc. — theme just won't persist across visits */
    }
    setTheme(next);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      className={cn(
        "relative flex size-10 shrink-0 items-center justify-center rounded-full text-ink transition-colors hover:bg-sunken",
        className,
      )}
    >
      <Sun
        className={cn(
          "absolute size-[18px] transition-all duration-300",
          theme === "dark" ? "-rotate-90 scale-0 opacity-0" : "rotate-0 scale-100 opacity-100",
        )}
        aria-hidden
      />
      <Moon
        className={cn(
          "absolute size-[18px] transition-all duration-300",
          theme === "dark" ? "rotate-0 scale-100 opacity-100" : "rotate-90 scale-0 opacity-0",
        )}
        aria-hidden
      />
    </button>
  );
}
