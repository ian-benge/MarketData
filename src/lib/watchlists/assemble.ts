import {
  attachRelativeStrength,
  buildSectorBoard,
  equalWeight,
  moversFrom,
  summarizeQuotes,
} from "./analytics";
import { seedInstrumentRow } from "./instrument-catalog";
import { runScreen } from "./screens";
import {
  ROLE_LABELS,
  SECURITY_TYPE_LABELS,
  TIER_LABELS,
} from "./taxonomy";
import type {
  CoverageItem,
  CoverageQuote,
  CoverageSector,
  CoverageSelection,
  CoverageSnapshot,
  CoverageSummary,
  CoverageWatchlist,
} from "./types";

export function emptyCoverageSummary(): CoverageSummary {
  return {
    nameCount: 0,
    quotedCount: 0,
    advancers: 0,
    decliners: 0,
    unchanged: 0,
    missing: 0,
    avg1dPercent: null,
    avg1wPercent: null,
    avg1mPercent: null,
    avgYtdPercent: null,
    capWeight1dPercent: null,
    vsBenchmark1dPercent: null,
    breadth: null,
    unusualCount: 0,
    quarantinedCount: 0,
    dataQuality: "ok",
    benchmarkSymbol: null,
  };
}

export function emptyCoverageQuote(
  ticker: string,
  item?: CoverageItem | { notes?: string | null; tags?: string[] } | null,
): CoverageQuote {
  const seed = seedInstrumentRow(ticker);
  const named = item && "name" in item ? item.name : null;
  const membership = item && "role" in item ? item : null;
  return {
    ticker,
    name: named ?? (seed.name !== ticker ? seed.name : null),
    last: null,
    change1dPercent: null,
    changeFromOpenPercent: null,
    change1wPercent: null,
    change1mPercent: null,
    changeYtdPercent: null,
    preMarketChangePercent: null,
    afterHoursChangePercent: null,
    vsSpy1dPercent: null,
    vsBenchmark1dPercent: null,
    vsGroup1dPercent: null,
    relativeVolume: null,
    marketCap: null,
    volume: null,
    avgVolume: null,
    dayHigh: null,
    dayLow: null,
    priorClose: null,
    volatility: null,
    sectorId: null,
    sectorName: null,
    notes: item?.notes ?? null,
    tags: item?.tags ?? [],
    role: membership?.role ?? null,
    tier: membership?.tier ?? null,
    rationale: membership?.rationale ?? null,
    securityType: membership?.securityType ?? seed.security_type,
    leverageMultiple: membership?.leverageMultiple ?? seed.leverage_multiple,
    isInverse: membership?.isInverse ?? seed.is_inverse,
    isOtc: membership?.isOtc ?? seed.is_otc,
    resolutionStatus: membership?.resolutionStatus ?? seed.resolution_status,
    underlyingSymbol: membership?.underlyingSymbol ?? seed.underlying_symbol,
    exchange: membership?.exchange ?? seed.exchange,
    themeCount: 0,
    flags: [],
    missing: ["last"],
  };
}

export function placeholderQuote(
  ticker: string,
  item?: CoverageItem | { notes?: string | null; tags?: string[] } | null,
): CoverageQuote {
  return emptyCoverageQuote(ticker, item);
}

export function identityLabel(row: CoverageQuote): string {
  const parts = [SECURITY_TYPE_LABELS[row.securityType]];
  if (row.role) parts.push(ROLE_LABELS[row.role]);
  if (row.tier) parts.push(TIER_LABELS[row.tier]);
  return parts.join(" · ");
}

export function collectionBenchmark(
  selectedList: CoverageWatchlist | null,
  selectedSector: CoverageSector | null,
): string {
  return selectedSector?.benchmarkSymbol?.toUpperCase() || "SPY";
}

export function resolveSelection(
  lists: CoverageWatchlist[],
  sectors: CoverageSector[],
  selection?: CoverageSelection | null,
): {
  selection: CoverageSelection | null;
  selectedList: CoverageWatchlist | null;
  selectedSector: CoverageSector | null;
  symbols: string[];
  itemsByTicker: Map<string, CoverageItem>;
} {
  let selectedList: CoverageWatchlist | null = null;
  let selectedSector: CoverageSector | null = null;

  if (selection?.type === "sector") {
    selectedSector = sectors.find((sector) => sector.id === selection.id) ?? null;
  } else if (selection?.type === "watchlist") {
    selectedList = lists.find((list) => list.id === selection.id) ?? null;
  }

  if (!selectedList && !selectedSector) {
    const activeLists = lists.filter((list) => !list.archivedAt);
    selectedList =
      activeLists.find((list) => list.isDefault) ?? activeLists[0] ?? null;
  }

  const source = selectedSector ?? selectedList;
  const itemsByTicker = new Map(
    (source?.items ?? []).map((item) => [item.ticker, item]),
  );

  return {
    selection: selectedSector
      ? { type: "sector", id: selectedSector.id }
      : selectedList
        ? { type: "watchlist", id: selectedList.id }
        : null,
    selectedList,
    selectedSector,
    symbols: source?.symbols ?? [],
    itemsByTicker,
  };
}

export function decorateRows(
  rows: CoverageQuote[],
  sectors: CoverageSector[],
  itemsByTicker: Map<string, CoverageItem | { notes: string | null; tags: string[] }>,
): CoverageQuote[] {
  const byTicker = new Map<string, CoverageSector>();
  const themeCount = new Map<string, number>();
  for (const sector of sectors) {
    if (sector.archivedAt) continue;
    for (const symbol of sector.symbols) {
      if (!byTicker.has(symbol)) byTicker.set(symbol, sector);
      if (sector.kind === "theme" || sector.kind === "industry") {
        themeCount.set(symbol, (themeCount.get(symbol) ?? 0) + 1);
      }
    }
  }
  return rows.map((row) => {
    const sector = byTicker.get(row.ticker);
    const item = itemsByTicker.get(row.ticker);
    const membership = item && "role" in item ? item : null;
    return {
      ...row,
      sectorId: sector?.id ?? row.sectorId,
      sectorName: sector?.name ?? row.sectorName,
      notes: item?.notes ?? row.notes,
      tags: item?.tags?.length ? item.tags : row.tags,
      role: membership?.role ?? row.role,
      tier: membership?.tier ?? row.tier,
      rationale: membership?.rationale ?? row.rationale,
      securityType: membership?.securityType ?? row.securityType,
      leverageMultiple: membership?.leverageMultiple ?? row.leverageMultiple,
      isInverse: membership?.isInverse ?? row.isInverse,
      isOtc: membership?.isOtc ?? row.isOtc,
      resolutionStatus: membership?.resolutionStatus ?? row.resolutionStatus,
      underlyingSymbol: membership?.underlyingSymbol ?? row.underlyingSymbol,
      exchange: membership?.exchange ?? row.exchange,
      themeCount: themeCount.get(row.ticker) ?? row.themeCount,
    };
  });
}

export function groupAverages(
  rows: CoverageQuote[],
  sectors: CoverageSector[],
): Map<string, number | null> {
  const out = new Map<string, number | null>();
  const byTicker = new Map(rows.map((row) => [row.ticker, row]));
  for (const sector of sectors) {
    if (sector.archivedAt) continue;
    const members = sector.symbols
      .map((ticker) => byTicker.get(ticker))
      .filter((row): row is CoverageQuote => row != null);
    const avg = equalWeight(members, "change1dPercent");
    for (const ticker of sector.symbols) out.set(ticker, avg);
  }
  return out;
}

function selectedSymbols(
  resolved: ReturnType<typeof resolveSelection>,
  quotes: CoverageQuote[],
  snapshotCatalysts: CoverageSnapshot["catalysts"],
): string[] {
  if (resolved.selectedSector?.screenKey) {
    return runScreen(resolved.selectedSector.screenKey, quotes, {
      universe: resolved.selectedSector.symbols,
      catalysts: snapshotCatalysts,
    });
  }
  return resolved.symbols;
}

export function overlaySessionLists(
  snapshot: CoverageSnapshot,
  lists: CoverageWatchlist[],
  sectors: CoverageSector[],
  selection?: CoverageSelection | null,
): CoverageSnapshot {
  const resolved = resolveSelection(lists, sectors, selection ?? snapshot.selection);
  const quoteByTicker = new Map(
    [...snapshot.quotes, ...snapshot.rows].map((row) => [row.ticker, row]),
  );
  const universe = decorateRows(
    [...quoteByTicker.values()],
    sectors,
    resolved.itemsByTicker,
  );
  const spy1d = quoteByTicker.get("SPY")?.change1dPercent ?? null;
  const benchmark = collectionBenchmark(resolved.selectedList, resolved.selectedSector);
  const benchmark1d = quoteByTicker.get(benchmark)?.change1dPercent ?? spy1d;
  const withRelative = attachRelativeStrength(
    universe,
    spy1d,
    groupAverages(universe, sectors),
    benchmark1d,
  );
  const relativeByTicker = new Map(withRelative.map((row) => [row.ticker, row]));
  const symbols = selectedSymbols(resolved, withRelative, snapshot.catalysts);
  const selectedRows = symbols.map((ticker) => {
    const existing = relativeByTicker.get(ticker);
    const item = resolved.itemsByTicker.get(ticker);
    if (existing) {
      return {
        ...existing,
        notes: item?.notes ?? existing.notes,
        tags: item?.tags?.length ? item.tags : existing.tags,
        role: item?.role ?? existing.role,
        tier: item?.tier ?? existing.tier,
        rationale: item?.rationale ?? existing.rationale,
      };
    }
    return placeholderQuote(ticker, item);
  });
  return {
    ...snapshot,
    selection: resolved.selection,
    watchlists: lists,
    sectors,
    quotes: withRelative,
    rows: selectedRows,
    summary: summarizeQuotes(
      selectedRows,
      benchmark,
      quoteByTicker.get(benchmark)?.change1dPercent ?? spy1d,
    ),
    winners: moversFrom(selectedRows, "up"),
    losers: moversFrom(selectedRows, "down"),
    unusual: moversFrom(selectedRows, "unusual"),
    sectorBoard: buildSectorBoard(
      sectors,
      relativeByTicker,
      spy1d,
      snapshot.catalysts,
    ),
    moveExplanations: (snapshot.moveExplanations ?? []).filter((row) =>
      selectedRows.some((item) => item.ticker === row.ticker),
    ),
  };
}
