import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { listEmailLog } from "@/lib/data/misc";
import { emailConfigured } from "@/lib/email";
import { formatDateShort, formatTime, timeAgo } from "@/lib/format";
import { Badge, EmptyState, Notice } from "@/components/ui";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Email log", robots: { index: false, follow: false } };

const statusTone = { sent: "success", logged: "neutral", failed: "danger" } as const;

export default async function EmailsPage() {
  await requireAdmin();
  const emails = await listEmailLog();
  const configured = emailConfigured();

  return (
    <div>
      <h1 className="text-3xl font-bold sm:text-4xl">Email log</h1>
      <p className="mt-2 text-muted">Every confirmation, reminder and notification the site has sent.</p>

      {!configured && (
        <Notice tone="warning" title="Emails are only being logged, not sent" className="mt-6">
          No SMTP settings are configured, so emails are recorded here instead of delivered. To send real emails, set
          these environment variables:{" "}
          <code className="font-mono">SMTP_HOST</code>, <code className="font-mono">SMTP_PORT</code>,{" "}
          <code className="font-mono">SMTP_USER</code>, <code className="font-mono">SMTP_PASS</code> and{" "}
          <code className="font-mono">EMAIL_FROM</code>.
        </Notice>
      )}

      {emails.length === 0 ? (
        <div className="mt-6">
          <EmptyState title="No emails yet">Emails sent by the site will be logged here.</EmptyState>
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-2xl border border-line bg-surface shadow-card">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-line bg-sunken/60 text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3 font-semibold">Recipient</th>
                <th className="px-4 py-3 font-semibold">Subject</th>
                <th className="px-4 py-3 font-semibold">Kind</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Sent</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {emails.map((e) => (
                <tr key={e.id} className="align-top">
                  <td className="px-4 py-3 text-ink-soft">{e.toEmail}</td>
                  <td className="px-4 py-3">
                    <details>
                      <summary className="cursor-pointer font-medium text-ink">{e.subject}</summary>
                      <p className="mt-2 max-w-md whitespace-pre-wrap text-xs text-ink-soft">{e.bodyText}</p>
                    </details>
                  </td>
                  <td className="px-4 py-3 text-muted">{e.kind ?? "—"}</td>
                  <td className="px-4 py-3">
                    <Badge tone={statusTone[e.status]}>{e.status}</Badge>
                    {e.status === "failed" && e.error && <p className="mt-1 max-w-[200px] text-xs text-danger">{e.error}</p>}
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-ink-soft">
                      {formatDateShort(e.createdAt)} · {formatTime(e.createdAt)}
                    </p>
                    <p className="text-muted">{timeAgo(e.createdAt)}</p>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
