"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Panel } from "@/components/ui/Panel";
import { EmptyHint } from "@/components/ui/StatePanel";
import type { MoveExplanation } from "@/lib/intelligence/types";
import type { JoinedMover } from "@/lib/market-data/overview-movers";
import { cn } from "@/lib/utils/cn";
import {
  formatPrice,
  formatSignedPercent,
  formatVolume,
  marketToneClass,
} from "@/lib/utils/format";
import { LatestReportLine, type LatestReport } from "@/components/dashboard/LatestReportCard";
import { MoveNarrativeLoader } from "@/components/intel/MoveNarrativeLoader";

type SortKey = "symbol" | "change" | "last" | "volume";

function explanationFromMover(
  mover?: JoinedMover,
): MoveExplanation | undefined {
  if (!mover?.attribution) return undefined;
  return {
    ticker: mover.ticker,
    significant: true,
    changePercent: mover.changePercent,
    relativeVolume: mover.relativeVolume,
    session: null,
    flags: [],
    direction: mover.direction,
    attribution: mover.attribution,
    confidence: mover.confidence ?? "unknown",
    evidenceNature: mover.evidenceNature ?? "inference",
    causalStatus: mover.causalStatus,
    headline: mover.headlineTitle ?? "Unknown catalyst",
    detail: mover.headlineTitle ?? "",
    supportingEvents: [],
    relatedTickers: [],
    themes: [],
    window: { start: "", end: "", label: "session" },
    coverageGap: mover.coverageNotes,
  };
}

export function MaterialMoversPanel({
  movers,
  coverageNotes,
  latestReport,
  onSelectSymbol,
  selectedSymbol,
}: {
  movers: JoinedMover[];
  coverageNotes?: string | null;
  latestReport?: LatestReport | null;
  onSelectSymbol?: (ticker: string) => void;
  selectedSymbol?: string;
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
              Material movers with catalyst join. Select a symbol to highlight it.
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
                    className={cn(
                      "sticky top-0 z-10 h-8 bg-[var(--ib-surface-2)] px-3 font-medium",
                      align === "right" && "text-right",
                    )}
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
                <th className="sticky top-0 z-10 h-8 bg-[var(--ib-surface-2)] px-3 font-medium">
                  Catalyst
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((mover) => {
                const selected =
                  selectedSymbol?.toUpperCase() === mover.ticker.toUpperCase();
                return (
                  <tr
                    key={mover.ticker}
                    className={cn(
                      "border-b border-[var(--ib-border-subtle)] last:border-0 hover:bg-[var(--ib-surface-hover)]",
                      onSelectSymbol && "cursor-pointer",
                      selected && "bg-[var(--ib-surface-selected)]",
                    )}
                    onClick={() => onSelectSymbol?.(mover.ticker)}
                  >
                    <td className="h-9 px-3">
                      <button
                        type="button"
                        onClick={() => onSelectSymbol?.(mover.ticker)}
                        className="inline-flex min-h-8 max-sm:min-h-11 items-center font-mono font-medium text-[var(--ib-text-primary)] hover:text-[var(--ib-maroon-300)]"
                        aria-current={selected ? "true" : undefined}
                        aria-label={`Select ${mover.ticker}`}
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
                        marketToneClass(mover.changePercent),
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
                          tone={
                            mover.causalStatus === "confirmed"
                              ? "positive"
                              : mover.causalStatus === "inferred"
                                ? "warn"
                                : mover.causalStatus === "reported"
                                  ? "info"
                                  : "neutral"
                          }
                        >
                          {mover.confidence ?? mover.causalStatus}
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
          <EmptyHint>No material movers on this snapshot.</EmptyHint>
        )}
      </div>
      <div className="space-y-1 border-t border-[var(--ib-border-subtle)] px-3 py-2">
        {selectedSymbol ? (
          <div className="mb-2">
            <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--ib-text-muted)]">
              Why {selectedSymbol} is moving
            </p>
            <MoveNarrativeLoader
              ticker={selectedSymbol}
              explanation={explanationFromMover(
                sorted.find((row) => row.ticker === selectedSymbol),
              )}
            />
          </div>
        ) : null}
        {coverageNotes ? (
          <p className="text-[10px] leading-4 text-[var(--ib-text-muted)]">{coverageNotes}</p>
        ) : null}
        <LatestReportLine report={latestReport ?? null} />
      </div>
    </Panel>
  );
}
