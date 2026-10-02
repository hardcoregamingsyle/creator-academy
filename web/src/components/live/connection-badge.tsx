import { Loader2 } from "lucide-react";
import { Badge } from "@/components/ui";
import type { ConnectionState } from "@/lib/live/room-client";

/** Room socket status. Announced politely when it changes. */
export function ConnectionBadge({ connection }: { connection: ConnectionState }) {
  return (
    <span role="status">
      {connection === "open" ? (
        <Badge tone="success">
          <span className="size-1.5 rounded-full bg-current" aria-hidden /> Connected
        </Badge>
      ) : connection === "closed" ? (
        <Badge tone="danger">Disconnected</Badge>
      ) : (
        <Badge tone="warning">
          <Loader2 className="size-3 animate-spin" aria-hidden />
          {connection === "connecting" ? "Connecting…" : "Reconnecting…"}
        </Badge>
      )}
    </span>
  );
}
