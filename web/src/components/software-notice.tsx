import { brand } from "@shared/brand";
import { Notice, cn } from "@/components/ui";

function toolList(): string {
  const t = brand.software;
  return t.length <= 1 ? t.join("") : `${t.slice(0, -1).join(", ")} and ${t[t.length - 1]}`;
}

/** Tells visitors up front what is (and is not) taught, so nobody books expecting CapCut or other free apps. */
export function SoftwareNotice({ compact = false, className }: { compact?: boolean; className?: string }) {
  if (compact) {
    return (
      <p className={cn("text-sm font-semibold text-ink-soft", className)}>
        Taught in {toolList()}. Not a CapCut, Canva or free-app class.
      </p>
    );
  }
  return (
    <Notice tone="info" title="Professional software only" className={className}>
      These classes teach {toolList()}, the tools used in real studios. We do not teach CapCut, Canva or other free
      mobile and template-based apps. If that is what you are looking for, these classes are not the right fit.
    </Notice>
  );
}
