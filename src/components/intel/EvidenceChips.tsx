import type { EvidenceSource } from "@/lib/desk-intel/types";
import { cn } from "@/lib/utils/cn";

export function EvidenceChips({
  sourceIds,
  sources,
  compact = false,
}: {
  sourceIds: string[];
  sources: EvidenceSource[];
  compact?: boolean;
}) {
  if (!sourceIds.length) return null;
  const byId = new Map(sources.map((source) => [source.id, source]));
  return (
    <ul className={cn("inline-flex flex-wrap", compact ? "gap-1" : "gap-1.5")}>
      {sourceIds.map((id) => {
        const source = byId.get(id);
        if (!source) return null;
        return (
          <li key={id}>
            <a
              href={source.url}
              target="_blank"
              rel="noreferrer"
              className={cn(
                "inline-flex truncate rounded-[3px] border border-[var(--ib-border-subtle)] bg-[var(--ib-surface-2)] font-mono text-[var(--ib-maroon-300)] hover:border-[var(--ib-border-control)]",
                compact
                  ? "max-w-[9rem] px-1 py-px text-[9px] leading-4"
                  : "max-w-[14rem] px-1.5 py-0.5 text-[10px]",
              )}
              title={source.title}
            >
              {source.publisher ?? source.id}
            </a>
          </li>
        );
      })}
    </ul>
  );
}
