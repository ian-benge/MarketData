import { getEnv } from "@/lib/env";
import { fixturesEnabled } from "@/lib/api/http";
import { toCanonicalSymbol } from "@/lib/market-data/earnings/symbols";
import {
  fetchYahooEquityQuotes,
  fetchYahooSparkDailyCloses,
} from "@/lib/market-data/earnings/yahoo";
import { getMarketDataCache } from "@/lib/market-data/cache";
import { assembleWatchlistRows } from "@/lib/market-data/watchlist-assemble";
import type {
  WatchlistEnrichment,
  WatchlistQuoteInput,
} from "@/lib/market-data/watchlist-types";
import type { NormalizedQuote } from "@/lib/providers/types";
import {
  closeSessionsAgo,
  priorYearClose,
  realizedVolPercent,
} from "./analytics";
import { seedInstrumentRow } from "./instrument-catalog";
import type { CoverageQuote } from "./types";

const QUOTE_TTL_MS = 60 * 1000;
const SPARK_TTL_MS = 60 * 60 * 1000;

type CacheEntry<T> = { expiresAt: number; value: T };

const enrichmentCache = new Map<string, CacheEntry<WatchlistEnrichment>>();
const sparkCache = new Map<string, CacheEntry<WatchlistEnrichment>>();

export function resetCoverageQuoteCache() {
  enrichmentCache.clear();
  sparkCache.clear();
}

type YahooQuoteHit = {
  name: string | null;
  price?: number | null;
  marketCap: number | null;
  avgVolume: number | null;
  changePercent?: number | null;
  open?: number | null;
  volume?: number | null;
  previousClose?: number | null;
  dayHigh?: number | null;
  dayLow?: number | null;
  preMarketChangePercent?: number | null;
  postMarketChangePercent?: number | null;
};

export type CoverageQuoteDeps = {
  now?: Date;
  tape?: NormalizedQuote[];
  yahooQuotes?: (symbols: string[]) => Promise<Map<string, YahooQuoteHit>>;
  yahooSpark?: (
    symbols: string[],
  ) => Promise<Map<string, Array<{ date: string; close: number }>>>;
};

const FIXTURE_QUOTES: Array<
  WatchlistQuoteInput & WatchlistEnrichment & { changePercent?: number | null }
> = [
  { ticker: "SPY", last: 562.4, open: 560.8, changePercent: 0.41, volume: 48_200_000, name: "SPDR S&P 500", marketCap: 580_000_000_000, avgVolume: 52_000_000, weekAgoClose: 554.2, monthAgoClose: 548.1, ytdClose: 512.4, volatility: 12.4, previousClose: 560.1 },
  { ticker: "QQQ", last: 492.15, open: 489.4, changePercent: 0.66, volume: 32_100_000, name: "Invesco QQQ", marketCap: 310_000_000_000, avgVolume: 36_000_000, weekAgoClose: 484.1, monthAgoClose: 471.2, ytdClose: 432.8, volatility: 16.1 },
  { ticker: "IWM", last: 221.3, open: 219.9, changePercent: 0.68, volume: 28_400_000, name: "iShares Russell 2000", marketCap: 68_000_000_000, avgVolume: 30_000_000, weekAgoClose: 217.4, monthAgoClose: 214.8, ytdClose: 208.2, volatility: 18.6 },
  { ticker: "TLT", last: 93.4, open: 94.05, changePercent: -0.74, volume: 22_000_000, name: "iShares 20+ Year Treasury", marketCap: 52_000_000_000, avgVolume: 24_000_000, weekAgoClose: 94.8, monthAgoClose: 96.1, ytdClose: 91.4, volatility: 14.2 },
  { ticker: "GLD", last: 238.5, open: 237.2, changePercent: 0.68, volume: 7_800_000, name: "SPDR Gold Shares", marketCap: 72_000_000_000, avgVolume: 8_200_000, weekAgoClose: 234.6, monthAgoClose: 228.4, ytdClose: 191.2, volatility: 15.8 },
  { ticker: "USO", last: 76.2, open: 75.6, changePercent: 1.06, volume: 4_500_000, name: "United States Oil Fund", marketCap: 1_200_000_000, avgVolume: 4_800_000, weekAgoClose: 74.9, monthAgoClose: 72.1, ytdClose: 70.4, volatility: 28.4 },
  { ticker: "NVDA", last: 131.4, open: 128.9, changePercent: 1.94, volume: 210_000_000, name: "NVIDIA", marketCap: 3_200_000_000_000, avgVolume: 180_000_000, weekAgoClose: 126.8, monthAgoClose: 118.4, ytdClose: 98.6, volatility: 42.1, preMarketChangePercent: 0.42 },
  { ticker: "MSFT", last: 428.1, open: 426.4, changePercent: 0.52, volume: 18_400_000, name: "Microsoft", marketCap: 3_180_000_000_000, avgVolume: 21_000_000, weekAgoClose: 422.5, monthAgoClose: 414.2, ytdClose: 378.4, volatility: 18.2 },
  { ticker: "AAPL", last: 227.3, open: 225.8, changePercent: 0.81, volume: 41_200_000, name: "Apple", marketCap: 3_410_000_000_000, avgVolume: 48_000_000, weekAgoClose: 223.1, monthAgoClose: 218.6, ytdClose: 192.4, volatility: 19.4 },
  { ticker: "AMD", last: 162.7, open: 158.2, changePercent: 2.84, volume: 55_000_000, name: "Advanced Micro Devices", marketCap: 263_000_000_000, avgVolume: 48_000_000, weekAgoClose: 156.4, monthAgoClose: 148.2, ytdClose: 122.8, volatility: 38.6, preMarketChangePercent: 1.12 },
  { ticker: "AVGO", last: 301.2, open: 298.5, changePercent: 1.12, volume: 12_800_000, name: "Broadcom", marketCap: 1_410_000_000_000, avgVolume: 14_000_000, weekAgoClose: 294.2, monthAgoClose: 278.4, ytdClose: 231.6, volatility: 34.2 },
  { ticker: "TSM", last: 178.4, open: 176.1, changePercent: 0.94, volume: 9_600_000, name: "TSMC", marketCap: 926_000_000_000, avgVolume: 10_500_000, weekAgoClose: 174.8, monthAgoClose: 168.2, ytdClose: 142.1, volatility: 29.4 },
  { ticker: "PLTR", last: 41.8, open: 40.9, changePercent: 2.21, volume: 38_000_000, name: "Palantir", marketCap: 96_000_000_000, avgVolume: 42_000_000, weekAgoClose: 39.6, monthAgoClose: 36.4, ytdClose: 24.8, volatility: 48.2 },
  { ticker: "CEG", last: 278.3, open: 272.4, changePercent: 2.87, volume: 3_480_000, name: "Constellation Energy", marketCap: 87_000_000_000, avgVolume: 1_900_000, weekAgoClose: 268.1, monthAgoClose: 244.6, ytdClose: 186.4, volatility: 36.8 },
  { ticker: "EQIX", last: 812.0, open: 808.5, changePercent: 0.44, volume: 420_000, name: "Equinix", marketCap: 77_000_000_000, avgVolume: 480_000, weekAgoClose: 805.2, monthAgoClose: 792.4, ytdClose: 748.1, volatility: 16.4 },
  { ticker: "INTC", last: 22.4, open: 22.8, changePercent: -1.84, volume: 62_000_000, name: "Intel", marketCap: 96_000_000_000, avgVolume: 58_000_000, weekAgoClose: 23.1, monthAgoClose: 24.6, ytdClose: 19.8, volatility: 41.2 },
  { ticker: "MU", last: 112.6, open: 110.2, changePercent: 1.64, volume: 18_400_000, name: "Micron", marketCap: 125_000_000_000, avgVolume: 16_200_000, weekAgoClose: 108.4, monthAgoClose: 102.1, ytdClose: 86.4, volatility: 39.6 },
  { ticker: "ASML", last: 842.1, open: 836.4, changePercent: 0.72, volume: 1_120_000, name: "ASML", marketCap: 332_000_000_000, avgVolume: 980_000, weekAgoClose: 828.4, monthAgoClose: 804.2, ytdClose: 712.6, volatility: 28.1 },
  { ticker: "AMAT", last: 188.4, open: 186.1, changePercent: 1.08, volume: 5_400_000, name: "Applied Materials", marketCap: 156_000_000_000, avgVolume: 5_100_000, weekAgoClose: 184.2, monthAgoClose: 176.8, ytdClose: 158.4, volatility: 31.4 },
  { ticker: "LRCX", last: 92.4, open: 90.8, changePercent: 1.42, volume: 8_200_000, name: "Lam Research", marketCap: 118_000_000_000, avgVolume: 7_600_000, weekAgoClose: 89.6, monthAgoClose: 84.2, ytdClose: 72.1, volatility: 33.8 },
  { ticker: "KLAC", last: 764.2, open: 758.1, changePercent: 0.86, volume: 780_000, name: "KLA", marketCap: 102_000_000_000, avgVolume: 720_000, weekAgoClose: 748.6, monthAgoClose: 722.4, ytdClose: 628.1, volatility: 30.2 },
  { ticker: "COHR", last: 92.1, open: 88.4, changePercent: 3.62, volume: 4_800_000, name: "Coherent", marketCap: 14_200_000_000, avgVolume: 2_100_000, weekAgoClose: 86.2, monthAgoClose: 78.4, ytdClose: 64.8, volatility: 52.4 },
  { ticker: "LITE", last: 58.4, open: 56.8, changePercent: 2.18, volume: 1_640_000, name: "Lumentum", marketCap: 4_100_000_000, avgVolume: 1_200_000, weekAgoClose: 55.1, monthAgoClose: 51.6, ytdClose: 44.2, volatility: 44.8 },
  { ticker: "AAOI", last: 24.8, open: 23.1, changePercent: 6.12, volume: 8_400_000, name: "Applied Optoelectronics", marketCap: 1_100_000_000, avgVolume: 3_200_000, weekAgoClose: 21.4, monthAgoClose: 18.6, ytdClose: 14.2, volatility: 78.4 },
  { ticker: "CIEN", last: 84.6, open: 83.2, changePercent: 1.22, volume: 2_100_000, name: "Ciena", marketCap: 12_000_000_000, avgVolume: 1_800_000, weekAgoClose: 81.4, monthAgoClose: 76.8, ytdClose: 62.4, volatility: 36.2 },
  { ticker: "FN", last: 246.1, open: 241.4, changePercent: 1.84, volume: 620_000, name: "Fabrinet", marketCap: 8_900_000_000, avgVolume: 480_000, weekAgoClose: 238.6, monthAgoClose: 224.1, ytdClose: 186.4, volatility: 34.8 },
  { ticker: "GOOGL", last: 176.4, open: 174.8, changePercent: 0.92, volume: 22_400_000, name: "Alphabet", marketCap: 2_160_000_000_000, avgVolume: 24_000_000, weekAgoClose: 172.1, monthAgoClose: 168.4, ytdClose: 142.6, volatility: 24.1 },
  { ticker: "AMZN", last: 184.2, open: 182.6, changePercent: 0.74, volume: 38_600_000, name: "Amazon", marketCap: 1_940_000_000_000, avgVolume: 42_000_000, weekAgoClose: 180.4, monthAgoClose: 176.2, ytdClose: 154.8, volatility: 26.4 },
  { ticker: "META", last: 512.8, open: 508.4, changePercent: 1.06, volume: 14_200_000, name: "Meta Platforms", marketCap: 1_300_000_000_000, avgVolume: 15_800_000, weekAgoClose: 498.2, monthAgoClose: 482.6, ytdClose: 412.4, volatility: 28.6 },
  { ticker: "ORCL", last: 142.6, open: 141.1, changePercent: 0.84, volume: 8_600_000, name: "Oracle", marketCap: 392_000_000_000, avgVolume: 9_200_000, weekAgoClose: 138.4, monthAgoClose: 132.8, ytdClose: 118.2, volatility: 27.4 },
  { ticker: "DLR", last: 164.2, open: 163.4, changePercent: 0.38, volume: 1_840_000, name: "Digital Realty", marketCap: 54_000_000_000, avgVolume: 1_920_000, weekAgoClose: 161.8, monthAgoClose: 158.4, ytdClose: 148.6, volatility: 18.2 },
  { ticker: "AMT", last: 198.4, open: 199.6, changePercent: -0.42, volume: 2_100_000, name: "American Tower", marketCap: 92_000_000_000, avgVolume: 2_400_000, weekAgoClose: 201.2, monthAgoClose: 204.6, ytdClose: 186.4, volatility: 19.8 },
  { ticker: "CCI", last: 104.2, open: 105.1, changePercent: -0.68, volume: 2_640_000, name: "Crown Castle", marketCap: 45_000_000_000, avgVolume: 2_800_000, weekAgoClose: 106.4, monthAgoClose: 108.2, ytdClose: 98.6, volatility: 21.4 },
  { ticker: "IRM", last: 98.6, open: 97.4, changePercent: 1.12, volume: 1_420_000, name: "Iron Mountain", marketCap: 29_000_000_000, avgVolume: 1_360_000, weekAgoClose: 96.2, monthAgoClose: 92.8, ytdClose: 84.1, volatility: 22.6 },
  { ticker: "VST", last: 162.4, open: 158.2, changePercent: 3.12, volume: 8_400_000, name: "Vistra", marketCap: 56_000_000_000, avgVolume: 6_200_000, weekAgoClose: 154.6, monthAgoClose: 142.8, ytdClose: 98.4, volatility: 44.2 },
  { ticker: "NEE", last: 74.2, open: 74.8, changePercent: -0.54, volume: 9_200_000, name: "NextEra Energy", marketCap: 152_000_000_000, avgVolume: 10_400_000, weekAgoClose: 75.1, monthAgoClose: 76.4, ytdClose: 68.2, volatility: 18.6 },
  { ticker: "CTRA", last: 26.4, open: 26.1, changePercent: 0.92, volume: 6_800_000, name: "Coterra", marketCap: 19_400_000_000, avgVolume: 7_200_000, weekAgoClose: 25.8, monthAgoClose: 25.1, ytdClose: 23.6, volatility: 26.8 },
  { ticker: "LNG", last: 186.2, open: 184.6, changePercent: 0.78, volume: 1_640_000, name: "Cheniere", marketCap: 42_000_000_000, avgVolume: 1_720_000, weekAgoClose: 182.4, monthAgoClose: 176.8, ytdClose: 162.4, volatility: 24.2 },
  { ticker: "SMR", last: 18.6, open: 17.4, changePercent: 5.42, volume: 14_200_000, name: "NuScale Power", marketCap: 2_400_000_000, avgVolume: 8_600_000, weekAgoClose: 16.8, monthAgoClose: 14.2, ytdClose: 11.4, volatility: 92.4 },
  { ticker: "OKLO", last: 12.8, open: 12.1, changePercent: 4.18, volume: 9_800_000, name: "Oklo", marketCap: 1_600_000_000, avgVolume: 6_400_000, weekAgoClose: 11.6, monthAgoClose: 9.8, ytdClose: 7.2, volatility: 88.6 },
  { ticker: "SNOW", last: 128.4, open: 126.8, changePercent: 1.28, volume: 5_200_000, name: "Snowflake", marketCap: 42_000_000_000, avgVolume: 5_600_000, weekAgoClose: 124.2, monthAgoClose: 118.6, ytdClose: 154.2, volatility: 41.8 },
  { ticker: "DDOG", last: 118.6, open: 116.4, changePercent: 1.64, volume: 4_100_000, name: "Datadog", marketCap: 39_000_000_000, avgVolume: 3_800_000, weekAgoClose: 114.2, monthAgoClose: 108.4, ytdClose: 96.8, volatility: 38.4 },
  { ticker: "NET", last: 82.4, open: 80.6, changePercent: 1.92, volume: 3_400_000, name: "Cloudflare", marketCap: 28_000_000_000, avgVolume: 3_100_000, weekAgoClose: 78.8, monthAgoClose: 74.2, ytdClose: 64.6, volatility: 42.6 },
  { ticker: "CRWD", last: 268.4, open: 264.1, changePercent: 1.48, volume: 3_800_000, name: "CrowdStrike", marketCap: 66_000_000_000, avgVolume: 3_600_000, weekAgoClose: 258.6, monthAgoClose: 246.2, ytdClose: 212.4, volatility: 36.8 },
  { ticker: "MDB", last: 246.8, open: 251.4, changePercent: -1.84, volume: 1_920_000, name: "MongoDB", marketCap: 18_000_000_000, avgVolume: 1_640_000, weekAgoClose: 254.2, monthAgoClose: 262.8, ytdClose: 232.4, volatility: 44.2 },
  { ticker: "PATH", last: 12.4, open: 12.6, changePercent: -1.12, volume: 8_200_000, name: "UiPath", marketCap: 6_800_000_000, avgVolume: 7_400_000, weekAgoClose: 12.8, monthAgoClose: 13.2, ytdClose: 14.6, volatility: 48.6 },
  { ticker: "NOW", last: 842.6, open: 836.4, changePercent: 0.68, volume: 1_120_000, name: "ServiceNow", marketCap: 174_000_000_000, avgVolume: 1_240_000, weekAgoClose: 828.4, monthAgoClose: 804.2, ytdClose: 762.8, volatility: 26.4 },
  { ticker: "SMH", last: 248.6, open: 244.2, changePercent: 1.64, volume: 7_200_000, name: "VanEck Semiconductor", marketCap: 22_000_000_000, avgVolume: 6_800_000, weekAgoClose: 241.4, monthAgoClose: 228.6, ytdClose: 198.4, volatility: 32.8 },
  { ticker: "XLK", last: 226.4, open: 224.8, changePercent: 0.72, volume: 5_400_000, name: "Technology Select Sector", marketCap: 68_000_000_000, avgVolume: 5_800_000, weekAgoClose: 222.6, monthAgoClose: 216.4, ytdClose: 192.8, volatility: 18.4 },
  { ticker: "XLF", last: 44.8, open: 44.6, changePercent: 0.32, volume: 38_200_000, name: "Financial Select Sector", marketCap: 42_000_000_000, avgVolume: 40_000_000, weekAgoClose: 44.2, monthAgoClose: 43.6, ytdClose: 41.2, volatility: 16.2 },
  { ticker: "XLE", last: 92.4, open: 91.8, changePercent: 0.84, volume: 14_600_000, name: "Energy Select Sector", marketCap: 36_000_000_000, avgVolume: 15_200_000, weekAgoClose: 91.1, monthAgoClose: 89.4, ytdClose: 84.6, volatility: 22.4 },
  { ticker: "XLV", last: 148.2, open: 148.6, changePercent: -0.22, volume: 6_800_000, name: "Health Care Select Sector", marketCap: 38_000_000_000, avgVolume: 7_200_000, weekAgoClose: 149.1, monthAgoClose: 150.4, ytdClose: 142.6, volatility: 12.8 },
  { ticker: "XLI", last: 134.6, open: 133.8, changePercent: 0.48, volume: 8_400_000, name: "Industrial Select Sector", marketCap: 18_000_000_000, avgVolume: 8_800_000, weekAgoClose: 132.4, monthAgoClose: 128.6, ytdClose: 118.2, volatility: 15.6 },
  { ticker: "XLY", last: 198.4, open: 196.8, changePercent: 0.68, volume: 4_200_000, name: "Consumer Discretionary Select", marketCap: 22_000_000_000, avgVolume: 4_600_000, weekAgoClose: 194.2, monthAgoClose: 188.6, ytdClose: 172.4, volatility: 19.2 },
  { ticker: "XLP", last: 82.1, open: 82.4, changePercent: -0.28, volume: 9_600_000, name: "Consumer Staples Select", marketCap: 16_000_000_000, avgVolume: 10_200_000, weekAgoClose: 82.8, monthAgoClose: 83.4, ytdClose: 78.6, volatility: 11.4 },
  { ticker: "XLU", last: 74.8, open: 75.2, changePercent: -0.46, volume: 12_400_000, name: "Utilities Select Sector", marketCap: 14_000_000_000, avgVolume: 13_100_000, weekAgoClose: 75.6, monthAgoClose: 76.2, ytdClose: 68.4, volatility: 14.8 },
  { ticker: "XLB", last: 92.6, open: 92.1, changePercent: 0.38, volume: 4_800_000, name: "Materials Select Sector", marketCap: 5_600_000_000, avgVolume: 5_200_000, weekAgoClose: 91.4, monthAgoClose: 89.8, ytdClose: 84.2, volatility: 16.8 },
  { ticker: "XLRE", last: 42.8, open: 42.6, changePercent: 0.24, volume: 5_600_000, name: "Real Estate Select Sector", marketCap: 6_400_000_000, avgVolume: 6_000_000, weekAgoClose: 42.4, monthAgoClose: 41.8, ytdClose: 39.6, volatility: 17.2 },
  { ticker: "XLC", last: 96.4, open: 95.8, changePercent: 0.62, volume: 3_800_000, name: "Communication Services Select", marketCap: 18_000_000_000, avgVolume: 4_100_000, weekAgoClose: 94.6, monthAgoClose: 92.2, ytdClose: 82.8, volatility: 16.4 },
];

function fixtureMaps(symbols: string[]) {
  const quotes = new Map<string, WatchlistQuoteInput>();
  const enrichment = new Map<string, WatchlistEnrichment>();
  for (const row of FIXTURE_QUOTES) {
    quotes.set(row.ticker, {
      ticker: row.ticker,
      last: row.last,
      open: row.open,
      changePercent: row.changePercent,
      volume: row.volume,
    });
    enrichment.set(row.ticker, {
      name: row.name,
      marketCap: row.marketCap,
      avgVolume: row.avgVolume,
      weekAgoClose: row.weekAgoClose,
      monthAgoClose: row.monthAgoClose,
      ytdClose: row.ytdClose,
      preMarketChangePercent: row.preMarketChangePercent,
      afterHoursChangePercent: row.afterHoursChangePercent,
      dayHigh: row.dayHigh,
      dayLow: row.dayLow,
      previousClose: row.previousClose,
      volatility: row.volatility,
    });
  }
  return { quotes, enrichment, symbols };
}

function quoteInputs(quotes: NormalizedQuote[]): Map<string, WatchlistQuoteInput> {
  const map = new Map<string, WatchlistQuoteInput>();
  for (const quote of quotes) {
    const ticker = toCanonicalSymbol(quote.ticker) ?? quote.ticker.toUpperCase();
    map.set(ticker, {
      ticker,
      last: quote.last,
      open: quote.open ?? null,
      changePercent: quote.changePercent ?? null,
      volume: quote.volume ?? null,
    });
  }
  return map;
}

function mergeQuoteInput(
  existing: WatchlistQuoteInput | undefined,
  incoming: WatchlistQuoteInput,
): WatchlistQuoteInput {
  if (!existing || existing.last == null) return incoming;
  return {
    ticker: existing.ticker,
    last: existing.last,
    open: existing.open ?? incoming.open ?? null,
    changePercent: existing.changePercent ?? incoming.changePercent ?? null,
    volume: existing.volume ?? incoming.volume ?? null,
  };
}

async function defaultYahooQuotes(symbols: string[]) {
  const quotes = await fetchYahooEquityQuotes(symbols);
  const out = new Map<string, YahooQuoteHit>();
  for (const [symbol, quote] of quotes) {
    out.set(symbol, {
      name: quote.name,
      price: quote.price,
      marketCap: quote.marketCap,
      avgVolume: quote.avgVolume,
      changePercent: quote.changePercent ?? null,
      open: quote.open ?? null,
      volume: quote.volume ?? null,
      previousClose: quote.previousClose ?? null,
      dayHigh: quote.dayHigh ?? null,
      dayLow: quote.dayLow ?? null,
      preMarketChangePercent: quote.preMarketChangePercent ?? null,
      postMarketChangePercent: quote.postMarketChangePercent ?? null,
    });
  }
  return out;
}

async function loadYahooEnrichment(
  symbols: string[],
  deps: CoverageQuoteDeps,
): Promise<{
  map: Map<string, WatchlistEnrichment>;
  prints: Map<string, WatchlistQuoteInput>;
  stale: boolean;
  error: string | null;
}> {
  const now = deps.now?.getTime() ?? Date.now();
  const map = new Map<string, WatchlistEnrichment>();
  const prints = new Map<string, WatchlistQuoteInput>();
  const missingQuotes: string[] = [];
  const missingSpark: string[] = [];
  let stale = false;

  for (const symbol of symbols) {
    const quoteHit = enrichmentCache.get(symbol);
    const sparkHit = sparkCache.get(symbol);
    const extra: WatchlistEnrichment = {};
    if (quoteHit && quoteHit.expiresAt > now) Object.assign(extra, quoteHit.value);
    else {
      missingQuotes.push(symbol);
      if (quoteHit) {
        Object.assign(extra, quoteHit.value);
        stale = true;
      }
    }
    const sparkUsable =
      sparkHit &&
      sparkHit.expiresAt > now &&
      (sparkHit.value.lastClose != null ||
        sparkHit.value.weekAgoClose != null ||
        sparkHit.value.ytdClose != null);
    if (sparkUsable) Object.assign(extra, sparkHit.value);
    else {
      missingSpark.push(symbol);
      if (sparkHit) {
        Object.assign(extra, sparkHit.value);
        stale = true;
      }
    }
    map.set(symbol, extra);
  }

  let error: string | null = null;
  try {
    if (missingQuotes.length) {
      const quotes = await (deps.yahooQuotes ?? defaultYahooQuotes)(missingQuotes);
      for (const symbol of missingQuotes) {
        const hit =
          quotes.get(symbol) ?? quotes.get(toCanonicalSymbol(symbol) ?? symbol);
        const extra: WatchlistEnrichment = {
          name: hit?.name ?? null,
          marketCap: hit?.marketCap ?? null,
          avgVolume: hit?.avgVolume ?? null,
          preMarketChangePercent: hit?.preMarketChangePercent ?? null,
          afterHoursChangePercent: hit?.postMarketChangePercent ?? null,
          dayHigh: hit?.dayHigh ?? null,
          dayLow: hit?.dayLow ?? null,
          previousClose: hit?.previousClose ?? null,
        };
        enrichmentCache.set(symbol, {
          expiresAt: now + QUOTE_TTL_MS,
          value: extra,
        });
        const last = hit?.price ?? hit?.previousClose ?? null;
        if (last != null) {
          prints.set(symbol, {
            ticker: symbol,
            last,
            open: hit?.open ?? null,
            changePercent: hit?.changePercent ?? null,
            volume: hit?.volume ?? null,
          });
        }
        map.set(symbol, { ...map.get(symbol), ...extra });
      }
    }
  } catch (caught) {
    stale = true;
    error =
      caught instanceof Error
        ? caught.message.slice(0, 240)
        : "Coverage quote enrichment failed.";
  }
  try {
    if (missingSpark.length) {
      let sparks = await (deps.yahooSpark
        ? deps.yahooSpark(missingSpark)
        : fetchYahooSparkDailyCloses(missingSpark, "ytd"));
      if (!deps.yahooSpark) {
        const empty = missingSpark.filter((symbol) => {
          const closes =
            sparks.get(symbol) ?? sparks.get(toCanonicalSymbol(symbol) ?? symbol);
          return !closes?.length;
        });
        if (empty.length) {
          const retry = await fetchYahooSparkDailyCloses(empty, "3mo");
          sparks = new Map([...sparks, ...retry]);
        }
      }
      for (const symbol of missingSpark) {
        const closes =
          sparks.get(symbol) ??
          sparks.get(toCanonicalSymbol(symbol) ?? symbol) ??
          [];
        const sparkLast = closeSessionsAgo(closes, 0);
        const extra: WatchlistEnrichment = {
          weekAgoClose: closeSessionsAgo(closes, 5),
          monthAgoClose: closeSessionsAgo(closes, 21),
          ytdClose: priorYearClose(closes, deps.now),
          volatility: realizedVolPercent(closes),
          lastClose: sparkLast,
        };
        const existing = map.get(symbol);
        if (existing?.previousClose == null) {
          extra.previousClose = closeSessionsAgo(closes, 1);
        }
        if (sparkLast != null && !prints.has(symbol)) {
          prints.set(symbol, {
            ticker: symbol,
            last: sparkLast,
            open: null,
            changePercent: null,
            volume: null,
          });
        }
        sparkCache.set(symbol, {
          expiresAt: now + (sparkLast != null ? SPARK_TTL_MS : 45_000),
          value: extra,
        });
        map.set(symbol, { ...existing, ...extra });
      }
    }
  } catch (caught) {
    stale = true;
    error =
      error ??
      (caught instanceof Error
        ? caught.message.slice(0, 240)
        : "Coverage history enrichment failed.");
  }
  for (const [symbol, extra] of map) {
    if (prints.has(symbol)) continue;
    const last = extra.lastClose ?? extra.previousClose ?? null;
    if (last == null) continue;
    prints.set(symbol, {
      ticker: symbol,
      last,
      open: null,
      changePercent: null,
      volume: null,
    });
  }
  return { map, prints, stale, error };
}

function toCoverageQuotes(
  symbols: string[],
  quotes: Map<string, WatchlistQuoteInput>,
  enrichment: Map<string, WatchlistEnrichment>,
): CoverageQuote[] {
  return assembleWatchlistRows(symbols, quotes, enrichment).map((row) => {
    const seed = seedInstrumentRow(row.ticker);
    return {
      ticker: row.ticker,
      name: row.name ?? (seed.name !== row.ticker ? seed.name : null),
      last: row.last,
      change1dPercent: row.change1dPercent,
      changeFromOpenPercent: row.changeFromOpenPercent,
      change1wPercent: row.change1wPercent,
      change1mPercent: row.change1mPercent ?? null,
      changeYtdPercent: row.changeYtdPercent ?? null,
      preMarketChangePercent: row.preMarketChangePercent ?? null,
      afterHoursChangePercent: row.afterHoursChangePercent ?? null,
      vsSpy1dPercent: null,
      vsBenchmark1dPercent: null,
      vsGroup1dPercent: null,
      relativeVolume: row.relativeVolume,
      marketCap: row.marketCap,
      volume: row.volume,
      avgVolume: row.avgVolume ?? null,
      dayHigh: row.dayHigh ?? null,
      dayLow: row.dayLow ?? null,
      priorClose: row.priorClose ?? null,
      volatility: row.volatility ?? null,
      sectorId: null,
      sectorName: null,
      notes: null,
      tags: [],
      role: null,
      tier: null,
      rationale: null,
      securityType: seed.security_type,
      leverageMultiple: seed.leverage_multiple,
      isInverse: seed.is_inverse,
      isOtc: seed.is_otc,
      resolutionStatus: seed.resolution_status,
      underlyingSymbol: seed.underlying_symbol,
      exchange: seed.exchange,
      themeCount: 0,
      flags: [],
      missing: row.missing,
    };
  });
}

export async function loadCoverageQuotes(
  symbols: string[],
  deps: CoverageQuoteDeps = {},
): Promise<{
  rows: CoverageQuote[];
  stale: boolean;
  error: string | null;
  asOf: string;
  usingFixtures: boolean;
  latencyCoverageLabel: string | null;
  marketSession: string | null;
}> {
  const unique = [...new Set(symbols.map((symbol) => symbol.trim().toUpperCase()).filter(Boolean))];
  if (fixturesEnabled() && !deps.tape && !deps.yahooQuotes) {
    const maps = fixtureMaps(unique);
    return {
      rows: toCoverageQuotes(unique, maps.quotes, maps.enrichment),
      stale: false,
      error: null,
      asOf: new Date().toISOString(),
      usingFixtures: true,
      latencyCoverageLabel: "Mock data",
      marketSession: "regular",
    };
  }

  const env = getEnv();
  const cache = getMarketDataCache(env);
  const tape =
    deps.tape ??
    cache.getDashboardSnapshot()?.tape ??
    cache.getQuotes(unique).map((entry) => ({
      ...entry.observation,
      ticker: entry.observation.ticker,
    }));
  const yahoo = await loadYahooEnrichment(unique, deps);
  const tapeInputs = quoteInputs(tape as NormalizedQuote[]);
  for (const [ticker, print] of yahoo.prints) {
    tapeInputs.set(ticker, mergeQuoteInput(tapeInputs.get(ticker), print));
  }
  return {
    rows: toCoverageQuotes(unique, tapeInputs, yahoo.map),
    stale: yahoo.stale,
    error: yahoo.error,
    asOf: cache.getMeta().lastSuccessfulRefreshAt ?? new Date().toISOString(),
    usingFixtures: false,
    latencyCoverageLabel: cache.getMeta().latencyCoverageLabel ?? null,
    marketSession: cache.getDashboardSnapshot()?.marketSession ?? null,
  };
}

export function fixtureCoverageQuotes(symbols: string[]): CoverageQuote[] {
  const maps = fixtureMaps(symbols);
  return toCoverageQuotes(symbols, maps.quotes, maps.enrichment);
}
