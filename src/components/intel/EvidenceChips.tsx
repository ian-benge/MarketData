import type { EvidenceSource } from "@/lib/desk-intel/types";

export function EvidenceChips({
  sourceIds,
  sources,
}: {
  sourceIds: string[];
  sources: EvidenceSource[];
}) {
  if (!sourceIds.length) return null;
  const byId = new Map(sources.map((source) => [source.id, source]));
  return (
    <ul className="flex flex-wrap gap-1.5">
      {sourceIds.map((id) => {
        const source = byId.get(id);
        if (!source) return null;
        return (
          <li key={id}>
            <a
              href={source.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex max-w-[14rem] truncate rounded-[3px] border border-[var(--ib-border-subtle)] bg-[var(--ib-surface-2)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--ib-maroon-300)] hover:border-[var(--ib-border-control)]"
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
