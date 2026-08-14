"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Panel } from "@/components/ui/Panel";
import type { JoinedMover } from "@/lib/market-data/overview-movers";
import { cn } from "@/lib/utils/cn";
import {
  formatPrice,
  formatSignedPercent,
  formatVolume,
  marketTone,
} from "@/lib/utils/format";
import { LatestReportLine, type LatestReport } from "@/components/dashboard/LatestReportCard";

type SortKey = "symbol" | "change" | "last" | "volume";

export function MaterialMoversPanel({
  movers,
  coverageNotes,
  latestReport,
  onSelectSymbol,
}: {
  movers: JoinedMover[];
  coverageNotes?: string | null;
  latestReport?: LatestReport | null;
  onSelectSymbol?: (ticker: string) => void;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("change");
  const [descending, setDescending] = useState(true);

  const sorted = useMemo(() => {
    const next = [...movers];
    next.sort((a, b) => {
      let result = 0;
      if (sortKey === "symbol") result = a.ticker.localeCompare(b.ticker);
      if (sortKey === "change") {
        result = Math.abs(a.changePercent) - Math.abs(b.changePercent);
      }
      if (sortKey === "last") result = a.last - b.last;
      if (sortKey === "volume") result = (a.volume ?? -1) - (b.volume ?? -1);
      return descending ? -result : result;
    });
    return next;
  }, [descending, movers, sortKey]);

  function toggleSort(next: SortKey) {
    if (sortKey === next) setDescending((value) => !value);
    else {
      setSortKey(next);
      setDescending(next !== "symbol");
    }
  }

  const SortIcon = descending ? ArrowDown : ArrowUp;

  return (
    <Panel
      title="Material movers"
      description="Tracked-universe material prints, not a raw % sort"
      bodyClassName="p-0"
    >
      <div
        data-testid="material-movers"
        className="w-full min-w-0 overflow-x-auto terminal-scroll"
      >
        {sorted.length ? (
          <table className="w-full min-w-[420px] border-collapse text-left text-[12px]">
            <caption className="sr-only">
              Material movers with catalyst join. Select a symbol to inspect its chart.
            </caption>
            <thead>
              <tr className="border-b border-[var(--ib-border-strong)] bg-[var(--ib-surface-2)] font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--ib-text-muted)]">
                {(
                  [
                    ["symbol", "Symbol", "left"],
                    ["last", "Last", "right"],
                    ["change", "|1d|", "right"],
                    ["volume", "Volume", "right"],
                  ] as const
                ).map(([key, label, align]) => (
                  <th
                    key={key}
                    className={cn("h-8 px-3 font-medium", align === "right" && "text-right")}
                  >
                    <button
                      type="button"
                      onClick={() => toggleSort(key)}
                      aria-pressed={sortKey === key}
                      className="inline-flex items-center gap-1 uppercase tracking-[0.08em]"
                    >
                      {label}
                      {sortKey === key ? (
                        <SortIcon aria-hidden="true" className="size-3" />
                      ) : null}
                    </button>
                  </th>
                ))}
                <th className="h-8 px-3 font-medium">Catalyst</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((mover) => {
                const tone = marketTone(mover.changePercent);
                return (
                  <tr
                    key={mover.ticker}
                    className="border-b border-[var(--ib-border-subtle)] last:border-0 hover:bg-[var(--ib-surface-hover)]"
                  >
                    <td className="h-9 px-3">
                      <button
                        type="button"
                        onClick={() => onSelectSymbol?.(mover.ticker)}
                        className="font-mono font-medium text-[var(--ib-text-primary)] hover:text-[var(--ib-maroon-300)]"
                        aria-label={`Inspect ${mover.ticker} chart`}
                      >
                        {mover.ticker}
                      </button>
                    </td>
                    <td className="px-3 text-right font-mono">
                      {formatPrice(mover.last, mover.ticker)}
                    </td>
                    <td
                      className={cn(
                        "px-3 text-right font-mono",
                        tone === "positive"
                          ? "text-[var(--market-positive)]"
                          : tone === "negative"
                            ? "text-[var(--market-negative)]"
                            : "text-[var(--market-unchanged)]",
                      )}
                    >
                      {formatSignedPercent(mover.changePercent)}
                    </td>
                    <td className="px-3 text-right font-mono text-[var(--ib-text-secondary)]">
                      {formatVolume(mover.volume)}
                    </td>
                    <td className="px-3">
                      <div className="flex min-w-0 items-center gap-1.5">
                        <Badge
                          tone={mover.causalStatus === "reported" ? "info" : "neutral"}
                        >
                          {mover.causalStatus}
                        </Badge>
                        <span className="min-w-0 truncate text-[11px] text-[var(--ib-text-secondary)]">
                          {mover.headlineTitle ?? "No matching headline"}
                        </span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <p className="px-3 py-8 text-center text-[12px] text-[var(--ib-text-muted)]">
            No material movers on this snapshot.
          </p>
        )}
      </div>
      <div className="space-y-1 border-t border-[var(--ib-border-subtle)] px-3 py-2">
        {coverageNotes ? (
          <p className="text-[10px] leading-4 text-[var(--ib-text-muted)]">{coverageNotes}</p>
        ) : null}
        <LatestReportLine report={latestReport ?? null} />
      </div>
    </Panel>
  );
}
