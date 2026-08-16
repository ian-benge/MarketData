"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Panel } from "@/components/ui/Panel";
import { EmptyHint } from "@/components/ui/StatePanel";
import { LatestReportLine, type LatestReport } from "@/components/dashboard/LatestReportCard";
import type { JoinedMover } from "@/lib/market-data/overview-movers";
import { cn } from "@/lib/utils/cn";
import {
  formatPrice,
  formatRelativeVolume,
  formatSignedPercent,
  formatVolume,
  marketToneClass,
} from "@/lib/utils/format";

type SortKey = "change" | "rvol" | "volume" | "symbol";

const CAUSAL_LABEL: Record<JoinedMover["causalStatus"], string> = {
  confirmed: "Confirmed",
  reported: "Reported",
  inferred: "Inferred",
  unclear: "Unclear",
};

function causalTone(status: JoinedMover["causalStatus"]): "positive" | "info" | "warn" | "neutral" {
  if (status === "confirmed") return "positive";
  if (status === "reported") return "info";
  if (status === "inferred") return "warn";
  return "neutral";
}

export function MaterialMoversPanel({
  movers,
  selectedSymbol,
  onSelectSymbol,
  latestReport,
}: {
  movers: JoinedMover[];
  selectedSymbol?: string;
  onSelectSymbol?: (ticker: string) => void;
  latestReport?: LatestReport | null;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("change");
  const [descending, setDescending] = useState(true);
  const sorted = useMemo(() => {
    const next = [...movers];
    next.sort((a, b) => {
      let result = 0;
      if (sortKey === "symbol") result = a.ticker.localeCompare(b.ticker);
      if (sortKey === "change") result = Math.abs(a.changePercent) - Math.abs(b.changePercent);
      if (sortKey === "rvol") result = (a.relativeVolume ?? -1) - (b.relativeVolume ?? -1);
      if (sortKey === "volume") result = (a.volume ?? -1) - (b.volume ?? -1);
      return descending ? -result : result;
    });
    return next;
  }, [descending, movers, sortKey]);
  const notes = movers.find((row) => row.coverageNotes)?.coverageNotes ?? null;

  function toggle(next: SortKey) {
    if (sortKey === next) setDescending((value) => !value);
    else {
      setSortKey(next);
      setDescending(next !== "symbol");
    }
  }

  return (
    <Panel
      title="Material movers"
      description="Tracked-universe names that clear materiality — not a raw % sort of the tape"
      bodyClassName="p-0"
    >
      {sorted.length ? (
        <div
          className="max-h-[18rem] overflow-auto terminal-scroll"
          role="region"
          aria-label="Material movers"
        >
          <table className="w-full min-w-[28rem] border-collapse text-left text-[12px]">
            <caption className="sr-only">
              Material movers with last price, session change, relative volume, and catalyst status.
            </caption>
            <thead>
              <tr className="border-b border-[var(--ib-border-strong)] bg-[var(--ib-surface-2)] font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--ib-text-muted)]">
                {(
                  [
                    ["symbol", "Symbol", "left"],
                    ["change", "1d %", "right"],
                    ["rvol", "Rvol", "right"],
                    ["volume", "Volume", "right"],
                  ] as const
                ).map(([key, label, align]) => (
                  <th
                    key={key}
                    scope="col"
                    className={cn("sticky top-0 z-10 h-8 bg-[var(--ib-surface-2)] px-2.5 font-medium", align === "right" && "text-right")}
                  >
                    <button
                      type="button"
                      aria-pressed={sortKey === key}
                      aria-label={`Sort movers by ${label}`}
                      onClick={() => toggle(key)}
                      className="inline-flex items-center gap-1 uppercase tracking-[0.08em]"
                    >
                      {label}
                    </button>
                  </th>
                ))}
                <th className="sticky top-0 z-10 h-8 bg-[var(--ib-surface-2)] px-2.5 font-medium">
                  Catalyst
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((row) => {
                const selected = selectedSymbol?.toUpperCase() === row.ticker;
                return (
                  <tr
                    key={row.ticker}
                    className={cn(
                      "border-b border-[var(--ib-border-subtle)] last:border-0 hover:bg-[var(--ib-surface-hover)]",
                      onSelectSymbol && "cursor-pointer",
                      selected && "bg-[var(--ib-surface-selected)]",
                    )}
                    onClick={() => onSelectSymbol?.(row.ticker)}
                  >
                    <td className="h-9 px-2.5">
                      <button
                        type="button"
                        aria-label={`Select ${row.ticker}`}
                        aria-current={selected ? "true" : undefined}
                        className="font-mono font-medium text-[var(--ib-text-primary)] hover:text-[var(--ib-maroon-300)]"
                        onClick={() => onSelectSymbol?.(row.ticker)}
                      >
                        {row.ticker}
                      </button>
                      <span className="ml-2 font-mono text-[10px] text-[var(--ib-text-muted)]">
                        {formatPrice(row.last, row.ticker)}
                      </span>
                    </td>
                    <td className={cn("px-2.5 text-right font-mono", marketToneClass(row.changePercent))}>
                      {formatSignedPercent(row.changePercent)}
                    </td>
                    <td className="px-2.5 text-right font-mono text-[var(--ib-text-secondary)]">
                      {formatRelativeVolume(row.relativeVolume)}
                    </td>
                    <td className="px-2.5 text-right font-mono text-[var(--ib-text-secondary)]">
                      {formatVolume(row.volume)}
                    </td>
                    <td className="max-w-[12rem] px-2.5">
                      <div className="flex min-w-0 items-center gap-1.5">
                        <Badge tone={causalTone(row.causalStatus)}>
                          {CAUSAL_LABEL[row.causalStatus]}
                        </Badge>
                        {row.headlineTitle ? (
                          <span className="min-w-0 truncate text-[11px] text-[var(--ib-text-secondary)]" title={row.headlineTitle}>
                            {row.headlineTitle}
                          </span>
                        ) : (
                          <span className="text-[11px] text-[var(--ib-text-muted)]">No matching headline</span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div role="region" aria-label="Material movers">
          <EmptyHint className="py-8">
            No names currently clear material-mover thresholds for this universe.
          </EmptyHint>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--ib-border-subtle)] px-3 py-2">
        <p className="text-[10px] leading-4 text-[var(--ib-text-muted)]">
          {notes ?? "Materiality uses the same thresholds as research reports."}{" "}
          <Link href="/news" className="text-[var(--ib-maroon-300)] hover:underline">
            Open Material News
          </Link>
        </p>
        <LatestReportLine report={latestReport ?? null} />
      </div>
    </Panel>
  );
}
