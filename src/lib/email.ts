import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import { logEmail } from "@/lib/data/misc";
import { site, siteUrl } from "@/lib/site";

/**
 * Send an email through SMTP when configured; otherwise just record it in the
 * email log (visible in /admin/emails) so nothing is lost during development.
 */

export type EmailMessage = {
  to: string;
  subject: string;
  /** Plain-text body. Paragraphs separated by blank lines. */
  text: string;
  kind?: "booking" | "training" | "reminder" | "feedback" | "other";
};

let transporter: Transporter | null = null;

export function emailConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

function getTransporter(): Transporter {
  if (!transporter) {
    const port = Number(process.env.SMTP_PORT || 465);
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
  }
  return transporter;
}

export async function sendEmail(msg: EmailMessage): Promise<{ ok: boolean }> {
  const kind = msg.kind ?? "other";
  if (!emailConfigured()) {
    await logEmail({ toEmail: msg.to, subject: msg.subject, bodyText: msg.text, kind, status: "logged", error: null });
    return { ok: true };
  }
  try {
    await getTransporter().sendMail({
      from: process.env.EMAIL_FROM || `${site.name} <${process.env.SMTP_USER}>`,
      to: msg.to,
      subject: msg.subject,
      text: msg.text,
      html: renderHtml(msg.subject, msg.text),
    });
    await logEmail({ toEmail: msg.to, subject: msg.subject, bodyText: msg.text, kind, status: "sent", error: null });
    return { ok: true };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error("[email] send failed:", error);
    await logEmail({ toEmail: msg.to, subject: msg.subject, bodyText: msg.text, kind, status: "failed", error });
    return { ok: false };
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
        .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" style="color:#C2410C">$1</a>')
        .replace(/\n/g, "<br>");
      return `<p style="margin:0 0 16px;line-height:1.6">${html}</p>`;
    })
    .join("");
  return `<!doctype html><html><body style="margin:0;background:#F6F4EF;font-family:Arial,Helvetica,sans-serif;color:#141414">
<div style="max-width:560px;margin:0 auto;padding:32px 20px">
  <div style="font-weight:700;font-size:18px;margin-bottom:24px"><span style="color:#E8431A">●</span> ${escapeHtml(site.name)}</div>
  <div style="background:#fff;border:1px solid #E6E1D8;border-radius:14px;padding:28px 24px;font-size:15px">
    <h1 style="font-size:20px;margin:0 0 18px">${escapeHtml(subject)}</h1>
    ${paragraphs}
  </div>
  <p style="font-size:12px;color:#6B6660;margin-top:20px">${escapeHtml(site.name)} · ${escapeHtml(siteUrl.replace(/^https?:\/\//, ""))}</p>
</div></body></html>`;
}
