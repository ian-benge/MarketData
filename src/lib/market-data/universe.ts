/**
 * Builds the refresh / movers universe from fixed seeds + injected lists.
 * Cap enforced via MARKET_DATA_MAX_UNIVERSE_SIZE (caller passes maxSize).
 */

import { marketPulseProxyEtfs } from "@/lib/market-data/market-pulse";

/** Major US index ETFs always preferred first. */
export const MAJOR_INDEX_ETFS = ["SPY", "QQQ", "DIA", "IWM"] as const;

/** Broad sector ETFs (Select Sector SPDR + peers). */
export const SECTOR_ETFS = [
  "XLK",
  "XLF",
  "XLE",
  "XLV",
  "XLI",
  "XLY",
  "XLP",
  "XLU",
  "XLB",
  "XLRE",
  "XLC",
  "SMH",
] as const;

/**
 * AI infrastructure seed list aligned with fixtures (AI stack / semis / power / DC).
 * Overridable via buildUniverse options.
 */
export const AI_INFRASTRUCTURE_TICKERS = [
  "NVDA",
  "AMD",
  "AVGO",
  "TSM",
  "INTC",
  "MU",
  "PLTR",
  "MSFT",
  "GOOGL",
  "AMZN",
  "META",
  "AAPL",
  "SMCI",
  "CEG",
  "VST",
  "EQIX",
  "DLR",
  "ANET",
  "CRWD",
] as const;

export type UniverseSourceKey =
  | "major_index_etfs"
  | "cross_asset_proxies"
  | "sector_etfs"
  | "ai_infrastructure"
  | "watchlist"
  | "report_in_progress";

export type UniverseBuildInput = {
  maxSize: number;
  watchlistSymbols?: readonly string[];
  reportInProgressSymbols?: readonly string[];
  /** Override default AI infrastructure seed. */
  aiInfrastructureSymbols?: readonly string[];
  sectorEtfSymbols?: readonly string[];
  majorIndexSymbols?: readonly string[];
  crossAssetSymbols?: readonly string[];
  /** Optional clock for tests. */
  now?: Date;
};

export type UniverseBuildResult = {
  requestedAt: string;
  symbols: string[];
  sources: Record<string, string[]>;
};

function normalizeSymbol(raw: string): string | null {
  const s = raw.trim().toUpperCase();
  if (!s || s.length > 16) return null;
  return s;
}

function uniqueNormalize(list: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of list) {
    const s = normalizeSymbol(raw);
    if (!s || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

/**
 * Priority order: major indices → sector ETFs → AI infra → watchlist → report-in-progress.
 * Within each source, order is preserved. Cap truncates lower-priority symbols first.
 */
export function buildUniverse(input: UniverseBuildInput): UniverseBuildResult {
  const requestedAt = (input.now ?? new Date()).toISOString();
  const maxSize = Math.max(1, Math.floor(input.maxSize));

  const sources: Record<UniverseSourceKey, string[]> = {
    major_index_etfs: uniqueNormalize(
      input.majorIndexSymbols ?? [...MAJOR_INDEX_ETFS],
    ),
    cross_asset_proxies: uniqueNormalize(
      input.crossAssetSymbols ?? [...marketPulseProxyEtfs()],
    ),
    sector_etfs: uniqueNormalize(input.sectorEtfSymbols ?? [...SECTOR_ETFS]),
    ai_infrastructure: uniqueNormalize(
      input.aiInfrastructureSymbols ?? [...AI_INFRASTRUCTURE_TICKERS],
    ),
    watchlist: uniqueNormalize(input.watchlistSymbols ?? []),
    report_in_progress: uniqueNormalize(input.reportInProgressSymbols ?? []),
  };

  const orderedKeys: UniverseSourceKey[] = [
    "major_index_etfs",
    "cross_asset_proxies",
    "sector_etfs",
    "ai_infrastructure",
    "watchlist",
    "report_in_progress",
  ];

  const seen = new Set<string>();
  const symbols: string[] = [];

  for (const key of orderedKeys) {
    for (const sym of sources[key]) {
      if (seen.has(sym)) continue;
      if (symbols.length >= maxSize) break;
      seen.add(sym);
      symbols.push(sym);
    }
    if (symbols.length >= maxSize) break;
  }

  return {
    requestedAt,
    symbols,
    sources: { ...sources },
  };
}
