"use client";

import { Panel } from "@/components/ui/Panel";
import type { TapeRow } from "@/lib/market-data/overview-analytics";
import { cn } from "@/lib/utils/cn";
import { formatSignedPercent, marketTone } from "@/lib/utils/format";

export function FactorTape({
  rows,
  onSelectSymbol,
}: {
  rows: TapeRow[];
  onSelectSymbol?: (ticker: string) => void;
}) {
  return (
    <Panel
      title="Factor spreads"
      description="Session % minus session %. Not a price."
      bodyClassName="grid grid-cols-1 gap-1 p-2 sm:grid-cols-3"
    >
      {rows.length ? (
        rows.map((row) => {
          const tone = marketTone(row.changePercent);
          const ticker = row.key === "factor-growth" ? "QQQ" : row.key === "factor-size" ? "IWM" : "HYG";
          return (
            <button
              key={row.key}
              type="button"
              onClick={() => onSelectSymbol?.(ticker)}
              className="rounded-[4px] border border-[var(--ib-border-subtle)] bg-[var(--ib-surface-inset)] px-2.5 py-2 text-left hover:border-[var(--ib-border-control)]"
              aria-label={`Open ${ticker} in primary chart`}
            >
              <p className="font-mono text-[9px] uppercase tracking-[0.08em] text-[var(--ib-text-muted)]">
                {row.label}
              </p>
              <p
                className={cn(
                  "mt-1 font-mono text-[13px] font-semibold",
                  tone === "positive"
                    ? "text-[var(--market-positive)]"
                    : tone === "negative"
                      ? "text-[var(--market-negative)]"
                      : "text-[var(--market-unchanged)]",
                )}
              >
                {formatSignedPercent(row.changePercent)}
              </p>
            </button>
          );
        })
      ) : (
        <p className="col-span-full px-1 py-4 text-center text-[12px] text-[var(--ib-text-muted)]">
          Factor legs are not both printing.
        </p>
      )}
    </Panel>
  );
}
