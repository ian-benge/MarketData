import {
  MIN_EARNINGS_AVG_VOLUME,
  MIN_EARNINGS_DOLLAR_VOLUME,
  MIN_EARNINGS_MARKET_CAP,
  type YahooEquityQuote,
} from "@/lib/market-data/earnings/types";
import { looksLikeListedTicker } from "@/lib/market-data/earnings/symbols";

const COMMON_STOCK = new Set(["EQUITY", "ETF", ""]);

export type LiquidityClass =
  | "liquid_large_cap"
  | "below_threshold"
  | "unknown_size";

export function isUsCommonTicker(ticker: string): boolean {
  return looksLikeListedTicker(ticker);
}

/**
 * $10B+ liquid classification. Missing market cap or ADV is "unknown_size",
 * never coerced to zero.
 */
export function classifyLargeCapLiquidity(
  quote: Pick<YahooEquityQuote, "marketCap" | "avgVolume" | "price" | "quoteType">,
): LiquidityClass {
  if (quote.quoteType && !COMMON_STOCK.has(quote.quoteType.toUpperCase())) {
    return "below_threshold";
  }
  const cap = quote.marketCap;
  if (cap == null || !Number.isFinite(cap)) return "unknown_size";
  if (cap < MIN_EARNINGS_MARKET_CAP) return "below_threshold";

  const avgVolume = quote.avgVolume;
  if (avgVolume == null || !Number.isFinite(avgVolume)) return "unknown_size";
  if (avgVolume >= MIN_EARNINGS_AVG_VOLUME) return "liquid_large_cap";

  const price = quote.price;
  if (price == null || !Number.isFinite(price) || price <= 0) return "unknown_size";
  return avgVolume * price >= MIN_EARNINGS_DOLLAR_VOLUME
    ? "liquid_large_cap"
    : "below_threshold";
}

export function passesLargeCapVolume(quote: YahooEquityQuote): boolean {
  return classifyLargeCapLiquidity(quote) === "liquid_large_cap";
}
