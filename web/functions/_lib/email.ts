import { logEmail } from "./data/misc";
import { site, siteUrl } from "./site";

/**
 * Send an email through Resend's HTTP API, or just record it in the email log
 * (visible in /admin/emails) when RESEND_API_KEY isn't set. Resend is a plain
 * HTTPS request, so it works on Cloudflare Workers/Pages Functions (no raw TCP).
 */

export type EmailMessage = {
  to: string;
  subject: string;
  /** Plain-text body. Paragraphs separated by blank lines. */
  text: string;
  kind?: "booking" | "training" | "reminder" | "feedback" | "other";
};

const RESEND_ENDPOINT = "https://api.resend.com/emails";
/** Resend's shared sending address — works with no domain setup, good enough until a real domain is verified. */
const SANDBOX_FROM = "onboarding@resend.dev";

export function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

export async function sendEmail(msg: EmailMessage): Promise<{ ok: boolean }> {
  const kind = msg.kind ?? "other";

  if (!emailConfigured()) {
    await logEmail({ toEmail: msg.to, subject: msg.subject, bodyText: msg.text, kind, status: "logged", error: null });
    return { ok: true };
  }

  try {
    await sendViaResend(msg);
    await logEmail({ toEmail: msg.to, subject: msg.subject, bodyText: msg.text, kind, status: "sent", error: null });
    return { ok: true };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error("[email] send via resend failed:", error);
    await logEmail({ toEmail: msg.to, subject: msg.subject, bodyText: msg.text, kind, status: "failed", error });
    return { ok: false };
  }
}

async function sendViaResend(msg: EmailMessage): Promise<void> {
  const from = process.env.EMAIL_FROM || `${site.name} <${SANDBOX_FROM}>`;
  const res = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: msg.to,
      subject: msg.subject,
      text: msg.text,
      html: renderHtml(msg.subject, msg.text),
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Resend ${res.status}: ${body.slice(0, 300)}`);
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Minimal branded HTML version of the plain-text email. Links become clickable. */
function renderHtml(subject: string, text: string): string {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => {
      const html = escapeHtml(p)
        .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" style="color:#6D28D9">$1</a>')
        .replace(/\n/g, "<br>");
      return `<p style="margin:0 0 16px;line-height:1.6">${html}</p>`;
    })
    .join("");
  return `<!doctype html><html><body style="margin:0;background:#F8F6FC;font-family:Arial,Helvetica,sans-serif;color:#160F20">
<div style="max-width:560px;margin:0 auto;padding:32px 20px">
  <div style="font-weight:700;font-size:18px;margin-bottom:24px"><span style="color:#DC2626">●</span> ${escapeHtml(site.name)}</div>
  <div style="background:#fff;border:1px solid #E4DCF1;border-radius:14px;padding:28px 24px;font-size:15px">
    <h1 style="font-size:20px;margin:0 0 18px">${escapeHtml(subject)}</h1>
    ${paragraphs}
  </div>
  <p style="font-size:12px;color:#685F78;margin-top:20px">${escapeHtml(site.name)} · ${escapeHtml(siteUrl.replace(/^https?:\/\//, ""))}</p>
</div></body></html>`;
}
