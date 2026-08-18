import type { RankedScannerRow, ScannerAlertEvent, ScannerFilters } from "./types";
import { DEFAULT_SCANNER_FILTERS } from "./types";

export function parseScannerFilters(
  search: URLSearchParams | Record<string, string | undefined>,
): ScannerFilters {
  const get = (key: string) =>
    search instanceof URLSearchParams ? search.get(key) : search[key];
  const num = (key: string) => {
    const raw = get(key);
    if (raw == null || raw === "") return null;
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
  };
  const news = get("news");
  return {
    query: get("q") ?? DEFAULT_SCANNER_FILTERS.query,
    minPrice: num("minPrice"),
    maxPrice: num("maxPrice"),
    minRvol: num("minRvol"),
    maxFloatMm: num("maxFloat"),
    minDollarVolume: num("minDv"),
    watchlistOnly: get("watchlist") === "1",
    inPositionOnly: get("book") === "1",
    newsFreshness: news
      ? (news.split(",").filter(Boolean) as ScannerFilters["newsFreshness"])
      : null,
    themes: (get("themes") ?? "").split(",").filter(Boolean),
    hideHalted: get("hideHalted") === "1",
    hideMuted: get("showMuted") !== "1",
  };
}

export function sortRows(
  rows: RankedScannerRow[],
  key: string,
  dir: "asc" | "desc",
): RankedScannerRow[] {
  const sign = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const av = valueOf(a, key);
    const bv = valueOf(b, key);
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    if (typeof av === "string" && typeof bv === "string") {
      return av.localeCompare(bv) * sign;
    }
    return ((av as number) - (bv as number)) * sign;
  });
}

function valueOf(row: RankedScannerRow, key: string): number | string | null {
  switch (key) {
    case "ticker":
      return row.ticker;
    case "last":
      return row.last;
    case "changeClose":
      return row.changeFromClosePct;
    case "changeOpen":
      return row.changeFromOpenPct;
    case "velocity":
      return row.velocity5mPct;
    case "rvol":
      return row.relativeVolume;
    case "dollarVolume":
      return row.dollarVolume;
    case "float":
      return row.floatShares;
    case "hod":
      return row.distanceFromHodPct;
    case "opportunity":
      return row.opportunity.total;
    case "risk":
      return row.risk.total;
    case "rank":
    default:
      return row.rank;
  }
}

export function searchAlerts(
  alerts: ScannerAlertEvent[],
  query: string,
): ScannerAlertEvent[] {
  const q = query.trim().toUpperCase();
  if (!q) return alerts;
  return alerts.filter((alert) => {
    const hay = `${alert.ticker} ${alert.name ?? ""} ${alert.strategyTitle} ${alert.explanation.headline}`.toUpperCase();
    return hay.includes(q);
  });
}
