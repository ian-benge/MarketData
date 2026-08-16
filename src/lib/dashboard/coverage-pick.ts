import type { DashboardWatchlistSnapshot } from "@/lib/market-data/watchlist-types";

export type CoveragePick = { type: "watchlist" | "sector"; id: string };

export function parseCoveragePick(value: string): CoveragePick | null {
  const sep = value.indexOf(":");
  if (sep < 0) return null;
  const type = value.slice(0, sep);
  const id = value.slice(sep + 1);
  if ((type !== "watchlist" && type !== "sector") || !id) return null;
  return { type, id };
}

export function coveragePickValue(pick: CoveragePick | null | undefined): string {
  return pick ? `${pick.type}:${pick.id}` : "";
}

export function sameCoveragePick(
  left: CoveragePick | null | undefined,
  right: CoveragePick | null | undefined,
): boolean {
  return Boolean(left && right && left.type === right.type && left.id === right.id);
}

export function initialCoveragePick(
  selectedSectorId?: string,
  selectedListId?: string,
  fallbackListId?: string,
): CoveragePick | null {
  if (selectedSectorId) return { type: "sector", id: selectedSectorId };
  const id = selectedListId ?? fallbackListId;
  return id ? { type: "watchlist", id } : null;
}

export function watchlistForPick(
  pick: CoveragePick | null | undefined,
  override: DashboardWatchlistSnapshot | null | undefined,
  dashboard: DashboardWatchlistSnapshot | null | undefined,
): DashboardWatchlistSnapshot | null {
  if (override && (!pick || override.listId === pick.id)) return override;
  if (dashboard && (!pick || dashboard.listId === pick.id)) return dashboard;
  return override ?? dashboard ?? null;
}
