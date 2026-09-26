import "server-only";
import { logEmail } from "@/lib/data/misc";
import { site, siteUrl } from "@/lib/site";

/**
 * Send an email — Resend's HTTP API first, SMTP (via nodemailer) as a
 * fallback, and just recording it in the email log (visible in
 * /admin/emails) if neither is configured.
 *
 * Resend is preferred because it's a plain HTTPS request (no raw TCP
 * sockets), so it works the same on a Node server and on Cloudflare Workers.
 * SMTP is kept as a fallback for hosts/providers where Resend isn't an
 * option — note it's not guaranteed to work on Cloudflare Workers, which
 * doesn't support raw outbound TCP the way Node does.
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

type Provider = "resend" | "smtp" | "none";

function activeProvider(): Provider {
  if (process.env.RESEND_API_KEY) return "resend";
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) return "smtp";
  return "none";
}

export function emailConfigured(): boolean {
  return activeProvider() !== "none";
}

export async function sendEmail(msg: EmailMessage): Promise<{ ok: boolean }> {
  const kind = msg.kind ?? "other";
  const provider = activeProvider();

  if (provider === "none") {
    await logEmail({ toEmail: msg.to, subject: msg.subject, bodyText: msg.text, kind, status: "logged", error: null });
    return { ok: true };
  }

  try {
    if (provider === "resend") await sendViaResend(msg);
    else await sendViaSmtp(msg);
    await logEmail({ toEmail: msg.to, subject: msg.subject, bodyText: msg.text, kind, status: "sent", error: null });
    return { ok: true };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error(`[email] send via ${provider} failed:`, error);
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

// nodemailer is dynamically imported so it's only pulled in when SMTP is
// actually configured — keeps it out of the way for the (recommended, and
// Workers-compatible) Resend path.
let smtpTransport: import("nodemailer").Transporter | null = null;

async function sendViaSmtp(msg: EmailMessage): Promise<void> {
  if (!smtpTransport) {
    const nodemailer = (await import("nodemailer")).default;
    const port = Number(process.env.SMTP_PORT || 465);
    smtpTransport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
  }
  await smtpTransport.sendMail({
    from: process.env.EMAIL_FROM || `${site.name} <${process.env.SMTP_USER}>`,
    to: msg.to,
    subject: msg.subject,
    text: msg.text,
    html: renderHtml(msg.subject, msg.text),
  });
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
