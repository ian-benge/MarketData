import type {
  HistoricalQuarter,
  HistoricalSourceObservation,
} from "@/lib/market-data/earnings/history-types";
import { HISTORICAL_QUARTER_COUNT } from "@/lib/market-data/earnings/history-types";
import {
  surpriseAmount,
  surprisePercent,
  normalizeFiscalPeriod,
} from "@/lib/market-data/earnings/parse";
import type { EarningsCalendarProvider, EarningsSession } from "@/lib/market-data/earnings/types";
import { calendarDayDiff } from "@/lib/market-data/earnings/window";

const DATE_PROXIMITY_DAYS = 10;

export function mergeHistoricalObservations(
  observations: HistoricalSourceObservation[],
  limit = HISTORICAL_QUARTER_COUNT,
): HistoricalQuarter[] {
  const groups: HistoricalSourceObservation[][] = [];
  for (const item of observations) {
    if (!item.reportDate && !item.fiscalPeriod) continue;
    const existing = groups.find((group) =>
      group.some((member) => sameQuarter(member, item)),
    );
    if (existing) existing.push(item);
    else groups.push([item]);
  }

  const quarters = groups
    .map(mergeGroup)
    .filter((quarter) => quarter.reportDate != null || quarter.epsActual != null)
    .sort((a, b) => (b.reportDate ?? "").localeCompare(a.reportDate ?? ""));

  const recent = quarters.slice(0, limit).reverse();
  for (let index = 0; index < recent.length; index += 1) {
    const current = recent[index]!;
    const prior = recent[index - 1];
    current.revenueGrowthPercent =
      current.revenueActual != null &&
      prior?.revenueActual != null &&
      prior.revenueActual !== 0
        ? Math.round(
            ((current.revenueActual - prior.revenueActual) / Math.abs(prior.revenueActual)) *
              1000,
          ) / 10
        : null;
    current.missing = missingFields(current);
  }
  return [...recent].reverse();
}

function sameQuarter(
  left: HistoricalSourceObservation,
  right: HistoricalSourceObservation,
): boolean {
  const leftPeriod = normalizeFiscalPeriod(left.fiscalPeriod);
  const rightPeriod = normalizeFiscalPeriod(right.fiscalPeriod);
  if (leftPeriod && rightPeriod) return leftPeriod === rightPeriod;
  if (!left.reportDate || !right.reportDate) return false;
  const gap = Math.abs(calendarDayDiff(left.reportDate, right.reportDate));
  return Number.isFinite(gap) && gap <= DATE_PROXIMITY_DAYS;
}

function mergeGroup(observations: HistoricalSourceObservation[]): HistoricalQuarter {
  const finnhub = observations.filter((item) => item.provider === "finnhub");
  const alpha = observations.filter((item) => item.provider === "alphaVantage");
  const preferred = [...finnhub, ...alpha];
  const reportDate =
    firstDate(finnhub) ?? firstDate(alpha) ?? firstDate(observations);
  const fiscalPeriod =
    firstPeriod(finnhub) ?? firstPeriod(alpha) ?? firstPeriod(observations);
  const session = pickSession(observations);
  const epsEstimate = firstNumber(preferred, "epsEstimate");
  const epsActual = firstNumber(preferred, "epsActual");
  const revenueEstimate = firstNumber(preferred, "revenueEstimate");
  const revenueActual = firstNumber(preferred, "revenueActual");
  const sources = (
    ["finnhub", "alphaVantage"] as EarningsCalendarProvider[]
  ).filter((provider) => observations.some((item) => item.provider === provider));

  return {
    id: `hist-${fiscalPeriod ?? reportDate ?? "unknown"}`.replaceAll(" ", ""),
    fiscalPeriod,
    reportDate,
    session,
    epsEstimate,
    epsActual,
    epsSurprise: surpriseAmount(epsActual, epsEstimate),
    epsSurprisePercent:
      firstNumber(preferred, "epsSurprisePercent") ?? surprisePercent(epsActual, epsEstimate),
    revenueEstimate,
    revenueActual,
    revenueSurprise: surpriseAmount(revenueActual, revenueEstimate),
    revenueSurprisePercent:
      firstNumber(preferred, "revenueSurprisePercent") ??
      surprisePercent(revenueActual, revenueEstimate),
    revenueGrowthPercent: null,
    reactionNextPercent: null,
    reactionFiveDayPercent: null,
    sources,
    missing: [],
  };
}

function firstDate(rows: HistoricalSourceObservation[]): string | null {
  return rows.find((row) => row.reportDate)?.reportDate ?? null;
}

function firstPeriod(rows: HistoricalSourceObservation[]): string | null {
  return rows.find((row) => row.fiscalPeriod)?.fiscalPeriod ?? null;
}

function firstNumber(
  rows: HistoricalSourceObservation[],
  key:
    | "epsEstimate"
    | "epsActual"
    | "epsSurprisePercent"
    | "revenueEstimate"
    | "revenueActual"
    | "revenueSurprisePercent",
): number | null {
  for (const row of rows) {
    const value = row[key];
    if (value != null && Number.isFinite(value)) return value;
  }
  return null;
}

function pickSession(rows: HistoricalSourceObservation[]): EarningsSession {
  const finnhub = rows.find((row) => row.provider === "finnhub" && row.session !== "unknown");
  if (finnhub) return finnhub.session;
  const alpha = rows.find((row) => row.provider === "alphaVantage" && row.session !== "unknown");
  if (alpha) return alpha.session;
  return "unknown";
}

function missingFields(quarter: HistoricalQuarter): string[] {
  const missing: string[] = [];
  if (!quarter.reportDate) missing.push("reportDate");
  if (!quarter.fiscalPeriod) missing.push("fiscalPeriod");
  if (quarter.session === "unknown") missing.push("session");
  if (quarter.epsEstimate == null) missing.push("epsEstimate");
  if (quarter.epsActual == null) missing.push("epsActual");
  if (quarter.epsSurprisePercent == null) missing.push("epsSurprisePercent");
  if (quarter.revenueEstimate == null) missing.push("revenueEstimate");
  if (quarter.revenueActual == null) missing.push("revenueActual");
  if (quarter.revenueSurprisePercent == null) missing.push("revenueSurprisePercent");
  if (quarter.revenueGrowthPercent == null) missing.push("revenueGrowth");
  if (quarter.reactionNextPercent == null) missing.push("reactionNext");
  if (quarter.reactionFiveDayPercent == null) missing.push("reactionFiveDay");
  return missing;
}
