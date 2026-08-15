import type { SessionUser } from "@/lib/auth/session";
import { getEnv } from "@/lib/env";
import { canEditSectors, canEditWatchlists, isAdmin } from "@/lib/domain/permissions";
import { getDashboardResearch } from "@/lib/dashboard/research-context";
import { getEarningsCalendarSnapshot } from "@/lib/market-data/earnings/service";
import {
  attachRelativeStrength,
  buildSectorBoard,
  moversFrom,
  summarizeQuotes,
} from "./analytics";
import {
  collectionBenchmark,
  decorateRows,
  emptyCoverageSummary,
  groupAverages,
  placeholderQuote,
  resolveSelection,
} from "./assemble";
import { loadCoverageQuotes, type CoverageQuoteDeps } from "./quotes";
import { runScreen } from "./screens";
import {
  listStoredSectors,
  listStoredWatchlists,
  resolvePersistenceMode,
} from "./store";
import type {
  CoverageCatalyst,
  CoverageQuote,
  CoverageSector,
  CoverageSelection,
  CoverageSnapshot,
  CoverageWatchlist,
} from "./types";

export { overlaySessionLists } from "./assemble";

/** Enough unique names for the live rotation board plus the selected tape. */
export const COVERAGE_QUOTE_CAP = 400;

export function quoteUniverse(
  selected: string[],
  sectors: CoverageSector[],
  extraSymbols: string[] = [],
  cap = COVERAGE_QUOTE_CAP,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (symbol: string) => {
    const next = symbol.trim().toUpperCase();
    if (!next || seen.has(next) || out.length >= cap) return false;
    seen.add(next);
    out.push(next);
    return true;
  };

  add("SPY");
  add("XLE");
  for (const symbol of selected) add(symbol);

  const active = sectors.filter((sector) => !sector.archivedAt && sector.symbols.length);
  let index = 0;
  while (out.length < cap) {
    let remaining = false;
    for (const sector of active) {
      if (index < sector.symbols.length) remaining = true;
      const symbol = sector.symbols[index];
      if (symbol) add(symbol);
      if (out.length >= cap) break;
    }
    if (!remaining) break;
    index += 1;
  }

  for (const symbol of extraSymbols) add(symbol);
  return out;
}

function unresolvedFrom(
  lists: CoverageWatchlist[],
  sectors: CoverageSector[],
): number {
  const seen = new Set<string>();
  for (const collection of [...lists, ...sectors]) {
    for (const item of collection.items) {
      if (
        item.resolutionStatus === "quarantined" ||
        item.resolutionStatus === "unverified" ||
        item.securityType === "unknown"
      ) {
        seen.add(item.ticker);
      }
    }
  }
  return seen.size;
}

function withContextFlags(
  rows: CoverageQuote[],
  earningsTickers: Set<string>,
): CoverageQuote[] {
  return rows.map((row) => {
    const flags = [...row.flags];
    if (earningsTickers.has(row.ticker) && !flags.includes("earnings")) {
      flags.push("earnings");
    }
    if (
      (row.last == null ||
        row.missing.includes("last") ||
        row.resolutionStatus === "quarantined") &&
      !flags.includes("stale")
    ) {
      flags.push("stale");
    }
    return { ...row, flags };
  });
}

export function emptyCoverageSnapshot(
  user: SessionUser,
  error: string | null = null,
): CoverageSnapshot {
  return {
    persistence: "unavailable",
    usingFixtures: false,
    canEditWatchlists: canEditWatchlists(user.role),
    canEditSectors: canEditSectors(user.role),
    isAdmin: isAdmin(user.role),
    viewerId: user.id ?? "",
    asOf: new Date().toISOString(),
    stale: false,
    error,
    quoteError: null,
    latencyCoverageLabel: null,
    marketSession: null,
    selection: null,
    watchlists: [],
    sectors: [],
    quotes: [],
    rows: [],
    summary: emptyCoverageSummary(),
    winners: [],
    losers: [],
    unusual: [],
    sectorBoard: [],
    catalysts: [],
    unresolvedCount: 0,
  };
}

async function loadCatalysts(
  symbols: string[],
): Promise<{ catalysts: CoverageCatalyst[]; earningsDates: Map<string, string> }> {
  const set = new Set(symbols.map((symbol) => symbol.toUpperCase()));
  const earningsDates = new Map<string, string>();
  const catalysts: CoverageCatalyst[] = [];
  if (!set.size) return { catalysts, earningsDates };
  const env = getEnv();
  try {
    const earnings = await getEarningsCalendarSnapshot(env);
    const today = new Date().toISOString().slice(0, 10);
    for (const event of earnings.events) {
      const ticker = event.ticker.toUpperCase();
      earningsDates.set(ticker, event.reportDate);
      if (!set.has(ticker)) continue;
      if (event.reportDate < today) continue;
      catalysts.push({
        id: event.id,
        ticker,
        kind: "earnings",
        title: `${event.ticker} earnings${event.session === "bmo" ? " BMO" : event.session === "amc" ? " AMC" : ""}`,
        at: event.reportDate,
        url: null,
      });
    }
  } catch {
    /* optional */
  }
  try {
    const research = await getDashboardResearch(env);
    for (const item of research.headlines) {
      const ticker = (item.tickers ?? [])
        .map((value) => value.toUpperCase())
        .find((value) => set.has(value));
      if (!ticker) continue;
      catalysts.push({
        id: item.id,
        ticker,
        kind: "news",
        title: item.title,
        at: item.publishedAt,
        url: item.url,
      });
    }
  } catch {
    /* optional */
  }
  catalysts.sort((a, b) => (a.at ?? "").localeCompare(b.at ?? ""));
  return { catalysts: catalysts.slice(0, 16), earningsDates };
}

export async function buildCoverageSnapshot(options: {
  user: SessionUser;
  selection?: CoverageSelection | null;
  includeArchived?: boolean;
  lists?: CoverageWatchlist[];
  sectors?: CoverageSector[];
  quoteDeps?: CoverageQuoteDeps;
}): Promise<CoverageSnapshot> {
  const persistence = resolvePersistenceMode(options.user);
  const listed = options.lists
    ? { lists: options.lists, persistence }
    : await listStoredWatchlists(options.user, {
        includeArchived: options.includeArchived,
      });
  const storedLists = listed.lists;
  const storedSectors =
    options.sectors ??
    (await listStoredSectors(options.user, {
      includeArchived: options.includeArchived,
    })).sectors;
  const storePersistence = listed.persistence;

  if (storePersistence === "unavailable" && !options.lists) {
    return emptyCoverageSnapshot(
      options.user,
      "Coverage persistence is not connected in this environment.",
    );
  }

  const resolved = resolveSelection(
    storedLists,
    storedSectors,
    options.selection,
  );
  const extraSymbols = storedLists.flatMap((list) =>
    list.archivedAt ? [] : list.symbols,
  );
  const symbolsToQuote = quoteUniverse(
    resolved.symbols,
    storedSectors,
    extraSymbols,
  );
  const quoted = await loadCoverageQuotes(symbolsToQuote, options.quoteDeps);
  const spy1d =
    quoted.rows.find((row) => row.ticker === "SPY")?.change1dPercent ?? null;
  const decorated = decorateRows(
    quoted.rows,
    storedSectors,
    resolved.itemsByTicker,
  );
  const benchmark = collectionBenchmark(resolved.selectedList, resolved.selectedSector);
  const benchmark1d =
    quoted.rows.find((row) => row.ticker === benchmark)?.change1dPercent ?? spy1d;
  const withRelative = attachRelativeStrength(
    decorated,
    spy1d,
    groupAverages(decorated, storedSectors),
    benchmark1d,
  );
  const relativeByTicker = new Map(withRelative.map((row) => [row.ticker, row]));
  const { catalysts, earningsDates } = await loadCatalysts(symbolsToQuote);
  const earningsTickers = new Set(
    [...earningsDates.entries()]
      .filter(([, date]) => date >= new Date().toISOString().slice(0, 10))
      .map(([ticker]) => ticker),
  );
  const flagged = withContextFlags(withRelative, earningsTickers);
  const flaggedByTicker = new Map(flagged.map((row) => [row.ticker, row]));
  const selectedSymbols = resolved.selectedSector?.screenKey
    ? runScreen(resolved.selectedSector.screenKey, flagged, {
        universe: resolved.selectedSector.symbols,
        catalysts,
        earningsDates,
      })
    : resolved.symbols;
  const selectedRows = selectedSymbols.map(
    (ticker) =>
      flaggedByTicker.get(ticker) ??
      placeholderQuote(ticker, resolved.itemsByTicker.get(ticker)),
  );

  return {
    persistence: storePersistence,
    usingFixtures: quoted.usingFixtures || storePersistence === "fixtures",
    canEditWatchlists: canEditWatchlists(options.user.role),
    canEditSectors: canEditSectors(options.user.role),
    isAdmin: isAdmin(options.user.role),
    viewerId: options.user.id,
    asOf: quoted.asOf,
    stale: quoted.stale,
    error:
      storePersistence === "unavailable"
        ? "Coverage persistence is not connected in this environment."
        : null,
    quoteError: quoted.error,
    latencyCoverageLabel: quoted.latencyCoverageLabel,
    marketSession: quoted.marketSession,
    selection: resolved.selection,
    watchlists: storedLists,
    sectors: storedSectors,
    quotes: flagged,
    rows: selectedRows,
    summary: summarizeQuotes(selectedRows, benchmark, benchmark1d),
    winners: moversFrom(selectedRows, "up"),
    losers: moversFrom(selectedRows, "down"),
    unusual: moversFrom(selectedRows, "unusual"),
    sectorBoard: buildSectorBoard(storedSectors, flaggedByTicker, spy1d, catalysts),
    catalysts: catalysts.filter((item) =>
      selectedSymbols.includes(item.ticker),
    ),
    unresolvedCount: unresolvedFrom(storedLists, storedSectors),
  };
}
