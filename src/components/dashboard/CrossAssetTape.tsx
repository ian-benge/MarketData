"use client";

import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";
import type { MarketPulseDriverId } from "@/lib/market-data/market-pulse";
import type { NormalizedQuote } from "@/lib/providers/types";
import { cn } from "@/lib/utils/cn";
import {
  formatMarketTime,
  formatPrice,
  formatSignedPercent,
  marketTone,
  marketToneClass,
} from "@/lib/utils/format";

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

type TapeItem = {
  group: TapeGroup;
  config: TapeTile;
  quote: NormalizedQuote;
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
    label: "Rates",
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
    label: "Cmdty",
    tiles: [
      { symbols: ["WTI", "USO"], short: "Oil", name: "Inflation impulse", meaning: "USO is an oil ETF proxy, not a WTI futures strip.", driver: "oil" },
      { symbols: ["XAU", "GLD"], short: "Gold", name: "Defensive demand", meaning: "Gold is tape context, not a scored Pulse driver.", driver: null },
      { symbols: ["IBIT"], short: "Bitcoin ETF", name: "Spot bitcoin proxy", meaning: "IBIT only. BTC-USD is not requested on the stocks path.", driver: null },
    ],
  },
];

function ToneIcon({ value }: { value: number | null | undefined }) {
  const tone = marketTone(value);
  const Icon =
    tone === "positive" ? ArrowUpRight : tone === "negative" ? ArrowDownRight : ArrowRight;
  return <Icon aria-hidden="true" className="size-3 shrink-0" />;
}

function TapeQuote({
  item,
  groupLabel,
  selected,
  highlighted,
  asOf,
  onSelectSymbol,
  onActiveDriver,
}: {
  item: TapeItem;
  groupLabel?: string | null;
  selected: boolean;
  highlighted: boolean;
  asOf?: string | null;
  onSelectSymbol?: (ticker: string) => void;
  onActiveDriver?: (driver: MarketPulseDriverId | null) => void;
}) {
  const { config, quote } = item;
  return (
    <li
      className="group relative flex shrink-0 items-center"
      onMouseEnter={() => onActiveDriver?.(config.driver)}
      onMouseLeave={() => onActiveDriver?.(null)}
      onFocus={() => onActiveDriver?.(config.driver)}
      onBlur={() => onActiveDriver?.(null)}
    >
      {groupLabel ? (
        <span className="px-2 font-mono text-[9px] uppercase tracking-[0.14em] text-[var(--ib-text-muted)]">
          {groupLabel}
        </span>
      ) : null}
      <button
        type="button"
        aria-pressed={selected}
        aria-label={`Select ${quote.ticker}`}
        title={`${quote.ticker} · ${config.short} · ${config.name}`}
        onClick={() => onSelectSymbol?.(quote.ticker)}
        className={cn(
          "flex items-center gap-1.5 rounded-[3px] px-2 py-1 font-mono text-[12px] transition-colors",
          selected
            ? "bg-[var(--ib-surface-selected)]"
            : highlighted
              ? "bg-[var(--ib-surface-2)]"
              : "hover:bg-[var(--ib-surface-hover)]",
        )}
      >
        <span className="font-semibold tracking-wide text-[var(--ib-text-primary)]">
          {quote.ticker}
        </span>
        <span
          className={cn(
            "inline-flex items-center gap-0.5 tabular-nums",
            marketToneClass(quote.changePercent),
          )}
        >
          <ToneIcon value={quote.changePercent} />
          {formatSignedPercent(quote.changePercent)}
        </span>
        <span className="hidden tabular-nums text-[10px] text-[var(--ib-text-muted)] xl:inline">
          {formatPrice(quote.last, quote.ticker)}
        </span>
      </button>
      <div
          role="tooltip"
          className="pointer-events-none absolute bottom-[calc(100%+8px)] left-1/2 z-20 hidden w-64 -translate-x-1/2 rounded-[5px] border border-[var(--ib-border-strong)] bg-[var(--ib-surface-3)] p-3 text-[10px] leading-4 text-[var(--ib-text-secondary)] shadow-[var(--shadow-float)] group-hover:block group-focus-within:block"
        >
          <p className="font-semibold text-[var(--ib-text-primary)]">
            {quote.ticker} · {config.short}
          </p>
          <p className="mt-0.5 text-[var(--ib-text-muted)]">{config.name}</p>
          <p className="mt-1">{config.meaning}</p>
          <dl className="mt-2 space-y-1 border-t border-[var(--ib-border-subtle)] pt-2 font-mono text-[9px]">
            <div className="flex justify-between gap-3">
              <dt>Last</dt>
              <dd>{formatPrice(quote.last, quote.ticker)}</dd>
            </div>
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
}

function TapeSequence({
  items,
  selectedSymbol,
  activeDriver,
  asOf,
  onSelectSymbol,
  onActiveDriver,
}: {
  items: TapeItem[];
  selectedSymbol?: string;
  activeDriver?: MarketPulseDriverId | null;
  asOf?: string | null;
  onSelectSymbol?: (ticker: string) => void;
  onActiveDriver?: (driver: MarketPulseDriverId | null) => void;
}) {
  return (
    <ul className="flex w-max min-w-full items-center gap-1 px-1">
      {items.map((item, index) => {
        const showGroup = index === 0 || item.group.id !== items[index - 1]?.group.id;
        return (
          <TapeQuote
            key={item.quote.ticker}
            item={item}
            groupLabel={showGroup ? item.group.label : null}
            selected={selectedSymbol === item.quote.ticker}
            highlighted={item.config.driver != null && activeDriver === item.config.driver}
            asOf={asOf}
            onSelectSymbol={onSelectSymbol}
            onActiveDriver={onActiveDriver}
          />
        );
      })}
    </ul>
  );
}

export function listCrossAssetTapeItems(quotes: NormalizedQuote[]): TapeItem[] {
  const byTicker = new Map(quotes.map((quote) => [quote.ticker.toUpperCase(), quote]));
  return TAPE_GROUPS.flatMap((group) =>
    group.tiles
      .map((config) => {
        const quote = config.symbols.map((symbol) => byTicker.get(symbol)).find(Boolean);
        return quote ? { group, config, quote } : null;
      })
      .filter((item): item is TapeItem => Boolean(item)),
  );
}

export function CrossAssetTape({
  quotes,
  asOf,
  selectedSymbol,
  onSelectSymbol,
  activeDriver,
  onActiveDriver,
}: {
  quotes: NormalizedQuote[];
  asOf?: string | null;
  marketSession?: string | null;
  selectedSymbol?: string;
  onSelectSymbol?: (ticker: string) => void;
  activeDriver?: MarketPulseDriverId | null;
  onActiveDriver?: (driver: MarketPulseDriverId | null) => void;
}) {
  const items = listCrossAssetTapeItems(quotes);

  if (!items.length) {
    return (
      <div className="flex h-9 items-center px-3">
        <p className="text-[11px] text-[var(--ib-text-muted)]">
          Cross-asset quotes are unavailable.
        </p>
      </div>
    );
  }

  return (
    <div
      className="terminal-scroll min-w-0 flex-1 overflow-x-auto overscroll-x-contain"
      role="region"
      aria-label="Cross-asset tape"
      title="Scroll to inspect each proxy · click a ticker to focus it"
    >
      <TapeSequence
        items={items}
        selectedSymbol={selectedSymbol}
        activeDriver={activeDriver}
        asOf={asOf}
        onSelectSymbol={onSelectSymbol}
        onActiveDriver={onActiveDriver}
      />
    </div>
  );
}
