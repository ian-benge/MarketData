"use client";

import type { TapeRow } from "@/lib/market-data/overview-analytics";
import { cn } from "@/lib/utils/cn";
import { formatSignedPercent, marketToneClass } from "@/lib/utils/format";

const FACTOR_FOCUS: Record<string, string> = {
  "factor-growth": "QQQ",
  "factor-size": "IWM",
  "factor-credit": "HYG",
};

export function FactorTape({
  tiles,
  onSelectSymbol,
}: {
  tiles: TapeRow[];
  onSelectSymbol?: (ticker: string) => void;
}) {
  if (!tiles.length) {
    return (
      <p
        aria-label="Factor spreads"
        className="text-[11px] leading-4 text-[var(--ib-text-muted)]"
      >
        Factor ETF spreads unavailable — QQQ, IWM, HYG, or LQD missing from this tape
        snapshot. Spreads are ETF proxies, not a cash curve or OAS.
      </p>
    );
  }
  return (
    <section
      aria-label="Factor spreads"
      className="grid gap-2 sm:grid-cols-3"
    >
      {tiles.map((tile) => {
        const ticker = FACTOR_FOCUS[tile.key];
        return (
          <button
            key={tile.key}
            type="button"
            disabled={!ticker || !onSelectSymbol}
            onClick={() => ticker && onSelectSymbol?.(ticker)}
            className="rounded-[4px] border border-[var(--ib-border-subtle)] bg-[var(--ib-surface-1)] px-2.5 py-1.5 text-left hover:border-[var(--ib-border-control)] disabled:cursor-default"
          >
            <span className="block font-mono text-[9px] uppercase tracking-[0.1em] text-[var(--ib-text-muted)]">
              {tile.label}
            </span>
            <span className={cn("mt-0.5 block font-mono text-[13px]", marketToneClass(tile.changePercent))}>
              {formatSignedPercent(tile.changePercent)}
            </span>
            <span className="mt-0.5 block text-[10px] text-[var(--ib-text-muted)]">
              ETF spread · not a cash curve or OAS
            </span>
          </button>
        );
      })}
    </section>
  );
}
