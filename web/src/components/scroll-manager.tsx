import { useEffect, useRef } from "react";
import { useLocation, useNavigationType } from "react-router-dom";

/** Page content arrives asynchronously, so an anchor's target may not exist yet: look for it this often, for this long. */
const HASH_POLL_MS = 100;
const HASH_WAIT_MS = 3000;

function hashTargetId(hash: string): string {
  const raw = hash.slice(1);
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw; // malformed %-escape: use it as typed
  }
}

/**
 * Scroll handling for client-side navigation. `behavior: "instant"` is used
 * because the global CSS makes scrolling smooth.
 *
 * - A location with a #hash (first load, a link, back/forward, a same-page
 *   anchor click, every time) scrolls to that element. Pages fetch their data
 *   before the section exists, so if it isn't there yet it is looked for every
 *   100 ms for up to 3 s (stopped as soon as the user navigates again).
 * - Without a hash, following a link to another path (or dropping the hash)
 *   scrolls to the top. Query-string-only changes (filters, pagination) leave
 *   the scroll position alone.
 * - Back/forward without a hash is left entirely to the browser.
 */
export function ScrollManager() {
  const { pathname, hash, key } = useLocation();
  const navType = useNavigationType();
  const last = useRef({ pathname, hash });

  useEffect(() => {
    const prev = last.current;
    last.current = { pathname, hash };

    if (hash) {
      const id = hashTargetId(hash);
      const scrollToTarget = () => {
        const el = document.getElementById(id);
        el?.scrollIntoView({ behavior: "instant", block: "start" });
        return el !== null;
      };
      if (scrollToTarget()) return;
      if (navType !== "POP") window.scrollTo({ top: 0, left: 0, behavior: "instant" });
      const started = Date.now();
      const timer = window.setInterval(() => {
        if (scrollToTarget() || Date.now() - started >= HASH_WAIT_MS) window.clearInterval(timer);
      }, HASH_POLL_MS);
      return () => window.clearInterval(timer);
    }

    if (navType !== "POP" && (prev.pathname !== pathname || prev.hash !== hash)) {
      window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    }
  }, [key, pathname, hash, navType]);

  return null;
}
