"use client";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyHint } from "@/components/ui/StatePanel";
import {
  catalystLabel,
  catalystTone,
  formatFloatShares,
  formatHodGap,
  haltMark,
  newsFreshnessLabel,
  type ScannerSort,
} from "@/lib/scanner/display";
import type { RankedScannerRow } from "@/lib/scanner/types";
import { cn } from "@/lib/utils/cn";
import {
  formatCompactCurrency,
  formatPrice,
  formatRelativeVolume,
  formatSignedPercent,
  marketToneClass,
} from "@/lib/utils/format";

const COLUMNS: Array<{
  key: string;
  header: string;
  title?: string;
  align?: "right";
  priority?: "always" | "medium" | "wide" | "ultra";
}> = [
  { key: "rank", header: "#", priority: "ultra" },
  { key: "ticker", header: "Sym" },
  { key: "last", header: "Last", align: "right" },
  { key: "changeClose", header: "Chg", title: "Change vs prior close", align: "right" },
  { key: "rvol", header: "RVOL", align: "right" },
  { key: "dollarVolume", header: "$Vol", align: "right", priority: "medium" },
  { key: "changeOpen", header: "Opn", title: "Change vs open", align: "right", priority: "wide" },
  { key: "velocity", header: "Vel", title: "5-minute velocity", align: "right", priority: "wide" },
  { key: "float", header: "Float", align: "right", priority: "ultra" },
  { key: "hod", header: "HOD", title: "Distance from the session high", align: "right", priority: "ultra" },
  { key: "news", header: "News", priority: "medium" },
  { key: "catalyst", header: "Why" },
  { key: "opportunity", header: "Opp", title: "Opportunity vs risk score", align: "right" },
];

function priorityClass(priority: "always" | "medium" | "wide" | "ultra" | undefined) {
  if (priority === "medium") return "hidden xl:table-cell";
  if (priority === "wide" || priority === "ultra") return "hidden 2xl:table-cell";
  return undefined;
}

export function ScannerTable({
  rows,
  selected,
  pins,
  sort,
  onSelect,
  onSort,
  emptyHint,
  jump,
}: {
  rows: RankedScannerRow[];
  selected: string;
  pins: string[];
  sort: ScannerSort;
  onSelect: (ticker: string) => void;
  onSort: (key: string) => void;
  emptyHint?: string;
  jump?: { title: string; hits: number; onClick: () => void } | null;
}) {
  const pinned = new Set(pins);
  return (
    <div className="min-h-0 flex-1 overflow-auto terminal-scroll" role="region" aria-label="Ranked scanner list">
      <table className="w-full border-collapse text-left text-[12px] tabular-nums">
        <thead>
          <tr className="border-b border-[var(--ib-border-strong)] bg-[var(--ib-surface-2)] font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--ib-text-muted)]">
            {COLUMNS.map((column) => {
              const active = sort.key === column.key;
              return (
                <th
                  key={column.key}
                  scope="col"
                  title={column.title}
                  className={cn(
                    "sticky top-0 z-10 h-8 whitespace-nowrap bg-[var(--ib-surface-2)] px-1.5 font-medium",
                    column.key === "ticker" && "sticky left-0 z-20",
                    column.align === "right" && "text-right",
                    priorityClass(column.priority),
                  )}
                >
                  <button
                    type="button"
                    onClick={() => onSort(column.key)}
                    className={cn(
                      "inline-flex items-center gap-1 hover:text-[var(--ib-text-primary)]",
                      column.align === "right" && "w-full justify-end",
                      active && "text-[var(--ib-text-primary)]",
                    )}
                    aria-pressed={active}
                  >
                    {column.header}
                    {active ? (
                      <span aria-hidden="true">{sort.dir === "asc" ? "↑" : "↓"}</span>
                    ) : null}
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={COLUMNS.length}>
                <div className="px-3 py-6">
                  <EmptyHint className="!py-4">
                    {emptyHint ?? "No names meet this strategy and the active filters."}
                  </EmptyHint>
                  {jump ? (
                    <div className="mt-3">
                      <Button size="sm" onClick={jump.onClick}>
                        Open {jump.title} ({jump.hits.toString().padStart(2, "0")})
                      </Button>
                    </div>
                  ) : null}
                </div>
              </td>
            </tr>
          ) : (
            rows.map((row) => {
              const halt = haltMark(row.haltStatus);
              const isSelected = selected === row.ticker;
              const stickyBg = isSelected
                ? "bg-[var(--ib-surface-selected)]"
                : halt
                  ? "bg-[color-mix(in_oklab,var(--state-warning)_8%,var(--ib-surface-1))]"
                  : "bg-[var(--ib-surface-1)] group-hover:bg-[var(--ib-surface-hover)]";
              return (
                <tr
                  key={row.ticker}
                  data-ticker={row.ticker}
                  aria-selected={isSelected}
                  className={cn(
                    "group h-[34px] cursor-pointer border-b border-[var(--ib-border-subtle)] hover:bg-[var(--ib-surface-hover)]",
                    isSelected && "bg-[var(--ib-surface-selected)]",
                    halt && "bg-[color-mix(in_oklab,var(--state-warning)_8%,transparent)]",
                    row.stale && "opacity-70",
                  )}
                  onClick={() => onSelect(row.ticker)}
                >
                  <td className={cn("px-1.5 font-mono text-[11px] text-[var(--ib-text-muted)]", priorityClass("ultra"))}>
                    {row.rank}
                  </td>
                  <td className={cn("sticky left-0 z-[1] px-1.5 whitespace-nowrap", stickyBg)}>
                    <button
                      type="button"
                      className="font-mono text-[13px] font-semibold text-[var(--ib-text-primary)]"
                      aria-label={`Select ${row.ticker}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        onSelect(row.ticker);
                      }}
                    >
                      {row.ticker}
                    </button>
                    {pinned.has(row.ticker) ? (
                      <span className="ml-1 text-[9px] text-[var(--ib-maroon-300)]">PIN</span>
                    ) : null}
                    {row.inPosition ? (
                      <span className="ml-1 text-[9px] text-[var(--ib-maroon-300)]">BK</span>
                    ) : null}
                    {row.inWatchlist && !row.inPosition ? (
                      <span className="ml-1 text-[9px] text-[var(--ib-text-muted)]">WL</span>
                    ) : null}
                    {halt ? (
                      <span
                        className="ml-0.5 text-[9px] font-medium text-[var(--state-warning)]"
                        title={row.haltReason ?? (halt === "HALT" ? "Halted" : "Resumed")}
                        aria-label={halt === "HALT" ? "Halted" : "Resumed"}
                      >
                        {halt === "HALT" ? "HLT" : "RSM"}
                      </span>
                    ) : null}
                  </td>
                  <td className="whitespace-nowrap px-1.5 text-right font-mono">{formatPrice(row.last, row.ticker)}</td>
                  <td
                    className={cn(
                      "whitespace-nowrap px-1.5 text-right font-mono",
                      marketToneClass(row.changeFromClosePct),
                    )}
                  >
                    {formatSignedPercent(row.changeFromClosePct)}
                  </td>
                  <td className="whitespace-nowrap px-1.5 text-right font-mono">
                    {formatRelativeVolume(row.relativeVolume)}
                  </td>
                  <td className={cn("whitespace-nowrap px-1.5 text-right font-mono", priorityClass("medium"))}>
                    {formatCompactCurrency(row.dollarVolume)}
                  </td>
                  <td
                    className={cn(
                      "whitespace-nowrap px-1.5 text-right font-mono",
                      priorityClass("wide"),
                      marketToneClass(row.changeFromOpenPct),
                    )}
                  >
                    {formatSignedPercent(row.changeFromOpenPct)}
                  </td>
                  <td
                    className={cn(
                      "whitespace-nowrap px-1.5 text-right font-mono",
                      priorityClass("wide"),
                      marketToneClass(row.velocity5mPct),
                    )}
                  >
                    {formatSignedPercent(row.velocity5mPct)}
                  </td>
                  <td className={cn("whitespace-nowrap px-1.5 text-right font-mono", priorityClass("ultra"))}>
                    {formatFloatShares(row.floatShares)}
                  </td>
                  <td className={cn("whitespace-nowrap px-1.5 text-right font-mono", priorityClass("ultra"))}>
                    {formatHodGap(row.distanceFromHodPct)}
                  </td>
                  <td className={cn("px-1.5", priorityClass("medium"))}>
                    {row.newsFreshness === "none" ? (
                      <span className="text-[var(--ib-text-muted)]">—</span>
                    ) : (
                      <Badge tone="info" title={newsFreshnessLabel(row.newsFreshness)}>
                        {newsFreshnessLabel(row.newsFreshness, true)}
                      </Badge>
                    )}
                  </td>
                  <td className="max-w-[6.5rem] truncate px-1.5">
                    <Badge
                      tone={catalystTone(row.catalystKind)}
                      title={row.haltReason ? `${row.catalystSummary} · ${row.haltReason}` : row.catalystSummary}
                    >
                      {catalystLabel(row.catalystKind, true)}
                    </Badge>
                  </td>
                  <td className="whitespace-nowrap px-1.5 text-right">
                    <span className="font-mono tabular-nums">
                      <span className="text-[var(--market-positive)]">{row.opportunity.total.toFixed(0)}</span>
                      <span className="text-[var(--ib-text-muted)]">/</span>
                      <span className="text-[var(--state-warning)]">{row.risk.total.toFixed(0)}</span>
                    </span>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
