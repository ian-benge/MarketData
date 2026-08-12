"use client";

import { ArrowDownRight, ArrowRight, ArrowUpRight, Info } from "lucide-react";
import type { MarketPulseDriverId } from "@/lib/market-data/market-pulse";
import type { NormalizedQuote } from "@/lib/providers/types";
import { cn } from "@/lib/utils/cn";
import { formatMarketTime, formatPrice, formatSignedPercent, marketTone } from "@/lib/utils/format";

const TAPE_CONFIG: Array<{ symbols: string[]; short: string; name: string; meaning: string; driver: MarketPulseDriverId | null; core?: boolean }> = [
  { symbols: ["SPY", "ES"], short: "U.S. Equity", name: "Broad risk", meaning: "Broad U.S. equity direction anchors the risk-appetite read.", driver: "equity", core: true },
  { symbols: ["QQQ"], short: "Growth / Beta", name: "Duration equity", meaning: "Growth participation tests higher-duration and higher-beta appetite.", driver: "beta", core: true },
  { symbols: ["SMH", "SOXX"], short: "Semis", name: "Cyclical leadership", meaning: "Semiconductor relative strength can confirm technology and cyclical leadership.", driver: "semis" },
  { symbols: ["TLT"], short: "Rates", name: "Long duration", meaning: "TLT is the available duration proxy; a 10Y yield is not present in this payload.", driver: "rates", core: true },
  { symbols: ["VIX", "VIXY"], short: "Volatility", name: "Equity risk pricing", meaning: "VIXY is an investable volatility proxy when the VIX index is unavailable.", driver: "volatility", core: true },
  { symbols: ["DXY", "UUP"], short: "Dollar", name: "Financial conditions", meaning: "Dollar strength can signal tighter global financial conditions.", driver: "dollar" },
  { symbols: ["WTI", "USO"], short: "Oil", name: "Inflation impulse", meaning: "Oil can reflect the inflation and geopolitical impulse.", driver: "oil" },
  { symbols: ["XAU", "GLD"], short: "Gold", name: "Defensive demand", meaning: "Gold reflects defensive demand and real-rate sensitivity; it is tape context, not a scored driver.", driver: null },
];

function sessionBadge(quote: NormalizedQuote, marketSession?: string | null) {
  const session = marketSession ?? quote.marketSession;
  if (session === "premarket") return "PRE";
  if (session === "regular") return "RTH";
  if (session === "afterhours") return "AH";
  return "EOD";
}

export function CrossAssetTape({ quotes, asOf, marketSession, selectedSymbol, onSelectSymbol, activeDriver, onActiveDriver }: { quotes: NormalizedQuote[]; asOf?: string | null; marketSession?: string | null; selectedSymbol?: string; onSelectSymbol?: (ticker: string) => void; activeDriver?: MarketPulseDriverId | null; onActiveDriver?: (driver: MarketPulseDriverId | null) => void }) {
  const byTicker = new Map(quotes.map((quote) => [quote.ticker.toUpperCase(), quote]));
  const tiles = TAPE_CONFIG.map((config) => ({ config, quote: config.symbols.map((symbol) => byTicker.get(symbol)).find(Boolean) })).filter((item): item is { config: (typeof TAPE_CONFIG)[number]; quote: NormalizedQuote } => Boolean(item.quote)).slice(0, 8);
  if (!tiles.length) return <div className="rounded-[6px] border border-dashed border-[var(--ib-border-strong)] bg-[var(--ib-surface-inset)] px-4 py-10 text-center"><p className="text-[12px] text-[var(--ib-text-secondary)]">Cross-asset quotes are unavailable.</p><p className="mt-1 text-[10px] text-[var(--ib-text-muted)]">The Pulse score and tape remain withheld until verified session data arrives.</p></div>;
  return (
    <ul className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-12">
      {tiles.map(({ config, quote }) => {
        const tone = marketTone(quote.changePercent);
        const Icon = tone === "positive" ? ArrowUpRight : tone === "negative" ? ArrowDownRight : ArrowRight;
        const selected = selectedSymbol === quote.ticker;
        const highlighted = config.driver != null && activeDriver === config.driver;
        return (
          <li key={quote.ticker} className={cn("group relative min-w-0", config.core ? "xl:col-span-3" : "xl:col-span-3")} onMouseEnter={() => onActiveDriver?.(config.driver)} onMouseLeave={() => onActiveDriver?.(null)} onFocus={() => onActiveDriver?.(config.driver)} onBlur={() => onActiveDriver?.(null)}>
            <button type="button" aria-pressed={selected} aria-label={`Open ${quote.ticker} in primary chart`} onClick={() => onSelectSymbol?.(quote.ticker)} className={cn("h-full min-h-[102px] w-full rounded-[6px] border bg-[var(--ib-surface-inset)] p-3 text-left transition-[border-color,background-color]", selected ? "border-[var(--ib-maroon-500)] bg-[var(--ib-surface-selected)]" : highlighted ? "border-[var(--ib-text-muted)] bg-[var(--ib-surface-2)]" : "border-[var(--ib-border-subtle)] hover:border-[var(--ib-border-control)]")}>
              <div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="truncate font-mono text-[9px] uppercase tracking-[0.08em] text-[var(--ib-text-muted)]">{config.short}</p><p className="mt-0.5 truncate text-[10px] text-[var(--ib-text-secondary)]">{config.name}</p></div><span className="rounded-[3px] border border-[var(--ib-border-strong)] px-1.5 py-0.5 font-mono text-[8px] text-[var(--ib-text-muted)]">{sessionBadge(quote, marketSession)}</span></div>
              <div className="mt-3 flex items-end justify-between gap-2"><div><p className="font-mono text-[11px] font-semibold text-[var(--ib-text-primary)]">{quote.ticker} <span className="text-[14px]">{formatPrice(quote.last, quote.ticker)}</span></p><p className={cn("mt-1 inline-flex items-center gap-1 font-mono text-[10px]", tone === "positive" ? "text-[var(--market-positive)]" : tone === "negative" ? "text-[var(--market-negative)]" : "text-[var(--market-unchanged)]")}><Icon className="size-3" />{formatSignedPercent(quote.changePercent)}</p></div><Info className="size-3 text-[var(--ib-text-muted)]" /></div>
            </button>
            <div role="tooltip" className="pointer-events-none absolute bottom-[calc(100%+6px)] left-0 z-20 hidden w-64 rounded-[5px] border border-[var(--ib-border-strong)] bg-[var(--ib-surface-3)] p-3 text-[10px] leading-4 text-[var(--ib-text-secondary)] shadow-[var(--shadow-float)] group-hover:block group-focus-within:block"><p className="font-semibold text-[var(--ib-text-primary)]">{quote.ticker} · {config.short}</p><p className="mt-1">{config.meaning}</p><dl className="mt-2 space-y-1 border-t border-[var(--ib-border-subtle)] pt-2 font-mono text-[9px]"><div className="flex justify-between gap-3"><dt>Source</dt><dd className="truncate">{quote.providerName}</dd></div><div className="flex justify-between gap-3"><dt>Timestamp</dt><dd>{formatMarketTime(quote.providerTimestamp || asOf)}</dd></div><div className="flex justify-between gap-3"><dt>Coverage</dt><dd className="truncate">{quote.sourceQuality} · {quote.delayStatus}</dd></div></dl></div>
          </li>
        );
      })}
    </ul>
  );
}
