"use client";

import { Panel } from "@/components/ui/Panel";
import type { HeatmapCell } from "@/lib/market-data/overview-analytics";
import { cn } from "@/lib/utils/cn";
import { formatSignedPercent, marketTone } from "@/lib/utils/format";

function cellFill(change: number | null) {
  if (change == null || change === 0) return "bg-[var(--ib-surface-2)]";
  const intensity = Math.min(Math.abs(change) / 1.5, 1);
  if (change > 0) {
    return intensity > 0.66
      ? "bg-[color-mix(in_oklab,var(--market-positive)_34%,var(--ib-surface-2))]"
      : intensity > 0.33
        ? "bg-[color-mix(in_oklab,var(--market-positive)_20%,var(--ib-surface-2))]"
        : "bg-[color-mix(in_oklab,var(--market-positive)_10%,var(--ib-surface-2))]";
  }
  return intensity > 0.66
    ? "bg-[color-mix(in_oklab,var(--market-negative)_34%,var(--ib-surface-2))]"
    : intensity > 0.33
      ? "bg-[color-mix(in_oklab,var(--market-negative)_20%,var(--ib-surface-2))]"
      : "bg-[color-mix(in_oklab,var(--market-negative)_10%,var(--ib-surface-2))]";
}

export function SectorHeatmap({
  cells,
  onSelectSymbol,
}: {
  cells: HeatmapCell[];
  onSelectSymbol?: (ticker: string) => void;
}) {
  return (
    <Panel
      title="Sector heatmap"
      description="Tape ∩ sector ETFs (+ SMH). Not a GICS industry map."
      bodyClassName="p-2"
    >
      {cells.length ? (
        <ul className="grid grid-cols-3 gap-1 sm:grid-cols-4">
          {cells.map((cell) => {
            const tone = marketTone(cell.changePercent);
            return (
              <li key={cell.key}>
                <button
                  type="button"
                  onClick={() => onSelectSymbol?.(cell.key)}
                  aria-label={`Open ${cell.key} in primary chart`}
                  className={cn(
                    "flex h-full min-h-14 w-full flex-col justify-between rounded-[4px] border border-[var(--ib-border-subtle)] px-1.5 py-1.5 text-left",
                    cellFill(cell.changePercent),
                  )}
                >
                  <span className="font-mono text-[9px] uppercase tracking-[0.08em] text-[var(--ib-text-muted)]">
                    {cell.key}
                  </span>
                  <span
                    className={cn(
                      "font-mono text-[11px] font-semibold",
                      tone === "positive"
                        ? "text-[var(--market-positive)]"
                        : tone === "negative"
                          ? "text-[var(--market-negative)]"
                          : "text-[var(--market-unchanged)]",
                    )}
                  >
                    {formatSignedPercent(cell.changePercent)}
                  </span>
                  <span className="truncate text-[9px] text-[var(--ib-text-secondary)]">
                    {cell.label}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="px-1 py-6 text-center text-[12px] text-[var(--ib-text-muted)]">
          Sector ETF prints are not on this tape.
        </p>
      )}
    </Panel>
  );
}
