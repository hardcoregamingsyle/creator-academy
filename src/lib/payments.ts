import "server-only";
import crypto from "node:crypto";

/**
 * Razorpay integration (UPI, cards, netbanking, wallets) using the REST API.
 *
 * Modes:
 *   razorpay → RAZORPAY_KEY_ID + RAZORPAY_KEY_SECRET are set: real payments.
 *   demo     → no keys, and either development or ALLOW_DEMO_PAYMENTS=true:
 *              payments are simulated (clearly labelled) so the flow can be tested.
 *   disabled → no keys in production: bookings can't be paid online.
 *
 * The checkout shows the merchant name registered with Razorpay — the
 * academy's business identity, set up with accurate KYC details.
 */

export type PaymentMode = "razorpay" | "demo" | "disabled";

export function paymentMode(): PaymentMode {
  if (process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET) return "razorpay";
  if (process.env.NODE_ENV !== "production" || process.env.ALLOW_DEMO_PAYMENTS === "true") return "demo";
  return "disabled";
}

export function razorpayKeyId(): string {
  return process.env.RAZORPAY_KEY_ID ?? "";
}

export type RazorpayOrder = { id: string; amount: number; currency: string; status: string; receipt: string };

export async function createRazorpayOrder(input: {
  amountPaise: number;
  receipt: string;
  notes: Record<string, string>;
}): Promise<RazorpayOrder> {
  const auth = Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString("base64");
  const res = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      amount: input.amountPaise,
      currency: "INR",
      receipt: input.receipt.slice(0, 40),
      notes: input.notes,
    }),
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Razorpay order creation failed (${res.status}): ${body.slice(0, 300)}`);
  }
  return (await res.json()) as RazorpayOrder;
}

function hmacHex(secret: string, data: string): string {
  return crypto.createHmac("sha256", secret).update(data).digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

/** Verify the signature returned by Razorpay Checkout after a successful payment. */
export function verifyCheckoutSignature(orderId: string, paymentId: string, signature: string): boolean {
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!secret || !orderId || !paymentId || !signature) return false;
  return safeEqual(hmacHex(secret, `${orderId}|${paymentId}`), signature);
}

/** Verify a Razorpay webhook (X-Razorpay-Signature over the raw request body). */
export function verifyWebhookSignature(rawBody: string, signature: string | null): boolean {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret || !signature) return false;
  return safeEqual(hmacHex(secret, rawBody), signature);
}
