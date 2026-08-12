import type { NormalizedCalendarEvent } from "@/lib/providers/types";

/** Forex Factory uses currency codes (USD); Finnhub/FRED/mocks often use US. */
const USD_MARKET_CODES = new Set(["USD", "US"]);

export function isUsdMarketEvent(event: NormalizedCalendarEvent): boolean {
  const country = (event.country ?? "").trim().toUpperCase();
  return USD_MARKET_CODES.has(country);
}

/**
 * Upcoming high-impact USD-market catalysts after `asOf`, soonest first.
 * Excludes non-USD countries and low/medium/unrated impact.
 */
export function selectUpcomingUsdHighImpactRisks(
  events: readonly NormalizedCalendarEvent[],
  asOf: string,
): NormalizedCalendarEvent[] {
  const asOfMs = Date.parse(asOf);
  if (!Number.isFinite(asOfMs)) return [];

  return events
    .filter((event) => {
      if (event.importance !== "high") return false;
      if (!isUsdMarketEvent(event)) return false;
      const at = Date.parse(event.scheduledAt);
      return Number.isFinite(at) && at > asOfMs;
    })
    .sort((a, b) => Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt));
}

/**
 * Soonest upcoming high-impact USD catalyst after `asOf`.
 */
export function selectNextHighImpactRisk(
  events: readonly NormalizedCalendarEvent[],
  asOf: string,
): NormalizedCalendarEvent | null {
  return selectUpcomingUsdHighImpactRisks(events, asOf)[0] ?? null;
}
