"use client";

import type { DashboardCoverageDigest } from "@/lib/watchlists/dashboard-digest";
import { cn } from "@/lib/utils/cn";
import { formatSignedPercent, marketToneClass } from "@/lib/utils/format";

type DeskSector = DashboardCoverageDigest["deskSectors"][number];

export function ThemeTape({
  sectors,
  selectedSectorId,
  onSelectSymbol,
  onSelectSector,
}: {
  sectors: DeskSector[];
  selectedSectorId?: string;
  onSelectSymbol?: (ticker: string) => void;
  onSelectSector?: (sectorId: string) => void;
}) {
  const themes = [...sectors]
    .filter((row) => row.kind === "theme" && row.quotedCount > 0)
    .sort(
      (a, b) => Math.abs(b.vsSpy1dPercent ?? 0) - Math.abs(a.vsSpy1dPercent ?? 0),
    )
    .slice(0, 8);
  if (!themes.length) return null;
  return (
    <section
      aria-label="Thematic leadership"
      className="rounded-[6px] border border-[var(--ib-border-subtle)] bg-[var(--ib-surface-1)] px-3 py-2"
    >
      <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-[var(--ib-text-muted)]">
        Themes vs SPY
      </p>
      <ul className="mt-1.5 flex flex-wrap gap-1.5">
        {themes.map((theme) => {
          const ticker = theme.displayTicker ?? theme.benchmarkSymbol ?? theme.leaders[0];
          const selected = selectedSectorId === theme.id;
          return (
            <li key={theme.id}>
              <button
                type="button"
                onClick={() => {
                  onSelectSector?.(theme.id);
                  if (ticker) onSelectSymbol?.(ticker);
                }}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-[3px] border px-2 py-1",
                  selected
                    ? "border-[var(--ib-maroon-500)] bg-[var(--ib-surface-selected)]"
                    : "border-[var(--ib-border-subtle)] bg-[var(--ib-surface-2)] hover:border-[var(--ib-border-control)]",
                )}
                aria-label={`Select theme ${theme.name}`}
              >
                <span className="text-[11px] text-[var(--ib-text-primary)]">{theme.name}</span>
                <span className={cn("font-mono text-[11px]", marketToneClass(theme.vsSpy1dPercent))}>
                  {formatSignedPercent(theme.vsSpy1dPercent)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
