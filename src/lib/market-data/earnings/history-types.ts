import type { EarningsCalendarProvider, EarningsSession } from "@/lib/market-data/earnings/types";

export const HISTORICAL_QUARTER_COUNT = 8;
/** Historical fundamentals change slowly; keep separate from the 5-minute quote loop. */
export const EARNINGS_HISTORY_TTL_MS = 12 * 60 * 60 * 1000;
/** Yahoo daily bars for post-print reaction; shorter than fundamentals. */
export const EARNINGS_HISTORY_BARS_TTL_MS = 60 * 60 * 1000;

export type DailyClose = {
  date: string;
  close: number;
};

export type HistoricalSourceObservation = {
  provider: EarningsCalendarProvider;
  reportDate: string | null;
  fiscalPeriod: string | null;
  session: EarningsSession;
  epsEstimate: number | null;
  epsActual: number | null;
  epsSurprisePercent: number | null;
  revenueEstimate: number | null;
  revenueActual: number | null;
  revenueSurprisePercent: number | null;
};

export type HistoricalQuarter = {
  id: string;
  fiscalPeriod: string | null;
  reportDate: string | null;
  session: EarningsSession;
  epsEstimate: number | null;
  epsActual: number | null;
  epsSurprise: number | null;
  epsSurprisePercent: number | null;
  revenueEstimate: number | null;
  revenueActual: number | null;
  revenueSurprise: number | null;
  revenueSurprisePercent: number | null;
  revenueGrowthPercent: number | null;
  reactionNextPercent: number | null;
  reactionFiveDayPercent: number | null;
  sources: EarningsCalendarProvider[];
  missing: string[];
};

export type EarningsHistorySourceHealth = {
  configured: boolean;
  ok: boolean;
  stale: boolean;
  fetchedAt: string | null;
  rowCount: number;
  error: string | null;
};

export type EarningsHistorySnapshot = {
  ticker: string;
  companyName: string | null;
  asOf: string;
  stale: boolean;
  usingFixtures: boolean;
  quarters: HistoricalQuarter[];
  sources: {
    finnhub: EarningsHistorySourceHealth;
    alphaVantage: EarningsHistorySourceHealth;
    yahoo: EarningsHistorySourceHealth;
  };
  error: string | null;
};
