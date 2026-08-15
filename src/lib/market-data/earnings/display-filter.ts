import type {
  EarningsCalendarEvent,
  EarningsSession,
} from "@/lib/market-data/earnings/types";

/** `any` = no minimum. Numeric values are minimum thresholds. */
export type MarketCapFilter = "any" | "1b" | "5b" | "10b" | "50b" | "100b";
export type AvgVolumeFilter =
  | "any"
  | "100k"
  | "500k"
  | "1m"
  | "5m"
  | "10m";

export const MARKET_CAP_FILTER_OPTIONS: Array<{
  value: MarketCapFilter;
  label: string;
  min: number | null;
}> = [
  { value: "any", label: "Any mkt cap", min: null },
  { value: "1b", label: "Mkt cap ≥ $1B", min: 1_000_000_000 },
  { value: "5b", label: "Mkt cap ≥ $5B", min: 5_000_000_000 },
  { value: "10b", label: "Mkt cap ≥ $10B", min: 10_000_000_000 },
  { value: "50b", label: "Mkt cap ≥ $50B", min: 50_000_000_000 },
  { value: "100b", label: "Mkt cap ≥ $100B", min: 100_000_000_000 },
];

export const AVG_VOLUME_FILTER_OPTIONS: Array<{
  value: AvgVolumeFilter;
  label: string;
  min: number | null;
}> = [
  { value: "any", label: "Any ADV", min: null },
  { value: "100k", label: "ADV ≥ 100K", min: 100_000 },
  { value: "500k", label: "ADV ≥ 500K", min: 500_000 },
  { value: "1m", label: "ADV ≥ 1M", min: 1_000_000 },
  { value: "5m", label: "ADV ≥ 5M", min: 5_000_000 },
  { value: "10m", label: "ADV ≥ 10M", min: 10_000_000 },
];

export type EarningsDisplayFilters = {
  weekStart: string;
  weekEnd: string;
  session: "all" | "bmo" | "amc";
  query: string;
  marketCap: MarketCapFilter;
  avgVolume: AvgVolumeFilter;
};

export type EarningsDisplayFilterResult = {
  visible: EarningsCalendarEvent[];
  inSelectedWindow: number;
  hiddenByFilters: number;
  hiddenByMarketCap: number;
  hiddenByAvgVolume: number;
  hiddenUnknownSize: number;
};

function matchesQuery(event: EarningsCalendarEvent, query: string) {
  if (!query) return true;
  const ticker = event.ticker.toLowerCase();
  if (ticker === query || ticker.startsWith(query)) return true;
  const name = (event.companyName ?? "").toLowerCase();
  return name.includes(query);
}

function passesSizeFilters(
  event: EarningsCalendarEvent,
  minCap: number | null,
  minVolume: number | null,
): { ok: boolean; unknownSize: boolean; byMarketCap: boolean; byAvgVolume: boolean } {
  if (minCap != null) {
    const cap = event.marketCap;
    if (cap == null || !Number.isFinite(cap)) {
      return { ok: false, unknownSize: true, byMarketCap: true, byAvgVolume: false };
    }
    if (cap < minCap) {
      return { ok: false, unknownSize: false, byMarketCap: true, byAvgVolume: false };
    }
  }
  if (minVolume != null) {
    const volume = event.avgVolume;
    if (volume == null || !Number.isFinite(volume)) {
      return { ok: false, unknownSize: true, byMarketCap: false, byAvgVolume: true };
    }
    if (volume < minVolume) {
      return { ok: false, unknownSize: false, byMarketCap: false, byAvgVolume: true };
    }
  }
  return { ok: true, unknownSize: false, byMarketCap: false, byAvgVolume: false };
}

export type EarningsSearchScope = {
  session: "all" | "bmo" | "amc";
  query: string;
  marketCap: MarketCapFilter;
  avgVolume: AvgVolumeFilter;
};

/** Search the full loaded calendar (not just the visible week). */
export function findEarningsSearchMatches(
  events: EarningsCalendarEvent[],
  filters: EarningsSearchScope,
): EarningsCalendarEvent[] {
  const needle = filters.query.trim().toLowerCase();
  if (!needle) return [];
  const minCap = marketCapThreshold(filters.marketCap);
  const minVolume = avgVolumeThreshold(filters.avgVolume);
  return events.filter((event) => {
    if (filters.session !== "all" && event.session !== filters.session) return false;
    if (!matchesQuery(event, needle)) return false;
    return passesSizeFilters(event, minCap, minVolume).ok;
  });
}

/**
 * Prefer exact ticker, then ticker prefix, then nearest upcoming report date.
 */
export function pickBestEarningsSearchMatch(
  events: EarningsCalendarEvent[],
  filters: EarningsSearchScope,
  todayIso: string,
): EarningsCalendarEvent | null {
  const matches = findEarningsSearchMatches(events, filters);
  if (!matches.length) return null;
  const needle = filters.query.trim().toLowerCase();
  const ranked = [...matches].sort((a, b) => {
    const aTicker = a.ticker.toLowerCase();
    const bTicker = b.ticker.toLowerCase();
    const aExact = aTicker === needle ? 0 : aTicker.startsWith(needle) ? 1 : 2;
    const bExact = bTicker === needle ? 0 : bTicker.startsWith(needle) ? 1 : 2;
    if (aExact !== bExact) return aExact - bExact;
    const aFuture = a.reportDate >= todayIso ? 0 : 1;
    const bFuture = b.reportDate >= todayIso ? 0 : 1;
    if (aFuture !== bFuture) return aFuture - bFuture;
    if (aFuture === 0) return a.reportDate.localeCompare(b.reportDate);
    return b.reportDate.localeCompare(a.reportDate);
  });
  return ranked[0] ?? null;
}

export function marketCapThreshold(filter: MarketCapFilter): number | null {
  return MARKET_CAP_FILTER_OPTIONS.find((option) => option.value === filter)?.min ?? null;
}

export function avgVolumeThreshold(filter: AvgVolumeFilter): number | null {
  return AVG_VOLUME_FILTER_OPTIONS.find((option) => option.value === filter)?.min ?? null;
}

/**
 * Client-only size filters. Missing market cap / ADV never count as zero —
 * they fail an active threshold and are tallied as unknown size.
 */
export function applyEarningsDisplayFilters(
  events: EarningsCalendarEvent[],
  filters: EarningsDisplayFilters,
): EarningsDisplayFilterResult {
  const needle = filters.query.trim().toLowerCase();
  const minCap = marketCapThreshold(filters.marketCap);
  const minVolume = avgVolumeThreshold(filters.avgVolume);
  const inWeek = events.filter(
    (event) =>
      event.reportDate >= filters.weekStart && event.reportDate <= filters.weekEnd,
  );

  let hiddenByMarketCap = 0;
  let hiddenByAvgVolume = 0;
  let hiddenUnknownSize = 0;

  const visible = inWeek.filter((event) => {
    if (filters.session !== "all" && event.session !== filters.session) {
      return false;
    }
    if (!matchesQuery(event, needle)) return false;

    const size = passesSizeFilters(event, minCap, minVolume);
    if (!size.ok) {
      if (size.byMarketCap) hiddenByMarketCap += 1;
      if (size.byAvgVolume) hiddenByAvgVolume += 1;
      if (size.unknownSize) hiddenUnknownSize += 1;
      return false;
    }

    return true;
  });

  return {
    visible,
    inSelectedWindow: inWeek.length,
    hiddenByFilters: inWeek.length - visible.length,
    hiddenByMarketCap,
    hiddenByAvgVolume,
    hiddenUnknownSize,
  };
}

export function eventsForSession(
  events: EarningsCalendarEvent[],
  session: EarningsSession | "bmo_or_during",
): EarningsCalendarEvent[] {
  if (session === "bmo_or_during") {
    return events.filter((event) => event.session === "bmo" || event.session === "during");
  }
  return events.filter((event) => event.session === session);
}
