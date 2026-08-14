"use client";

import { Panel } from "@/components/ui/Panel";
import { DURATION_PROXY_ETFS } from "@/lib/market-data/market-pulse";
import type { NormalizedQuote } from "@/lib/providers/types";
import { cn } from "@/lib/utils/cn";
import { formatSignedPercent, marketTone } from "@/lib/utils/format";

export function DurationStack({
  quotes,
  onSelectSymbol,
}: {
  quotes: NormalizedQuote[];
  onSelectSymbol?: (ticker: string) => void;
}) {
  const byTicker = new Map(quotes.map((quote) => [quote.ticker.toUpperCase(), quote]));
  const rows = DURATION_PROXY_ETFS.map((ticker) => byTicker.get(ticker)).filter(
    (quote): quote is NormalizedQuote => Boolean(quote),
  );
  if (!rows.length) return null;
  return (
    <Panel
      title="Duration stack"
      description="ETF duration proxies, not CMT yields"
      bodyClassName="space-y-1 p-2"
    >
      {rows.map((quote) => {
        const tone = marketTone(quote.changePercent);
        return (
          <button
            key={quote.ticker}
            type="button"
            onClick={() => onSelectSymbol?.(quote.ticker)}
            className="flex w-full items-center justify-between rounded-[4px] border border-[var(--ib-border-subtle)] bg-[var(--ib-surface-inset)] px-2.5 py-1.5 text-left hover:border-[var(--ib-border-control)]"
            aria-label={`Open ${quote.ticker} in primary chart`}
          >
            <span className="font-mono text-[11px] text-[var(--ib-text-primary)]">
              {quote.ticker}
            </span>
            <span
              className={cn(
                "font-mono text-[11px]",
                tone === "positive"
                  ? "text-[var(--market-positive)]"
                  : tone === "negative"
                    ? "text-[var(--market-negative)]"
                    : "text-[var(--market-unchanged)]",
              )}
            >
              {formatSignedPercent(quote.changePercent)}
            </span>
          </button>
        );
      })}
    </Panel>
  );
}
