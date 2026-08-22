import { rowMatchesFilters } from "@/lib/scanner/filters";
import { sortRows } from "@/lib/scanner/query";
import type {
  CatalystKind,
  NewsFreshnessBucket,
  RankedScannerRow,
  ScannerAlertEvent,
  ScannerCenterSnapshot,
  ScannerFeatureSnapshot,
  ScannerFilters,
  HaltStatus,
  ScannerSessionPreset,
  ScannerSystem,
  ScannerUserState,
} from "@/lib/scanner/types";
import { CATALYST_LABELS, NEWS_FRESHNESS_LABELS } from "@/lib/scanner/types";

export const SYSTEM_SHORT_LABELS: Record<ScannerSystem, string> = {
  momentum: "Momentum",
  desk: "Desk",
};

export const SYSTEM_ATTRIBUTION: Record<ScannerSystem, string> = {
  momentum: "Ross · Warrior Trading",
  desk: "Desk Intelligence",
};

export const CATALYST_COMPACT_LABELS: Record<CatalystKind, string> = {
  confirmed_company: "Confirmed",
  likely_catalyst: "Likely",
  sector_sympathy: "Sympathy",
  technical: "Technical",
  macro: "Macro",
  unexplained: "Unexplained",
};

export const NEWS_FRESHNESS_COMPACT: Record<NewsFreshnessBucket, string> = {
  "0_2h": "0–2h",
  "2_12h": "2–12h",
  "12_24h": "12–24h",
  none: "—",
};

export const SESSION_CLOCK_LABELS: Record<string, string> = {
  overnight: "Overnight",
  premarket: "Premarket",
  regular: "Regular",
  afterhours: "After hours",
  closed: "Closed",
};

export type ScannerSort = { key: string; dir: "asc" | "desc" };

export type ScanGlance = {
  names: number;
  hits: number;
  alerts: number;
  halted: number;
  resumed: number;
  unexplained: number;
  confirmed: number;
  book: number;
  watchlist: number;
};

export function usefulHaltReason(
  reason: string | null | undefined,
  ticker: string,
): string | null {
  if (!reason) return null;
  const trimmed = reason.replace(/\s+/g, " ").trim();
  if (trimmed.length < 6) return null;
  const upper = trimmed.toUpperCase();
  const symbol = ticker.trim().toUpperCase();
  if (!symbol) return trimmed;
  if (upper === symbol || upper === `HALT ${symbol}` || upper === `${symbol} HALT`) return null;
  return trimmed;
}

export function haltMark(status: HaltStatus | null | undefined): "HALT" | "RESUME" | null {
  if (status === "halted") return "HALT";
  if (status === "resumed") return "RESUME";
  return null;
}

export function wideSpread(spreadFraction: number | null | undefined): boolean {
  return spreadFraction != null && Number.isFinite(spreadFraction) && spreadFraction >= 0.02;
}

export function catalystTone(
  kind: CatalystKind | RankedScannerRow["catalystKind"],
): "positive" | "info" | "warn" | "neutral" {
  if (kind === "confirmed_company") return "positive";
  if (kind === "likely_catalyst") return "info";
  if (kind === "sector_sympathy" || kind === "macro" || kind === "technical") return "warn";
  return "neutral";
}

export function freshnessKind(
  snapshot: ScannerCenterSnapshot,
): "mock" | "stale" | "partial" | "unavailable" | "delayed" | "realtime" {
  const state = snapshot.coverage.freshness;
  if (state === "mock") return "mock";
  if (state === "stale") return "stale";
  if (state === "partial") return "partial";
  if (state === "unavailable") return "unavailable";
  if (state === "delayed") return "delayed";
  return snapshot.coverage.latencyClass === "realtime" ? "realtime" : "delayed";
}

export function freshnessLabel(snapshot: ScannerCenterSnapshot): string {
  const cadence = snapshot.coverage.cadenceSeconds;
  const feed = snapshot.coverage.feedCoverage;
  if (snapshot.mocked) return "Mock · not live";
  if (snapshot.coverage.freshness === "stale") return "Stale snapshot";
  if (snapshot.coverage.freshness === "partial") return "Partial coverage";
  if (snapshot.coverage.freshness === "unavailable") return "Unavailable";
  if (feed === "iex") {
    return `IEX realtime + Yahoo pre/post overlay · polling ${cadence}s · not SIP`;
  }
  if (snapshot.coverage.latencyClass === "realtime" && !snapshot.coverage.universeLimited) {
    return `Polling ${cadence}s · live feed`;
  }
  if (snapshot.coverage.latencyClass === "delayed_15m") return `Delayed · polling ${cadence}s`;
  return `Polling ${cadence}s · not a live socket`;
}

export function formatElapsed(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return "—";
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return "—";
  const seconds = Math.max(0, Math.round((now - then) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

export function formatFloatShares(shares: number | null | undefined): string {
  if (shares == null || !Number.isFinite(shares)) return "—";
  if (Math.abs(shares) >= 1_000_000) return `${(shares / 1_000_000).toFixed(1)}M`;
  if (Math.abs(shares) >= 1_000) return `${(shares / 1_000).toFixed(0)}K`;
  return shares.toFixed(0);
}

export function formatHodGap(distanceFromHodPct: number | null | undefined): string {
  if (distanceFromHodPct == null || !Number.isFinite(distanceFromHodPct)) return "—";
  if (Math.abs(distanceFromHodPct) < 0.05) return "HOD";
  const sign = distanceFromHodPct > 0 ? "+" : "−";
  return `${sign}${Math.abs(distanceFromHodPct).toFixed(2)}%`;
}

export function catalystLabel(kind: CatalystKind, compact = false): string {
  return compact ? CATALYST_COMPACT_LABELS[kind] : CATALYST_LABELS[kind];
}

export function newsFreshnessLabel(bucket: NewsFreshnessBucket, compact = false): string {
  return compact ? NEWS_FRESHNESS_COMPACT[bucket] : NEWS_FRESHNESS_LABELS[bucket];
}

export function sessionClockLabel(session: string | null | undefined): string {
  if (!session) return "Session";
  return SESSION_CLOCK_LABELS[session] ?? session;
}

export function defaultSortDir(key: string): "asc" | "desc" {
  return key === "rank" || key === "ticker" ? "asc" : "desc";
}

export function toggleSort(current: ScannerSort, key: string): ScannerSort {
  if (current.key === key) {
    return { key, dir: current.dir === "asc" ? "desc" : "asc" };
  }
  return { key, dir: defaultSortDir(key) };
}

export function isMuted(
  mutes: ScannerUserState["mutes"],
  ticker: string,
  strategyId?: string | null,
): boolean {
  const now = Date.now();
  return mutes.some((mute) => {
    if (mute.ticker !== ticker) return false;
    if (mute.mutedUntil && Date.parse(mute.mutedUntil) < now) return false;
    if (!strategyId || mute.strategyId === "*" || mute.strategyId === strategyId) return true;
    return false;
  });
}

export function displayRows(
  rows: RankedScannerRow[],
  filters: ScannerFilters,
  sort: ScannerSort,
  pins: string[],
): RankedScannerRow[] {
  const muted = new Set<string>();
  const filtered = rows.filter((row) => rowMatchesFilters(row, filters, muted));
  const sorted = sortRows(filtered, sort.key, sort.dir);
  if (sort.key !== "rank" || pins.length === 0) return sorted;
  const pinned = new Set(pins);
  return [
    ...sorted.filter((row) => pinned.has(row.ticker)),
    ...sorted.filter((row) => !pinned.has(row.ticker)),
  ];
}

export function displayAlerts(
  alerts: ScannerAlertEvent[],
  filters: ScannerFilters,
  strategyId?: string | null,
): ScannerAlertEvent[] {
  return alerts.filter((alert) => {
    if (strategyId && alert.strategyId !== strategyId) return false;
    if (filters.query.trim()) {
      const q = filters.query.trim().toUpperCase();
      const hay = `${alert.ticker} ${alert.name ?? ""} ${alert.strategyTitle} ${alert.explanation.headline}`.toUpperCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export function orderAlertsForTape(
  alerts: ScannerAlertEvent[],
  selected: string,
): ScannerAlertEvent[] {
  if (!selected) return alerts;
  const symbol = selected.toUpperCase();
  return [
    ...alerts.filter((alert) => alert.ticker === symbol),
    ...alerts.filter((alert) => alert.ticker !== symbol),
  ];
}

export function summarizeScan(
  lists: Record<string, RankedScannerRow[]>,
  alerts: ScannerAlertEvent[],
  strategyIds?: string[],
): ScanGlance {
  const keep = strategyIds ? new Set(strategyIds) : null;
  const names = new Set<string>();
  const halted = new Set<string>();
  const resumed = new Set<string>();
  const unexplained = new Set<string>();
  const confirmed = new Set<string>();
  const book = new Set<string>();
  const watchlist = new Set<string>();
  let hits = 0;
  for (const [id, rows] of Object.entries(lists)) {
    if (keep && !keep.has(id)) continue;
    hits += rows.length;
    for (const row of rows) {
      names.add(row.ticker);
      if (row.haltStatus === "halted") halted.add(row.ticker);
      if (row.haltStatus === "resumed") resumed.add(row.ticker);
      if (row.catalystKind === "unexplained") unexplained.add(row.ticker);
      if (row.catalystKind === "confirmed_company") confirmed.add(row.ticker);
      if (row.inPosition) book.add(row.ticker);
      if (row.inWatchlist) watchlist.add(row.ticker);
    }
  }
  const activeAlerts = alerts.filter(
    (alert) =>
      alert.status !== "expired" &&
      alert.status !== "suppressed" &&
      (!keep || keep.has(alert.strategyId)),
  );
  return {
    names: names.size,
    hits,
    alerts: activeAlerts.length,
    halted: halted.size,
    resumed: resumed.size,
    unexplained: unexplained.size,
    confirmed: confirmed.size,
    book: book.size,
    watchlist: watchlist.size,
  };
}

export function alertCountByStrategy(alerts: ScannerAlertEvent[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const alert of alerts) {
    if (alert.status === "expired" || alert.status === "suppressed") continue;
    counts[alert.strategyId] = (counts[alert.strategyId] ?? 0) + 1;
  }
  return counts;
}

export function neighboringTicker(
  rows: RankedScannerRow[],
  selected: string,
  delta: -1 | 1,
): string | null {
  if (!rows.length) return null;
  const index = rows.findIndex((row) => row.ticker === selected);
  const next = index < 0 ? (delta > 0 ? 0 : rows.length - 1) : index + delta;
  if (next < 0 || next >= rows.length) return rows[index]?.ticker ?? rows[0]!.ticker;
  return rows[next]!.ticker;
}

export function neighboringStrategy(
  ids: string[],
  current: string,
  delta: -1 | 1,
): string | null {
  if (!ids.length) return null;
  const index = ids.indexOf(current);
  const next = index < 0 ? 0 : (index + delta + ids.length) % ids.length;
  return ids[next] ?? null;
}

export function filtersFromQuick(
  base: Pick<ScannerFilters, "query" | "watchlistOnly" | "inPositionOnly" | "hideHalted"> & {
    newsOnly?: boolean;
    lowFloat?: boolean;
    hotRvol?: boolean;
    showMuted?: boolean;
  },
): ScannerFilters {
  return {
    query: base.query,
    minPrice: null,
    maxPrice: null,
    minRvol: base.hotRvol ? 2 : null,
    maxFloatMm: base.lowFloat ? 20 : null,
    minDollarVolume: null,
    watchlistOnly: base.watchlistOnly,
    inPositionOnly: base.inPositionOnly,
    newsFreshness: base.newsOnly ? ["0_2h", "2_12h", "12_24h"] : null,
    themes: [],
    hideHalted: base.hideHalted,
    hideMuted: !base.showMuted,
  };
}

export function focusFromSnapshot(
  snapshot: ScannerCenterSnapshot | null,
  ticker: string,
  rows: RankedScannerRow[],
): { feature: ScannerFeatureSnapshot | null; row: RankedScannerRow | null } {
  if (!ticker) return { feature: null, row: null };
  const feature = snapshot?.features[ticker] ?? null;
  const row =
    rows.find((item) => item.ticker === ticker) ??
    Object.values(snapshot?.lists ?? {})
      .flat()
      .find((item) => item.ticker === ticker) ??
    null;
  return { feature, row };
}

export function humanizeCoverageNote(note: string): string {
  const lower = note.toLowerCase();
  if (lower.includes("forbidden") || lower.includes("not entitled") || /\b403\b/.test(note)) {
    return "A secondary screener is not entitled on this feed. Ranked lists use the subscribed universe.";
  }
  if (lower.includes("unavailable") || lower.includes("rate limit")) {
    return "A secondary screener is unavailable. Ranked lists use the subscribed universe.";
  }
  return note;
}

export function coverageLine(snapshot: ScannerCenterSnapshot): string {
  const provider = snapshot.coverage.providerName ?? "provider";
  const session = sessionClockLabel(snapshot.session);
  const received = snapshot.coverage.symbolsReceived;
  const requested = snapshot.coverage.symbolsRequested;
  const note = snapshot.coverage.coverageNotes[0];
  return note
    ? `${provider} · ${session} · ${received}/${requested} names · ${humanizeCoverageNote(note)}`
    : `${provider} · ${session} · ${received}/${requested} names`;
}

export function presetFitsSession(
  preset: ScannerSessionPreset,
  session: string | null | undefined,
): boolean {
  if (!session) return true;
  if (session === "premarket" || session === "overnight") return preset === "premarket";
  if (session === "afterhours" || session === "closed") return preset === "after_hours";
  return preset === "open" || preset === "midday" || preset === "power_hour";
}

export function strategyWithHits(
  strategyIds: string[],
  lists: Record<string, RankedScannerRow[]>,
  current?: string,
): string {
  if (current && (lists[current]?.length ?? 0) > 0 && strategyIds.includes(current)) {
    return current;
  }
  return strategyIds.find((id) => (lists[id]?.length ?? 0) > 0) ?? current ?? strategyIds[0] ?? "";
}

export function scoreWidth(total: number): number {
  return Math.max(4, Math.min(100, total));
}
