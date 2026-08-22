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
  inline = false,
}: {
  tiles: TapeRow[];
  onSelectSymbol?: (ticker: string) => void;
  inline?: boolean;
}) {
  if (!tiles.length) {
    return (
      <p
        aria-label="Factor spreads"
        className={cn(
          "text-[11px] leading-4 text-[var(--ib-text-muted)]",
          inline && "px-3 py-2",
        )}
      >
        Factor ETF spreads unavailable — QQQ, IWM, HYG, or LQD missing from this tape
        snapshot. Spreads are ETF proxies, not a cash curve or OAS.
      </p>
    );
  }

  if (inline) {
    return (
      <section
        aria-label="Factor spreads"
        className="flex min-h-9 min-w-0 items-stretch border-t border-[var(--ib-border-subtle)]"
        title="ETF price spreads, not a cash Treasury curve or OAS"
      >
        <div className="flex shrink-0 items-center border-r border-[var(--ib-border-subtle)] bg-[var(--ib-surface-2)] px-3">
          <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.16em] text-[var(--ib-text-muted)]">
            Factors
          </p>
        </div>
        <ul className="flex min-w-0 flex-1 divide-x divide-[var(--ib-border-subtle)] overflow-x-auto terminal-scroll">
          {tiles.map((tile) => {
            const ticker = FACTOR_FOCUS[tile.key];
            return (
              <li key={tile.key} className="min-w-[7.5rem] flex-1">
                <button
                  type="button"
                  disabled={!ticker || !onSelectSymbol}
                  onClick={() => ticker && onSelectSymbol?.(ticker)}
                  className="flex h-full w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left hover:bg-[var(--ib-surface-hover)] disabled:cursor-default"
                >
                  <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--ib-text-muted)]">
                    {tile.label}
                  </span>
                  <span className={cn("font-mono text-[12px] tabular-nums", marketToneClass(tile.changePercent))}>
                    {formatSignedPercent(tile.changePercent)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>
    );
  }

  return (
    <section aria-label="Factor spreads" className="grid gap-2 sm:grid-cols-3">
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
          </button>
        );
      })}
      <p className="sm:col-span-3 text-[10px] leading-4 text-[var(--ib-text-muted)]">
        ETF price spreads, not a cash Treasury curve or OAS.
      </p>
    </section>
  );
}
