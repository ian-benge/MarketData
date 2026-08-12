import {
  EARNINGS_DATE_PROXIMITY_DAYS,
  type CalendarSourceEvent,
  type EarningsCalendarProvider,
  type EarningsSession,
  type MergedCalendarEvent,
} from "@/lib/market-data/earnings/types";
import { calendarDayDiff } from "@/lib/market-data/earnings/window";
import { normalizeFiscalPeriod } from "@/lib/market-data/earnings/parse";

export type MergeStats = {
  unionCount: number;
  matchedByBoth: number;
  finnhubOnly: number;
  alphaVantageOnly: number;
  conflicted: number;
};

/**
 * Displayed date / session selection (deterministic):
 * 1. If observations agree on YYYY-MM-DD, use that date.
 * 2. If they disagree, prefer Finnhub (primary calendar source).
 * 3. If Finnhub is absent, use Alpha Vantage.
 * 4. Session: prefer a known bmo/amc/during over unknown. If both known and
 *    they disagree, prefer Finnhub and mark the event conflicted.
 * Alternative dates and every source observation are always retained.
 */
export function mergeCalendarEvents(
  finnhub: CalendarSourceEvent[],
  alphaVantage: CalendarSourceEvent[],
): { events: MergedCalendarEvent[]; stats: MergeStats } {
  const groups: CalendarSourceEvent[][] = [];

  for (const event of [...finnhub, ...alphaVantage]) {
    const existing = groups.find((group) =>
      group.some((member) => sameReportingPeriod(member, event)),
    );
    if (existing) existing.push(event);
    else groups.push([event]);
  }

  const events = groups.map(mergeGroup);
  events.sort((a, b) => {
    const date = a.reportDate.localeCompare(b.reportDate);
    if (date !== 0) return date;
    return a.canonicalSymbol.localeCompare(b.canonicalSymbol);
  });

  const stats: MergeStats = {
    unionCount: events.length,
    matchedByBoth: 0,
    finnhubOnly: 0,
    alphaVantageOnly: 0,
    conflicted: 0,
  };
  for (const event of events) {
    const hasFh = event.sources.includes("finnhub");
    const hasAv = event.sources.includes("alphaVantage");
    if (hasFh && hasAv) stats.matchedByBoth += 1;
    else if (hasFh) stats.finnhubOnly += 1;
    else stats.alphaVantageOnly += 1;
    if (event.conflicted) stats.conflicted += 1;
  }

  return { events, stats };
}

/**
 * Same company + same print:
 * - Matching fiscal period always merges (even if dates differ slightly).
 * - Close report dates merge even when fiscal labels disagree — Finnhub's
 *   quarter/year and Alpha Vantage's fiscalDateEnding often disagree for the
 *   same release (this is what produced duplicate ARMK/CAH/LITE/SMCI rows).
 * - Far-apart dates with different fiscal periods stay separate.
 */
function sameReportingPeriod(
  left: CalendarSourceEvent,
  right: CalendarSourceEvent,
): boolean {
  if (left.canonicalSymbol !== right.canonicalSymbol) return false;
  const gap = Math.abs(calendarDayDiff(left.reportDate, right.reportDate));
  const datesClose =
    Number.isFinite(gap) && gap <= EARNINGS_DATE_PROXIMITY_DAYS;
  const leftPeriod = normalizeFiscalPeriod(left.fiscalPeriod);
  const rightPeriod = normalizeFiscalPeriod(right.fiscalPeriod);
  if (leftPeriod && rightPeriod) {
    if (leftPeriod === rightPeriod) return true;
    return datesClose;
  }
  return datesClose;
}

function mergeGroup(observations: CalendarSourceEvent[]): MergedCalendarEvent {
  const finnhub = observations.find((item) => item.provider === "finnhub");
  const alpha = observations.find((item) => item.provider === "alphaVantage");
  const primary = finnhub ?? alpha ?? observations[0]!;
  const dates = [...new Set(observations.map((item) => item.reportDate))].sort();
  const datesConflict = dates.length > 1;
  const sessions = new Set(
    observations
      .map((item) => item.session)
      .filter((session) => session !== "unknown"),
  );
  const sessionConflict = sessions.size > 1;
  const reportDate = pickDisplayedDate(finnhub, alpha, primary);
  const alternativeReportDate =
    dates.find((date) => date !== reportDate) ?? null;
  const session = pickDisplayedSession(finnhub, alpha, observations);
  const sources = [
    ...new Set(observations.map((item) => item.provider)),
  ] as EarningsCalendarProvider[];
  const providerTickers: Partial<Record<EarningsCalendarProvider, string>> = {};
  for (const item of observations) {
    providerTickers[item.provider] = item.providerTicker;
  }

  const conflicted = datesConflict || sessionConflict;
  const both = Boolean(finnhub && alpha);
  const confidence = conflicted ? "low" : both ? "high" : "medium";

  return {
    id: `earn-${primary.canonicalSymbol}-${normalizeFiscalPeriod(finnhub?.fiscalPeriod) ?? normalizeFiscalPeriod(alpha?.fiscalPeriod) ?? reportDate}`.replaceAll(
      " ",
      "",
    ),
    canonicalSymbol: primary.canonicalSymbol,
    providerTickers,
    companyName:
      firstNonEmpty(alpha?.companyName, finnhub?.companyName, primary.companyName),
    reportDate,
    session,
    fiscalPeriod:
      normalizeFiscalPeriod(finnhub?.fiscalPeriod) ??
      normalizeFiscalPeriod(alpha?.fiscalPeriod) ??
      null,
    epsEstimate: pickNumber(finnhub?.epsEstimate, alpha?.epsEstimate),
    epsActual: pickNumber(finnhub?.epsActual, alpha?.epsActual),
    revenueEstimate: pickNumber(finnhub?.revenueEstimate, alpha?.revenueEstimate),
    revenueActual: pickNumber(finnhub?.revenueActual, alpha?.revenueActual),
    sources,
    observations,
    alternativeReportDate,
    conflicted,
    confidence,
    lastSourceUpdate: observations
      .map((item) => item.fetchedAt)
      .sort()
      .at(-1)!,
  };
}

function pickDisplayedDate(
  finnhub: CalendarSourceEvent | undefined,
  alpha: CalendarSourceEvent | undefined,
  fallback: CalendarSourceEvent,
): string {
  if (finnhub && alpha && finnhub.reportDate === alpha.reportDate) {
    return finnhub.reportDate;
  }
  if (finnhub) return finnhub.reportDate;
  if (alpha) return alpha.reportDate;
  return fallback.reportDate;
}

function pickDisplayedSession(
  finnhub: CalendarSourceEvent | undefined,
  alpha: CalendarSourceEvent | undefined,
  observations: CalendarSourceEvent[],
): EarningsSession {
  if (finnhub && finnhub.session !== "unknown") return finnhub.session;
  if (alpha && alpha.session !== "unknown") return alpha.session;
  const known = observations.find((item) => item.session !== "unknown");
  return known?.session ?? "unknown";
}

function pickNumber(
  preferred: number | null | undefined,
  fallback: number | null | undefined,
): number | null {
  if (preferred != null && Number.isFinite(preferred)) return preferred;
  if (fallback != null && Number.isFinite(fallback)) return fallback;
  return null;
}

function firstNonEmpty(
  ...values: Array<string | null | undefined>
): string | null {
  for (const value of values) {
    if (value && value.trim()) return value;
  }
  return null;
}
