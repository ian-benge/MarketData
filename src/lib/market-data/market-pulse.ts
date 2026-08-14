import type { NormalizedQuote } from "@/lib/providers/types";

export type MarketPulseRegime =
  | "Risk-On"
  | "Constructive"
  | "Mixed / Rotational"
  | "Defensive"
  | "Risk-Off"
  | "Insufficient Cross-Asset Data";

export type MarketPulseDriverId =
  | "equity"
  | "beta"
  | "breadth"
  | "volatility"
  | "rates"
  | "dollar"
  | "credit"
  | "oil"
  | "semis";

export type MarketPulseDriver = {
  id: MarketPulseDriverId;
  label: string;
  symbols: readonly string[];
  quote: NormalizedQuote | null;
  rawValue: number | null;
  normalizedValue: number | null;
  weight: number;
  contribution: number | null;
  metric: string;
  explanation: string;
  providerName: string | null;
  providerTimestamp: string | null;
};

export type MarketPulseResult = {
  score: number | null;
  regime: MarketPulseRegime;
  drivers: MarketPulseDriver[];
  coverage: number;
  availableWeight: number;
  minimumCoverage: number;
  comparableCount: number;
  positiveCount: number;
  negativeCount: number;
  neutralCount: number;
  excludedSessionCount: number;
  freshness: "Fresh" | "Aging" | "Stale" | "Delayed";
  dataQualityLabel: string;
  explanation: string;
  methodology: string;
  calculatedAt: string;
  session: string;
};

type DriverConfig = {
  id: Exclude<MarketPulseDriverId, "breadth">;
  label: string;
  symbols: readonly string[];
  weight: number;
  scalePercent: number;
  direction: 1 | -1;
  explanation: string;
};

export const MARKET_PULSE_CONFIG = {
  minimumCoverage: 0.55,
  minimumCoreSignals: 2,
  coreSignals: ["equity", "beta", "volatility"] as const,
  breadthWeight: 0.15,
  regimes: {
    riskOffMax: 25,
    defensiveMax: 42.5,
    mixedMax: 57.5,
    constructiveMax: 75,
  },
  drivers: [
    {
      id: "equity",
      label: "Equity index / beta",
      symbols: ["SPY", "ES"],
      weight: 0.18,
      scalePercent: 1.5,
      direction: 1,
      explanation: "Broad equity price direction is the primary risk-appetite input.",
    },
    {
      id: "beta",
      label: "Growth / beta",
      symbols: ["QQQ"],
      weight: 0.13,
      scalePercent: 2,
      direction: 1,
      explanation: "Growth participation tests whether higher-duration equity risk is confirming.",
    },
    {
      id: "volatility",
      label: "Volatility",
      symbols: ["VIX", "VIXY"],
      weight: 0.14,
      scalePercent: 5,
      direction: -1,
      explanation: "Falling equity volatility supports risk appetite; rising volatility resists it.",
    },
    {
      id: "rates",
      label: "Rates / duration",
      symbols: ["TLT"],
      weight: 0.12,
      scalePercent: 1.5,
      direction: 1,
      explanation: "Long-duration Treasury performance is used as the available rate-impulse proxy.",
    },
    {
      id: "dollar",
      label: "Dollar",
      symbols: ["DXY", "UUP"],
      weight: 0.08,
      scalePercent: 1,
      direction: -1,
      explanation: "A firmer dollar is treated as tighter global financial conditions.",
    },
    {
      id: "credit",
      label: "Credit",
      symbols: ["HYG"],
      weight: 0.08,
      scalePercent: 1.25,
      direction: 1,
      explanation: "High-yield credit performance confirms or challenges the equity signal.",
    },
    {
      id: "oil",
      label: "Commodities / oil",
      symbols: ["WTI", "USO"],
      weight: 0.05,
      scalePercent: 3,
      direction: -1,
      explanation: "A sharp oil rise is treated as a modest inflation and financial-conditions headwind.",
    },
    {
      id: "semis",
      label: "Semiconductor leadership",
      symbols: ["SMH", "SOXX"],
      weight: 0.07,
      scalePercent: 2,
      direction: 1,
      explanation: "Semiconductor strength is used only when a verified sector proxy is present.",
    },
  ] satisfies readonly DriverConfig[],
} as const;

export type CalculateMarketPulseInput = {
  quotes: NormalizedQuote[];
  asOf: string;
  marketSession?: string | null;
  latencyClass?: string | null;
  feedCoverage?: string | null;
  coverageLabel?: string | null;
  breadthSupported?: boolean;
  now?: Date;
};

function clamp(value: number, min = -1, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function legacySession(session: string | null | undefined) {
  if (session === "overnight") return "unknown";
  if (session === "closed") return "closed";
  return session ?? "unknown";
}

function sessionCompatible(
  expected: string,
  quoteSession: string | null | undefined,
) {
  if (expected === "unknown") return true;
  const observed = legacySession(quoteSession);
  if (observed === expected) return true;
  // Untagged quotes are usable. "closed" on a regular-session tape is the
  // Alpaca snapshot default when the clock was never fetched — the daily
  // change vs prior close is still the RTH move.
  if (observed === "unknown") return true;
  if (expected === "regular" && observed === "closed") return true;
  return false;
}

/**
 * Frozen Pulse inputs. Live score and history path must use this set only —
 * never the full dashboard tape (NVDA, sector ETFs, etc.).
 * Primary scored proxies; driver fallbacks (ES/VIX/DXY/WTI/SOXX) are unused
 * so live prints match the history reconstruction symbols.
 */
export const PULSE_INPUT_SYMBOLS = [
  "SPY",
  "QQQ",
  "VIXY",
  "TLT",
  "UUP",
  "HYG",
  "USO",
  "SMH",
] as const;

const PULSE_INPUT_SET = new Set<string>(PULSE_INPUT_SYMBOLS);

export function isPulseInputSymbol(ticker: string) {
  return PULSE_INPUT_SET.has(ticker.toUpperCase());
}

export function filterPulseQuotes<T extends { ticker: string }>(quotes: T[]): T[] {
  return quotes.filter((quote) => isPulseInputSymbol(quote.ticker));
}

export function marketPulseProxyEtfs() {
  return ["TLT", "VIXY", "UUP", "HYG", "USO", "GLD", "SOXX"] as const;
}

/** ETF duration stack — tape context, not Pulse inputs or CMT yields. */
export const DURATION_PROXY_ETFS = ["SHY", "IEF", "TLT"] as const;

/** Extra cross-asset names fetched on the stocks path (not Pulse-scored). */
export const CROSS_ASSET_TAPE_SYMBOLS = [
  "LQD",
  "IBIT",
  "SHY",
  "IEF",
] as const;

function signedPercent(value: number | null) {
  if (value == null) return "Unavailable";
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${Math.abs(value).toFixed(2)}%`;
}

function scoreRegime(score: number): Exclude<MarketPulseRegime, "Insufficient Cross-Asset Data"> {
  const thresholds = MARKET_PULSE_CONFIG.regimes;
  if (score < thresholds.riskOffMax) return "Risk-Off";
  if (score < thresholds.defensiveMax) return "Defensive";
  if (score < thresholds.mixedMax) return "Mixed / Rotational";
  if (score < thresholds.constructiveMax) return "Constructive";
  return "Risk-On";
}

function freshnessFor(input: CalculateMarketPulseInput) {
  const latency = input.latencyClass;
  if (latency === "delayed_15m" || latency === "eod" || latency === "mock") return "Delayed" as const;
  if (latency === "stale" || latency === "unavailable") return "Stale" as const;
  const ageSeconds = (input.now?.getTime() ?? Date.now()) - Date.parse(input.asOf);
  if (!Number.isFinite(ageSeconds) || ageSeconds > 180_000) return "Stale" as const;
  if (ageSeconds > 45_000) return "Aging" as const;
  return "Fresh" as const;
}

function qualityLabel(input: CalculateMarketPulseInput, coverage: number) {
  let label: string;
  if (input.latencyClass === "mock") label = "Mock data · configured proxies";
  else if (input.latencyClass === "unavailable") label = "Cross-asset data unavailable";
  else if (input.feedCoverage === "iex") label = "IEX indicative · configured proxies";
  else if (input.feedCoverage === "sip" && input.latencyClass === "realtime") label = "SIP real-time · configured proxies";
  else if (input.latencyClass === "delayed_15m") label = "Delayed · configured proxies";
  else if (input.latencyClass === "eod") label = "End-of-day · configured proxies";
  else label = input.coverageLabel ?? "Provider coverage not classified";
  return coverage < 0.75 ? `${label} · partial cross-asset coverage` : label;
}

const SUPPORT_LANGUAGE: Record<MarketPulseDriverId, string> = {
  equity: "broad equities",
  beta: "growth participation",
  breadth: "configured proxy breadth",
  volatility: "the volatility signal",
  rates: "duration",
  dollar: "the dollar signal",
  credit: "credit",
  oil: "the oil signal",
  semis: "semiconductor leadership",
};

function buildExplanation(drivers: MarketPulseDriver[], definitive: boolean) {
  if (!definitive) {
    return "Available inputs do not meet the minimum cross-asset coverage required for a definitive regime.";
  }
  const ranked = drivers
    .filter((driver) => driver.contribution != null)
    .sort((a, b) => Math.abs(b.contribution ?? 0) - Math.abs(a.contribution ?? 0));
  const supporting = ranked.filter((driver) => (driver.contribution ?? 0) > 0.25).slice(0, 2);
  const resisting = ranked.filter((driver) => (driver.contribution ?? 0) < -0.25).slice(0, 2);
  const supportText = supporting.map((driver) => SUPPORT_LANGUAGE[driver.id]).join(" and ");
  const resistText = resisting.map((driver) => SUPPORT_LANGUAGE[driver.id]).join(" and ");
  if (supportText && resistText) return `${supportText} support the heuristic, while ${resistText} resist it.`;
  if (supportText) return `${supportText} are the main verified supports; other available inputs are neutral or unavailable.`;
  if (resistText) return `${resistText} are the main verified drags; other available inputs are neutral or unavailable.`;
  return "Available verified signals are clustered near neutral, producing a mixed regime read.";
}

export function calculateMarketPulse(input: CalculateMarketPulseInput): MarketPulseResult {
  const expectedSession = legacySession(input.marketSession);
  const quotes = filterPulseQuotes(input.quotes);
  const validQuotes = quotes.filter((quote) => {
    if (quote.changePercent == null || !Number.isFinite(quote.changePercent)) return false;
    return sessionCompatible(expectedSession, quote.marketSession);
  });
  const excludedSessionCount = quotes.filter(
    (quote) =>
      quote.changePercent != null &&
      !sessionCompatible(expectedSession, quote.marketSession),
  ).length;
  const byTicker = new Map(validQuotes.map((quote) => [quote.ticker.toUpperCase(), quote]));

  const drivers: MarketPulseDriver[] = MARKET_PULSE_CONFIG.drivers.map((config) => {
    const quote = config.symbols.map((symbol) => byTicker.get(symbol)).find(Boolean) ?? null;
    const rawValue = quote?.changePercent ?? null;
    const normalizedValue = rawValue == null ? null : clamp((rawValue / config.scalePercent) * config.direction);
    return {
      id: config.id,
      label: config.label,
      symbols: config.symbols,
      quote,
      rawValue,
      normalizedValue,
      weight: config.weight,
      contribution: normalizedValue == null ? null : normalizedValue * config.weight * 50,
      metric: quote ? `${quote.ticker} ${signedPercent(rawValue)}` : "Unavailable",
      explanation: config.explanation,
      providerName: quote?.providerName ?? null,
      providerTimestamp: quote?.providerTimestamp ?? null,
    };
  });

  const comparableCount = validQuotes.length;
  const positiveCount = validQuotes.filter((quote) => (quote.changePercent ?? 0) > 0).length;
  const negativeCount = validQuotes.filter((quote) => (quote.changePercent ?? 0) < 0).length;
  const neutralCount = comparableCount - positiveCount - negativeCount;
  const breadthNormalized = comparableCount ? (positiveCount - negativeCount) / comparableCount : null;
  drivers.splice(2, 0, {
    id: "breadth",
    label: "Configured proxy breadth",
    symbols: validQuotes.map((quote) => quote.ticker),
    quote: null,
    rawValue: breadthNormalized,
    normalizedValue: breadthNormalized,
    weight: MARKET_PULSE_CONFIG.breadthWeight,
    contribution: breadthNormalized == null ? null : breadthNormalized * MARKET_PULSE_CONFIG.breadthWeight * 50,
    metric: comparableCount ? `${positiveCount} / ${comparableCount} positive` : "Unavailable",
    explanation: "Participation is measured only across the configured proxy basket, not the consolidated market.",
    providerName: validQuotes.length ? [...new Set(validQuotes.map((quote) => quote.providerName))].join(", ") : null,
    providerTimestamp: validQuotes.map((quote) => quote.providerTimestamp).sort().at(-1) ?? null,
  });

  const availableWeight = drivers.reduce((sum, driver) => sum + (driver.normalizedValue == null ? 0 : driver.weight), 0);
  const coverage = clamp(availableWeight, 0, 1);
  const coreCount = drivers.filter(
    (driver) => MARKET_PULSE_CONFIG.coreSignals.includes(driver.id as (typeof MARKET_PULSE_CONFIG.coreSignals)[number]) && driver.normalizedValue != null,
  ).length;
  const definitive = coverage >= MARKET_PULSE_CONFIG.minimumCoverage && coreCount >= MARKET_PULSE_CONFIG.minimumCoreSignals;
  const rawScore = 50 + drivers.reduce((sum, driver) => sum + (driver.contribution ?? 0), 0);
  const score = definitive ? Math.round(clamp(rawScore, 0, 100)) : null;
  const regime = score == null ? "Insufficient Cross-Asset Data" : scoreRegime(score);

  return {
    score,
    regime,
    drivers,
    coverage,
    availableWeight,
    minimumCoverage: MARKET_PULSE_CONFIG.minimumCoverage,
    comparableCount,
    positiveCount,
    negativeCount,
    neutralCount,
    excludedSessionCount,
    freshness: freshnessFor(input),
    dataQualityLabel: qualityLabel(input, coverage),
    explanation: buildExplanation(drivers, definitive),
    methodology: "Heuristic score = 50 plus the sum of capped, direction-adjusted signal contributions. Each contribution is normalized by its configured session-change scale and multiplied by its fixed weight. Missing inputs contribute zero and reduce disclosed coverage; they are never imputed.",
    calculatedAt: input.asOf,
    session: expectedSession,
  };
}
