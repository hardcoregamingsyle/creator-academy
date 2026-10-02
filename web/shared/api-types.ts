/** Types shared by the SPA (src/) and the Pages Functions API (functions/). Pure types only — no runtime imports. */

/** What every admin mutation endpoint returns (HTTP 200 even for business-rule failures, so the UI can show `message`). */
export type ActionResult = { ok: boolean; message: string };

/** Standard error body for non-200 responses (auth failures, bad requests, unexpected errors). */
export type ApiErrorBody = { ok: false; message: string };

export type PaymentMode = "razorpay" | "demo" | "disabled";

export type SocialLink = { id: string; platform: string; handle: string; url: string };

/** GET /api/site — loaded once by the SPA (SiteProvider) for the header, footer and shared copy. */
export type SiteInfo = {
  name: string;
  tagline: string;
  description: string;
  contactEmail: string;
  replyTime: string;
  legal: { businessName: string; address: string; jurisdiction: string };
  /** Only socials that have a URL (what the public site should render). */
  socials: SocialLink[];
  siteUrl: string;
  paymentMode: PaymentMode;
  /** Live prices (paise) and offer settings, so any component can show the struck-through anchor price. */
  pricing: SitePricing;
};

export type SitePricing = {
  workshopPaise: number;
  monthlyPassPaise: number;
  returningDiscountPercent: number;
  /** Struck-through "regular price" = price x (1 + this/100). 0 hides it everywhere. */
  anchorMarkupPercent: number;
};
