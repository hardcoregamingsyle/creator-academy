import { useMemo } from "react";
import { Download, FileText } from "lucide-react";
import type { SharedFile } from "@shared/live";
import { fileUrl, formatBytes } from "@/lib/live/upload";

const timeOf = (at: number) => new Date(at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

/** Files shared in the room: image thumbnails, or a document row. Everything opens in a new tab; the room Worker decides inline vs download. */
export function FilesPanel({
  files,
  httpBase,
  room,
  ticket,
  emptyText,
}: {
  files: SharedFile[];
  httpBase: string | null;
  /** The room id (class session id). */
  room: string;
  ticket: string | null;
  emptyText: string;
}) {
  const sorted = useMemo(() => [...files].sort((a, b) => b.at - a.at), [files]);
  if (sorted.length === 0) return <p className="py-8 text-center text-sm text-muted">{emptyText}</p>;

  return (
    <ul className="space-y-2" aria-live="polite" aria-label="Shared files">
      {sorted.map((f) => {
        const url = httpBase && ticket ? fileUrl(httpBase, room, f.id, ticket) : null;
        const body = (
          <>
            {f.isImage && url ? (
              <img src={url} alt="" loading="lazy" className="size-14 shrink-0 rounded-lg bg-sunken object-cover" />
            ) : (
              <span className="flex size-14 shrink-0 items-center justify-center rounded-lg bg-sunken text-muted">
                <FileText className="size-6" aria-hidden />
              </span>
            )}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-ink">{f.name}</span>
              <span className="block text-xs text-muted">
                {formatBytes(f.size)} · {timeOf(f.at)}
              </span>
            </span>
            <Download className="size-4 shrink-0 text-muted" aria-hidden />
          </>
        );
        const cls = "flex items-center gap-3 rounded-xl border border-line bg-surface p-2 pr-3";
        return (
          <li key={f.id}>
            {url ? (
              <a href={url} target="_blank" rel="noopener noreferrer" aria-label={`${f.isImage ? "Open image" : "Download"} ${f.name}`} className={`${cls} hover:border-ink`}>
                {body}
              </a>
            ) : (
              <div className={cls}>{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
