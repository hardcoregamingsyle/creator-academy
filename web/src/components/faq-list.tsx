import { Plus } from "lucide-react";
import type { FaqItem } from "@shared/content";
import { cn } from "./ui";

/** Accessible FAQ accordion using native <details>. */
export function FaqList({ items, className }: { items: FaqItem[]; className?: string }) {
  return (
    <div className={cn("divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface", className)}>
      {items.map((item) => (
        <details key={item.q} className="group px-5 py-1 sm:px-6 [&_summary::-webkit-details-marker]:hidden">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 font-semibold text-ink">
            <span>{item.q}</span>
            <Plus
              className="size-5 shrink-0 text-muted transition-transform duration-200 group-open:rotate-45"
              aria-hidden
            />
          </summary>
          <p className="pb-5 pr-8 leading-relaxed text-muted">{item.a}</p>
        </details>
      ))}
    </div>
  );
}
