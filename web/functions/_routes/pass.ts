import { Hono } from "hono";
import { createPendingPass, getPassByCode, passesOnSale } from "../_lib/data/monthly-pass";
import { listUpcomingSessions } from "../_lib/data/sessions";
import { getSiteSettings } from "../_lib/data/site-settings";
import { paymentMode } from "../_lib/payments";
import { site } from "../_lib/site";
import { istMonthKey, monthLabel } from "../../shared/format";
import type {
  MonthlyPassPage,
  PassBookRequest,
  PassBookResponse,
  PassConfirmationPage,
  PassMonth,
  PassSessionItem,
} from "../../shared/pages/pass";
import type { AppEnv } from "./types";
import { isEmail, normalisePhone, notFound, str } from "./util";

export const routes = new Hono<AppEnv>();

// Replaces src/app/(site)/monthly-pass/page.tsx
routes.get("/pages/monthly-pass", async (c) => {
  const onSale = passesOnSale();
  const [allUpcoming, settings] = await Promise.all([listUpcomingSessions(), getSiteSettings()]);

  const byMonth = new Map<string, PassSessionItem[]>(onSale.map((m) => [m.monthKey, []]));
  for (const s of allUpcoming) {
    const bucket = byMonth.get(istMonthKey(s.startsAt));
    if (!bucket) continue;
    bucket.push({
      id: s.id,
      startsAt: s.startsAt,
      durationMin: s.durationMin,
      workshop: s.workshop ? { title: s.workshop.title, category: s.workshop.category } : null,
    });
  }
  const months: PassMonth[] = onSale.map((m) => ({ ...m, sessions: byMonth.get(m.monthKey) ?? [] }));

  const payload: MonthlyPassPage = {
    months,
    pricePaise: settings.monthlyPassPricePaise,
    perClassPricePaise: settings.workshopPricePaise,
    paymentMode: paymentMode(),
  };
  return c.json(payload);
});

// Replaces src/app/(site)/monthly-pass/[code]/page.tsx
routes.get("/pages/monthly-pass/:code", async (c) => {
  const pass = await getPassByCode(c.req.param("code"));
  if (!pass) return notFound(c);

  const payload: PassConfirmationPage = {
    pass: {
      code: pass.code,
      name: pass.name,
      email: pass.email,
      monthKey: pass.monthKey,
      label: monthLabel(pass.monthKey),
      amountPaise: pass.amountPaise,
      status: pass.status,
      paymentProvider: pass.paymentProvider,
    },
    paymentMode: paymentMode(),
    contactEmail: site.contactEmail,
  };
  return c.json(payload);
});

// Replaces src/app/api/book/pass/route.ts. Errors keep the old `{ ok: false, error }` body the form reads.
routes.post("/book/pass", async (c) => {
  const raw: unknown = await c.req.json().catch(() => null);
  const body: Partial<Record<keyof PassBookRequest, unknown>> =
    raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};

  const reject = (error: string, status: 400 | 409 = 400) => c.json({ ok: false, error } satisfies PassBookResponse, status);

  const monthKey = str(body.monthKey, 7);
  const name = str(body.name, 120);
  const email = str(body.email, 200);
  const phone = normalisePhone(str(body.phone, 30));

  if (!monthKey) return reject("Please choose a month.");
  if (name.length < 2) return reject("Please enter your name.");
  if (!isEmail(email)) return reject("Please enter a valid email address.");
  if (!phone.ok) return reject("Please enter a valid phone number (or leave it empty).");
  if (body.acceptTerms !== true) return reject("Please accept the terms and refund policy to continue.");

  const result = await createPendingPass({ monthKey, name, email, phone: phone.value });
  if (!result.ok) return reject(result.error, 409);
  return c.json({ ok: true, code: result.pass.code, amountPaise: result.pass.amountPaise } satisfies PassBookResponse);
});
