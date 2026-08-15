/**
 * Compact coverage summary for Market Overview. Not a CoverageSnapshot.
 */

import type { SessionUser } from "@/lib/auth/session";
import type { NormalizedQuote } from "@/lib/providers/types";
import {
  attachRelativeStrength,
  buildSectorBoard,
  flagsFor,
} from "@/lib/watchlists/analytics";
import { emptyCoverageQuote, groupAverages } from "@/lib/watchlists/assemble";
import type {
  CoverageQuote,
  CoverageSector,
  CoverageWatchlist,
  NavGroup,
  SectorKind,
} from "@/lib/watchlists/types";

export type DashboardCoverageDigest = {
  lists: Array<{
    id: string;
    name: string;
    visibility: "shared" | "personal";
    isDefault: boolean;
    symbolCount: number;
  }>;
  selectedListId: string | null;
  exceptions: Array<{
    ticker: string;
    listId?: string;
    sectorId?: string;
    flags: string[];
    change1dPercent: number | null;
    relativeVolume: number | null;
  }>;
  deskSectors: Array<{
    id: string;
    name: string;
    kind: SectorKind;
    navGroup: NavGroup;
    vsSpy1dPercent: number | null;
    avg1dPercent: number | null;
    breadth: number | null;
    unusualCount: number;
    leaders: string[];
    benchmarkSymbol: string | null;
    symbolCount: number;
    quotedCount: number;
  }>;
  coverageSymbolSet: string[];
  inBookTickers: string[];
};

const EXCEPTION_CAP = 8;

export function visibleOverviewLists(
  lists: CoverageWatchlist[],
  userId: string,
): CoverageWatchlist[] {
  return lists.filter(
    (list) =>
      !list.archivedAt &&
      (list.visibility === "shared" || list.ownerId === userId),
  );
}

function uniqueSymbols(groups: string[][]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const group of groups) {
    for (const raw of group) {
      const symbol = raw.trim().toUpperCase();
      if (!symbol || seen.has(symbol)) continue;
      seen.add(symbol);
      out.push(symbol);
    }
  }
  return out;
}

function quoteFromTape(
  ticker: string,
  tapeByTicker: Map<string, NormalizedQuote>,
): CoverageQuote {
  const row = emptyCoverageQuote(ticker);
  const quote = tapeByTicker.get(ticker);
  if (!quote) return row;
  return {
    ...row,
    last: quote.last,
    change1dPercent: quote.changePercent ?? null,
    volume: quote.volume ?? null,
    priorClose: quote.priorClose ?? null,
    missing: quote.last == null ? ["last"] : [],
  };
}

function membership(
  ticker: string,
  lists: CoverageWatchlist[],
  sectors: CoverageSector[],
): { listId?: string; sectorId?: string } {
  const list = lists.find((row) => row.symbols.includes(ticker));
  const sector = sectors.find(
    (row) => row.kind === "sector" && !row.archivedAt && row.symbols.includes(ticker),
  );
  return {
    listId: list?.id,
    sectorId: sector?.id,
  };
}

export function buildDashboardCoverageDigest(input: {
  user: Pick<SessionUser, "id">;
  tape: NormalizedQuote[];
  lists: CoverageWatchlist[];
  sectors: CoverageSector[];
  selectedListId?: string | null;
  inBookTickers?: string[];
}): DashboardCoverageDigest {
  const visible = visibleOverviewLists(input.lists, input.user.id);
  const defaultShared = visible.find(
    (list) => list.visibility === "shared" && list.isDefault,
  );
  const personal = visible.filter((list) => list.visibility === "personal");
  const selected =
    visible.find((list) => list.id === input.selectedListId) ??
    defaultShared ??
    visible[0] ??
    null;

  const coverageSymbolSet = uniqueSymbols([
    ...personal.map((list) => list.symbols),
    defaultShared?.symbols ?? [],
    selected?.symbols ?? [],
  ]);

  const exceptionUniverse = uniqueSymbols([
    ...personal.map((list) => list.symbols),
    defaultShared?.symbols ?? [],
  ]);

  const tapeByTicker = new Map(
    input.tape.map((quote) => [quote.ticker.toUpperCase(), quote]),
  );
  const boardSectors = input.sectors.filter((sector) => !sector.archivedAt);
  const quoteTickers = uniqueSymbols([
    exceptionUniverse,
    coverageSymbolSet,
    boardSectors.flatMap((sector) => sector.symbols),
    ["SPY"],
  ]);
  const rawQuotes = quoteTickers.map((ticker) =>
    quoteFromTape(ticker, tapeByTicker),
  );
  const spy1d =
    rawQuotes.find((row) => row.ticker === "SPY")?.change1dPercent ?? null;
  const withRelative = attachRelativeStrength(
    rawQuotes,
    spy1d,
    groupAverages(rawQuotes, boardSectors),
    spy1d,
  );
  const flaggedByTicker = new Map(withRelative.map((row) => [row.ticker, row]));

  const exceptions = exceptionUniverse
    .map((ticker) => flaggedByTicker.get(ticker))
    .filter((row): row is CoverageQuote => {
      if (!row) return false;
      const flags = flagsFor(row);
      return flags.includes("rvol") || flags.includes("move") || flags.includes("peer");
    })
    .sort((a, b) => {
      const aScore = (a.relativeVolume ?? 0) * Math.abs(a.change1dPercent ?? 0);
      const bScore = (b.relativeVolume ?? 0) * Math.abs(b.change1dPercent ?? 0);
      if (bScore !== aScore) return bScore - aScore;
      return Math.abs(b.change1dPercent ?? 0) - Math.abs(a.change1dPercent ?? 0);
    })
    .slice(0, EXCEPTION_CAP)
    .map((row) => ({
      ticker: row.ticker,
      flags: row.flags,
      change1dPercent: row.change1dPercent,
      relativeVolume: row.relativeVolume,
      ...membership(row.ticker, visible, boardSectors),
    }));

  const board = buildSectorBoard(boardSectors, flaggedByTicker, spy1d);
  const deskSectors = board
    .filter((row) => row.kind !== "screen" || row.quotedCount > 0)
    .map((row) => ({
      id: row.id,
      name: row.name,
      kind: row.kind,
      navGroup: row.navGroup,
      vsSpy1dPercent: row.vsSpy1dPercent,
      avg1dPercent: row.avg1dPercent,
      breadth: row.breadth,
      unusualCount: row.unusualCount,
      leaders: row.leaders,
      benchmarkSymbol: row.benchmarkSymbol,
      symbolCount: row.symbolCount,
      quotedCount: row.quotedCount,
    }));

  return {
    lists: visible.map((list) => ({
      id: list.id,
      name: list.name,
      visibility: list.visibility,
      isDefault: list.isDefault,
      symbolCount: list.symbols.length,
    })),
    selectedListId: selected?.id ?? null,
    exceptions,
    deskSectors,
    coverageSymbolSet,
    inBookTickers: [...new Set((input.inBookTickers ?? []).map((ticker) => ticker.toUpperCase()))],
  };
}

export function emptyDashboardCoverageDigest(
  extra?: Partial<DashboardCoverageDigest>,
): DashboardCoverageDigest {
  return {
    lists: [],
    selectedListId: null,
    exceptions: [],
    deskSectors: [],
    coverageSymbolSet: [],
    inBookTickers: [],
    ...extra,
  };
}
