import { Mail } from "lucide-react";
import { formatDateShort, formatTime, timeAgo } from "@shared/format";
import type { AdminMessagesPageData } from "@shared/pages/admin-ops";
import { ActionForm, SubmitButton } from "@/components/admin-ui";
import { ApiErrorNotice } from "@/components/api-error-notice";
import { PageSkeleton } from "@/components/page-skeleton";
import { Badge, Card, EmptyState } from "@/components/ui";
import { useApi } from "@/lib/useApi";
import { usePageMeta } from "@/lib/usePageMeta";
import { enc, postTo } from "./post";

export function Component() {
  usePageMeta({ title: "Messages" });
  const { data, error, reload } = useApi<AdminMessagesPageData>("/api/admin/messages");

  if (error) return <ApiErrorNotice error={error} onRetry={reload} />;
  if (!data) return <PageSkeleton bare />;

  const { messages, openCount } = data;

  return (
    <div>
      <h1 className="text-3xl font-bold sm:text-4xl">Messages</h1>
      <p className="mt-2 text-muted">
        Contact form submissions. {openCount > 0 ? `${openCount} need a reply.` : "All caught up."}
      </p>

      {messages.length === 0 ? (
        <div className="mt-6">
          <EmptyState icon={<Mail className="size-5" aria-hidden />} title="No messages yet">
            Contact form submissions will show up here.
          </EmptyState>
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {messages.map((m) => (
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
                  <p>
                    {formatDateShort(m.createdAt)} · {formatTime(m.createdAt)}
                  </p>
                  <p>{timeAgo(m.createdAt)}</p>
                </div>
              </div>

              <p className="mt-3 whitespace-pre-wrap text-sm text-ink-soft">{m.message}</p>

              <div className="mt-4 border-t border-line pt-3">
                <ActionForm action={postTo(`/api/admin/messages/${enc(m.id)}/handled`)} onDone={(r) => r.ok && reload()} quiet>
                  <input type="hidden" name="handled" value={m.handled ? "0" : "1"} />
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
