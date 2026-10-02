import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";

/** First check this long after a navigation, then re-check this often while the page is still loading (up to the cap). */
const FIRST_CHECK_MS = 150;
const RECHECK_MS = 120;
const MAX_WAIT_MS = 5000;

/**
 * The SPA's stand-in for Next's route announcer. After every client-side
 * navigation to another path (not on first load, and not for query-string or
 * #hash-only changes) it
 *  - announces the new `document.title` in a visually hidden polite live region, and
 *  - moves focus to the `<main id="main" tabIndex={-1}>` landmark, so keyboard users
 *    don't restart from the top of the document after the link they used was unmounted.
 *
 * Pages set their title once their data arrives, so the announcement waits until
 * the page's loading skeleton (`aria-busy="true"`) is gone, or MAX_WAIT_MS.
 * Focus is left alone when it is already inside <main> (e.g. an autofocused field)
 * and when the URL has a #hash (the scroll target is the destination then).
 */
export function RouteAnnouncer() {
  const { pathname } = useLocation();
  const [message, setMessage] = useState("");
  const lastPath = useRef(pathname);

  useEffect(() => {
    if (lastPath.current === pathname) return; // first render
    lastPath.current = pathname;

    setMessage(""); // so an identical title is still announced as a change
    const started = Date.now();
    let timer: ReturnType<typeof setTimeout>;

    const check = () => {
      const main = document.getElementById("main");
      const loading = (main ?? document).querySelector('[aria-busy="true"]') !== null;
      if (loading && Date.now() - started < MAX_WAIT_MS) {
        timer = setTimeout(check, RECHECK_MS);
        return;
      }
      setMessage(document.title);
      if (main && !window.location.hash && !main.contains(document.activeElement)) main.focus({ preventScroll: true });
    };
    timer = setTimeout(check, FIRST_CHECK_MS);

    return () => clearTimeout(timer);
  }, [pathname]);

  return (
    <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
      {message}
    </div>
  );
}
