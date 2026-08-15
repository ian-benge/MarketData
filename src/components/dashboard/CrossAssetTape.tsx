"use client";

import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";
import type { MarketPulseDriverId } from "@/lib/market-data/market-pulse";
import type { NormalizedQuote } from "@/lib/providers/types";
import { cn } from "@/lib/utils/cn";
import { formatMarketTime, formatPrice, formatSignedPercent, marketTone, marketToneBarClass, marketToneClass } from "@/lib/utils/format";

type TapeTile = {
  symbols: string[];
  short: string;
  name: string;
  meaning: string;
  driver: MarketPulseDriverId | null;
};

type TapeGroup = {
  id: string;
  label: string;
  tiles: TapeTile[];
};

const TAPE_GROUPS: TapeGroup[] = [
  {
    id: "index",
    label: "Index",
    tiles: [
      { symbols: ["SPY", "ES"], short: "U.S. Equity", name: "Broad risk", meaning: "Broad U.S. equity direction anchors the risk-appetite read.", driver: "equity" },
      { symbols: ["QQQ"], short: "Growth / Beta", name: "Duration equity", meaning: "Growth participation tests higher-duration and higher-beta appetite.", driver: "beta" },
      { symbols: ["IWM"], short: "Small cap", name: "Risk appetite", meaning: "Russell 2000 participation. Not a Pulse-scored driver.", driver: null },
      { symbols: ["DIA"], short: "Dow", name: "Cyclical beta", meaning: "Dow proxy for cyclical / price-weighted beta. Not a Pulse-scored driver.", driver: null },
    ],
  },
  {
    id: "rates-credit",
    label: "Rates / credit",
    tiles: [
      { symbols: ["TLT"], short: "Rates", name: "Long duration", meaning: "TLT is the available duration proxy; a cash Treasury curve is not present in this payload.", driver: "rates" },
      { symbols: ["HYG"], short: "HY credit", name: "High yield", meaning: "HYG is an ETF price, not an OAS spread.", driver: "credit" },
      { symbols: ["LQD"], short: "IG credit", name: "Investment grade", meaning: "LQD is an ETF price, not a credit-spread series.", driver: null },
    ],
  },
  {
    id: "vol-fx",
    label: "Vol / FX",
    tiles: [
      { symbols: ["VIX", "VIXY"], short: "Vol proxy", name: "Equity risk pricing", meaning: "VIXY is an investable volatility proxy, not VIX futures or term structure.", driver: "volatility" },
      { symbols: ["DXY", "UUP"], short: "Dollar", name: "Financial conditions", meaning: "UUP is the available dollar ETF. EURUSD is not on this tape.", driver: "dollar" },
    ],
  },
  {
    id: "commodity",
    label: "Commodity / crypto",
    tiles: [
      { symbols: ["WTI", "USO"], short: "Oil", name: "Inflation impulse", meaning: "USO is an oil ETF proxy, not a WTI futures strip.", driver: "oil" },
      { symbols: ["XAU", "GLD"], short: "Gold", name: "Defensive demand", meaning: "Gold is tape context, not a scored Pulse driver.", driver: null },
      { symbols: ["IBIT"], short: "Bitcoin ETF", name: "Spot bitcoin proxy", meaning: "IBIT only. BTC-USD is not requested on the stocks path.", driver: null },
    ],
  },
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
  const groups = TAPE_GROUPS.map((group) => ({
    ...group,
    tiles: group.tiles
      .map((config) => ({ config, quote: config.symbols.map((symbol) => byTicker.get(symbol)).find(Boolean) }))
      .filter((item): item is { config: TapeTile; quote: NormalizedQuote } => Boolean(item.quote)),
  })).filter((group) => group.tiles.length);

  if (!groups.length) {
    return (
      <div className="rounded-[6px] border border-dashed border-[var(--ib-border-strong)] bg-[var(--ib-surface-inset)] px-4 py-8 text-center">
        <p className="text-[12px] text-[var(--ib-text-secondary)]">Cross-asset quotes are unavailable.</p>
        <p className="mt-1 text-[10px] text-[var(--ib-text-muted)]">The Pulse score and tape remain withheld until verified session data arrives.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {groups.map((group) => (
        <div key={group.id}>
          <p className="mb-1.5 font-mono text-[9px] uppercase tracking-[0.12em] text-[var(--ib-text-muted)]">
            {group.label}
          </p>
          <ul className="grid grid-cols-2 gap-1.5 md:grid-cols-4">
            {group.tiles.map(({ config, quote }) => {
              const tone = marketTone(quote.changePercent);
              const Icon = tone === "positive" ? ArrowUpRight : tone === "negative" ? ArrowDownRight : ArrowRight;
              const selected = selectedSymbol === quote.ticker;
              const highlighted = config.driver != null && activeDriver === config.driver;
              return (
                <li
                  key={quote.ticker}
                  className="group relative min-w-0"
                  onMouseEnter={() => onActiveDriver?.(config.driver)}
                  onMouseLeave={() => onActiveDriver?.(null)}
                  onFocus={() => onActiveDriver?.(config.driver)}
                  onBlur={() => onActiveDriver?.(null)}
                >
                  <button
                    type="button"
                    aria-pressed={selected}
                    aria-label={`Select ${quote.ticker}`}
                    onClick={() => onSelectSymbol?.(quote.ticker)}
                    className={cn(
                      "relative h-full min-h-[92px] w-full overflow-hidden rounded-[6px] border bg-[var(--ib-surface-inset)] p-2.5 text-left transition-[border-color,background-color]",
                      selected
                        ? "border-[var(--ib-maroon-500)] bg-[var(--ib-surface-selected)]"
                        : highlighted
                          ? "border-[var(--ib-text-muted)] bg-[var(--ib-surface-2)]"
                          : "border-[var(--ib-border-subtle)] hover:border-[var(--ib-border-control)] hover:bg-[var(--ib-surface-hover)]",
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className={cn("absolute inset-y-0 left-0 w-0.5", marketToneBarClass(quote.changePercent))}
                    />
                    <div className="flex items-start justify-between gap-2 pl-1">
                      <div className="min-w-0">
                        <p className="truncate font-mono text-[9px] uppercase tracking-[0.08em] text-[var(--ib-text-muted)]">{config.short}</p>
                        <p className="mt-0.5 truncate text-[10px] text-[var(--ib-text-secondary)]">{config.name}</p>
                      </div>
                      <span className="rounded-[3px] border border-[var(--ib-border-strong)] px-1.5 py-0.5 font-mono text-[8px] text-[var(--ib-text-muted)]">
                        {sessionBadge(quote, marketSession)}
                      </span>
                    </div>
                    <div className="mt-2.5 flex items-end justify-between gap-2 pl-1">
                      <div>
                        <p className="font-mono text-[11px] font-semibold text-[var(--ib-text-primary)]">
                          {quote.ticker} <span className="text-[14px] tabular-nums">{formatPrice(quote.last, quote.ticker)}</span>
                        </p>
                        <p
                          className={cn(
                            "mt-1 inline-flex items-center gap-1 font-mono text-[10px]",
                            marketToneClass(quote.changePercent),
                          )}
                        >
                          <Icon className="size-3" />
                          {formatSignedPercent(quote.changePercent)}
                        </p>
                      </div>
                    </div>
                  </button>
                  <div
                    role="tooltip"
                    className="pointer-events-none absolute bottom-[calc(100%+6px)] left-0 z-20 hidden w-64 rounded-[5px] border border-[var(--ib-border-strong)] bg-[var(--ib-surface-3)] p-3 text-[10px] leading-4 text-[var(--ib-text-secondary)] shadow-[var(--shadow-float)] group-hover:block group-focus-within:block"
                  >
                    <p className="font-semibold text-[var(--ib-text-primary)]">
                      {quote.ticker} · {config.short}
                    </p>
                    <p className="mt-1">{config.meaning}</p>
                    <dl className="mt-2 space-y-1 border-t border-[var(--ib-border-subtle)] pt-2 font-mono text-[9px]">
                      <div className="flex justify-between gap-3">
                        <dt>Source</dt>
                        <dd className="truncate">{quote.providerName}</dd>
                      </div>
                      <div className="flex justify-between gap-3">
                        <dt>Timestamp</dt>
                        <dd>{formatMarketTime(quote.providerTimestamp || asOf)}</dd>
                      </div>
                      <div className="flex justify-between gap-3">
                        <dt>Coverage</dt>
                        <dd className="truncate">
                          {quote.sourceQuality} · {quote.delayStatus}
                        </dd>
                      </div>
                    </dl>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
