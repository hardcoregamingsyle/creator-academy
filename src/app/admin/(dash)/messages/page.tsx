import type { Metadata } from "next";
import { Mail } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { listContactMessages } from "@/lib/data/misc";
import { formatDateShort, formatTime, timeAgo } from "@/lib/format";
import { Badge, Card, EmptyState } from "@/components/ui";
import { ActionForm, SubmitButton } from "../admin-ui";
import { setContactHandledAction } from "./actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Messages", robots: { index: false, follow: false } };

export default async function MessagesPage() {
  await requireAdmin();
  const messages = await listContactMessages();
  const sorted = [...messages].sort((a, b) => {
    if (a.handled !== b.handled) return a.handled ? 1 : -1;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
  const openCount = messages.filter((m) => !m.handled).length;

  return (
    <div>
      <h1 className="text-3xl font-bold sm:text-4xl">Messages</h1>
      <p className="mt-2 text-muted">
        Contact form submissions. {openCount > 0 ? `${openCount} need a reply.` : "All caught up."}
      </p>

      {sorted.length === 0 ? (
        <div className="mt-6">
          <EmptyState icon={<Mail className="size-5" aria-hidden />} title="No messages yet">
            Contact form submissions will show up here.
          </EmptyState>
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {sorted.map((m) => (
            <Card key={m.id} className={m.handled ? "p-5 opacity-70" : "p-5"}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-ink">{m.name}</p>
                    {!m.handled && <Badge tone="warning">Unhandled</Badge>}
                    {m.topic && <Badge tone="neutral">{m.topic}</Badge>}
                  </div>
                  <a
                    href={`mailto:${m.email}?subject=${encodeURIComponent(`Re: ${m.topic ?? "your message"}`)}`}
                    className="text-sm text-accent-strong underline underline-offset-2"
                  >
                    {m.email}
                  </a>
                </div>
                <div className="text-right text-xs text-muted">
                  <p>{formatDateShort(m.createdAt)} · {formatTime(m.createdAt)}</p>
                  <p>{timeAgo(m.createdAt)}</p>
                </div>
              </div>

              <p className="mt-3 whitespace-pre-wrap text-sm text-ink-soft">{m.message}</p>

              <div className="mt-4 border-t border-line pt-3">
                <ActionForm action={setContactHandledAction.bind(null, m.id, !m.handled)} quiet>
                  <SubmitButton variant="outline" size="sm" pendingLabel="Saving…">
                    {m.handled ? "Mark as unhandled" : "Mark as handled"}
                  </SubmitButton>
                </ActionForm>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
