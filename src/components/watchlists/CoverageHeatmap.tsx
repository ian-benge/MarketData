"use client";

import { Panel } from "@/components/ui/Panel";
import { heatmapFill, PercentText } from "@/components/watchlists/display";
import { cn } from "@/lib/utils/cn";
import { KIND_LABELS, NAV_GROUPS, NAV_GROUP_LABELS } from "@/lib/watchlists/taxonomy";
import type { CoverageQuote, SectorBoardRow } from "@/lib/watchlists/types";

export function CoverageHeatmap({
  rows,
  onSelect,
}: {
  rows: CoverageQuote[];
  onSelect: (ticker: string) => void;
}) {
  return (
    <Panel
      title="Coverage heatmap"
      description="Tiles sized equally; color is 1D %. Click a name to inspect."
      bodyClassName="p-2"
    >
      {rows.length ? (
        <ul className="grid grid-cols-3 gap-1 sm:grid-cols-4 lg:grid-cols-6">
          {rows.map((row) => (
            <li key={row.ticker}>
              <button
                type="button"
                onClick={() => onSelect(row.ticker)}
                className={cn(
                  "flex h-full min-h-14 w-full flex-col justify-between rounded-[4px] border border-[var(--ib-border-subtle)] px-1.5 py-1.5 text-left",
                  heatmapFill(row.change1dPercent),
                )}
              >
                <span className="font-mono text-[10px] text-[var(--ib-text-primary)]">
                  {row.ticker}
                </span>
                <PercentText value={row.change1dPercent} className="text-[11px] font-semibold" />
                <span className="truncate text-[9px] text-[var(--ib-text-muted)]">
                  {row.sectorName ?? row.name ?? "—"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-1 py-6 text-center text-[12px] text-[var(--ib-text-muted)]">
          No constituents in this coverage set.
        </p>
      )}
    </Panel>
  );
}

export function SectorHeatmapBoard({
  rows,
  selectedId,
  onSelect,
}: {
  rows: SectorBoardRow[];
  selectedId?: string | null;
  onSelect: (id: string) => void;
}) {
  const visible = rows.filter(
    (row) =>
      row.kind !== "screen" || row.quotedCount > 0 || row.id === selectedId,
  );
  const grouped = NAV_GROUPS.map((group) => ({
    group,
    rows: visible.filter((row) => row.navGroup === group),
  })).filter((entry) => entry.rows.length);

  return (
    <Panel
      title="Sector / theme leadership"
      description="Equal-weight 1D of constituents vs SPY, grouped by coverage desk. Screens with no matches stay off the map."
      bodyClassName="p-2"
    >
      {grouped.length ? (
        <ul
          aria-label="Sector heatmap"
          className="grid grid-cols-2 gap-1 sm:grid-cols-3 lg:grid-cols-4"
        >
          {grouped.flatMap((entry) => [
            <li
              key={`g-${entry.group}`}
              className="col-span-full pt-1 font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--ib-text-muted)] first:pt-0"
            >
              {NAV_GROUP_LABELS[entry.group]}
            </li>,
            ...entry.rows.map((row) => (
              <li key={row.id}>
                <button
                  type="button"
                  onClick={() => onSelect(row.id)}
                  aria-pressed={selectedId === row.id}
                  className={cn(
                    "flex h-full min-h-[4.5rem] w-full flex-col justify-between rounded-[4px] border px-2 py-1.5 text-left",
                    selectedId === row.id
                      ? "border-[var(--ib-border-control)]"
                      : "border-[var(--ib-border-subtle)]",
                    heatmapFill(row.avg1dPercent),
                  )}
                >
                  <span className="truncate text-[12px] font-medium text-[var(--ib-text-primary)]">
                    {row.name}
                  </span>
                  <PercentText value={row.avg1dPercent} className="text-[12px] font-semibold" />
                  <span className="font-mono text-[9px] text-[var(--ib-text-muted)]">
                    {KIND_LABELS[row.kind]} · {row.quotedCount}/{row.symbolCount}
                    {row.vsSpy1dPercent == null ? "" : ` · vs SPY ${row.vsSpy1dPercent.toFixed(2)}`}
                  </span>
                </button>
              </li>
            )),
          ])}
        </ul>
      ) : (
        <p className="px-1 py-6 text-center text-[12px] text-[var(--ib-text-muted)]">
          No sector baskets are configured.
        </p>
      )}
    </Panel>
  );
}
