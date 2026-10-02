import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { brand } from "@shared/brand";
import type { SiteInfo } from "@shared/api-types";
import { api } from "./api";

const CACHE_KEY = "ca-site";

/** Shown until GET /api/site answers (or when it fails): only what ships statically in the bundle. */
const FALLBACK: SiteInfo = {
  name: brand.name,
  tagline: brand.tagline,
  description: brand.description,
  contactEmail: "",
  replyTime: "within 24 hours",
  legal: { businessName: "", address: "", jurisdiction: "India" },
  socials: [],
  siteUrl: typeof window !== "undefined" ? window.location.origin : "",
  paymentMode: "disabled",
  pricing: { workshopPaise: 27900, monthlyPassPaise: 149900, returningDiscountPercent: 15, anchorMarkupPercent: 90 },
};

function normalise(info: Partial<SiteInfo>): SiteInfo {
  return {
    ...FALLBACK,
    ...info,
    legal: { ...FALLBACK.legal, ...info.legal },
    socials: Array.isArray(info.socials) ? info.socials : [],
    // A copy cached by an older build has no `pricing` (or only some keys): fill the gaps so useSite().pricing is always complete.
    pricing: { ...FALLBACK.pricing, ...info.pricing },
  };
}

function readCache(): SiteInfo | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? normalise(JSON.parse(raw) as Partial<SiteInfo>) : null;
  } catch {
    return null;
  }
}

function writeCache(info: SiteInfo): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(info));
  } catch {
    /* private browsing etc. — just refetched next visit */
  }
}

type SiteState = { info: SiteInfo; ready: boolean };

const SiteContext = createContext<SiteState>({ info: FALLBACK, ready: false });

/** Waits before the 2nd and 3rd attempt at GET /api/site (three attempts in all). */
const RETRY_DELAYS_MS = [1000, 3000];

/**
 * Fetches GET /api/site at startup (retrying a failed request twice, after 1s
 * and 3s). Children render immediately with the static fallback (or the copy
 * cached from the last visit) and re-render when the fresh response arrives,
 * so the app never blocks on it.
 */
export function SiteProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SiteState>(() => {
    const cached = readCache();
    return cached ? { info: cached, ready: true } : { info: FALLBACK, ready: false };
  });

  useEffect(() => {
    const ctrl = new AbortController();
    let retryTimer: ReturnType<typeof setTimeout> | undefined;

    const load = (attempt: number) => {
      api.get<SiteInfo>("/api/site", { signal: ctrl.signal }).then(
        (raw) => {
          const info = normalise(raw);
          writeCache(info);
          setState({ info, ready: true });
        },
        () => {
          if (ctrl.signal.aborted) return;
          const delay = RETRY_DELAYS_MS[attempt];
          // Out of attempts: keep whatever we have; pages that need more surface their own errors.
          if (delay !== undefined) retryTimer = setTimeout(() => load(attempt + 1), delay);
        },
      );
    };
    load(0);

    return () => {
      ctrl.abort();
      clearTimeout(retryTimer);
    };
  }, []);

  const value = useMemo(() => state, [state]);
  return <SiteContext.Provider value={value}>{children}</SiteContext.Provider>;
}

/** Site name, contact details, legal info, socials, payment mode and live prices/offer settings. Safe before the response lands (static fallbacks). */
export function useSite(): SiteInfo {
  return useContext(SiteContext).info;
}

/** True once real values from /api/site (or last visit's cached copy) are in place — use to avoid flashing fallback-derived UI. */
export function useSiteReady(): boolean {
  return useContext(SiteContext).ready;
}
