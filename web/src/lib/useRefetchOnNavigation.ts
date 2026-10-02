import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";

/**
 * Calls `reload` whenever the user is navigated to the page they are already on.
 *
 * A successful retry payment redirects to the confirmation page's own URL
 * (/booking/CODE, /training/CODE, /monthly-pass/CODE). React Router keeps the
 * same element mounted and `useApi`'s deps don't change, so without this the
 * page would keep showing "Payment not completed". Every navigation gets a new
 * `location.key`, so a key change with an unchanged pathname (after the first
 * render) means "show fresh data". A different pathname already refetches
 * through `useApi`'s `path`, so it is not reloaded a second time here.
 */
export function useRefetchOnNavigation(reload: () => void): void {
  const { key, pathname } = useLocation();
  const seen = useRef({ key, pathname });
  useEffect(() => {
    const prev = seen.current;
    if (prev.key === key) return;
    seen.current = { key, pathname };
    if (prev.pathname === pathname) reload();
  }, [key, pathname, reload]);
}
