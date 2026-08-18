import type { RankedScannerRow, ScannerAlertEvent, ScannerFilters } from "./types";

export function rowMatchesFilters(
  row: RankedScannerRow,
  filters: ScannerFilters,
  mutedTickers: Set<string> = new Set(),
): boolean {
  if (filters.hideMuted && mutedTickers.has(row.ticker)) return false;
  if (filters.hideHalted && row.haltStatus === "halted") return false;
  if (filters.watchlistOnly && !row.inWatchlist) return false;
  if (filters.inPositionOnly && !row.inPosition) return false;
  if (filters.minPrice != null && (row.last == null || row.last < filters.minPrice)) {
    return false;
  }
  if (filters.maxPrice != null && (row.last == null || row.last > filters.maxPrice)) {
    return false;
  }
  if (filters.minRvol != null && (row.relativeVolume == null || row.relativeVolume < filters.minRvol)) {
    return false;
  }
  if (
    filters.maxFloatMm != null &&
    (row.floatShares == null || row.floatShares / 1_000_000 > filters.maxFloatMm)
  ) {
    return false;
  }
  if (
    filters.minDollarVolume != null &&
    (row.dollarVolume == null || row.dollarVolume < filters.minDollarVolume)
  ) {
    return false;
  }
  if (filters.newsFreshness?.length && !filters.newsFreshness.includes(row.newsFreshness)) {
    return false;
  }
  if (filters.themes.length && !row.themes.some((theme) => filters.themes.includes(theme))) {
    return false;
  }
  const q = filters.query.trim().toUpperCase();
  if (q) {
    const hay = `${row.ticker} ${row.name ?? ""} ${row.catalystSummary}`.toUpperCase();
    if (!hay.includes(q)) return false;
  }
  return true;
}

export function alertMatchesFilters(
  alert: ScannerAlertEvent,
  filters: ScannerFilters,
  muted: Set<string>,
): boolean {
  if (filters.hideMuted && (muted.has(alert.ticker) || muted.has(`${alert.ticker}:${alert.strategyId}`))) {
    return false;
  }
  return rowMatchesFilters(alert.row, filters, muted);
}

export function applyLayoutFilters(
  lists: Record<string, RankedScannerRow[]>,
  alerts: ScannerAlertEvent[],
  filters: ScannerFilters,
  mutedTickers: Set<string>,
  strategyIds?: string[],
): { lists: Record<string, RankedScannerRow[]>; alerts: ScannerAlertEvent[] } {
  const keep = strategyIds ? new Set(strategyIds) : null;
  const nextLists: Record<string, RankedScannerRow[]> = {};
  for (const [id, rows] of Object.entries(lists)) {
    if (keep && !keep.has(id)) continue;
    nextLists[id] = rows.filter((row) => rowMatchesFilters(row, filters, mutedTickers));
  }
  const nextAlerts = alerts.filter((alert) => {
    if (keep && !keep.has(alert.strategyId)) return false;
    return alertMatchesFilters(alert, filters, mutedTickers);
  });
  return { lists: nextLists, alerts: nextAlerts };
}
