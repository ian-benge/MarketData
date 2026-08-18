import { isDemoAuthEnabled } from "@/lib/auth/demo";
import type { Env } from "@/lib/env";
import { fixtureWatchlists } from "@/lib/fixtures/watchlists";
import type { NormalizedQuote } from "@/lib/providers/types";
import {
  assembleWatchlistRows,
  buildWatchlistDiagnostics,
  watchlistQuotedCount,
} from "@/lib/market-data/watchlist-assemble";
import type {
  DashboardWatchlistList,
  DashboardWatchlistSnapshot,
  WatchlistEnrichment,
  WatchlistQuoteInput,
} from "@/lib/market-data/watchlist-types";
import {
  loadCoverageQuotes,
  resetCoverageQuoteCache,
  type YahooQuoteHit,
} from "@/lib/watchlists/quotes";

const inflight = new Map<string, Promise<DashboardWatchlistSnapshot>>();

export type WatchlistListSource = {
  id: string;
  name: string;
  isDefault: boolean;
  symbols: string[];
  visibility?: "shared" | "personal";
};

export type WatchlistDeps = {
  now?: Date;
  useFixtures?: boolean;
  lists?: WatchlistListSource[];
  session?: string | null;
  yahooQuotes?: (symbols: string[]) => Promise<Map<string, YahooQuoteHit>>;
  yahooSpark?: (
    symbols: string[],
  ) => Promise<Map<string, Array<{ date: string; close: number }>>>;
  yahooWeekCloses?: (symbols: string[]) => Promise<Map<string, number | null>>;
};

export function resetWatchlistCache() {
  inflight.clear();
  resetCoverageQuoteCache();
}

function sourceLists(deps: WatchlistDeps = {}): WatchlistListSource[] {
  if (deps.lists !== undefined) return deps.lists;
  return fixtureWatchlists.map((list) => ({
    id: list.id,
    name: list.name,
    isDefault: list.isDefault,
    symbols: list.symbols,
    visibility: list.visibility ?? "shared",
  }));
}

function lists(deps: WatchlistDeps = {}): DashboardWatchlistList[] {
  return sourceLists(deps).map((list) => ({
    id: list.id,
    name: list.name,
    isDefault: list.isDefault,
    symbolCount: list.symbols.length,
    visibility: list.visibility ?? "shared",
  }));
}

function pickList(listId?: string | null, deps: WatchlistDeps = {}) {
  const all = sourceLists(deps);
  if (!all.length) return null;
  if (listId) return all.find((list) => list.id === listId) ?? null;
  return all.find((list) => list.isDefault) ?? all[0] ?? null;
}

function emptySnapshot(
  listId: string | undefined,
  error: string | null,
  extra?: Partial<DashboardWatchlistSnapshot>,
  deps: WatchlistDeps = {},
): DashboardWatchlistSnapshot {
  const list = pickList(listId, deps);
  return {
    listId: list?.id ?? listId ?? "",
    listName: list?.name ?? "",
    symbols: list?.symbols ?? [],
    rows: assembleWatchlistRows(list?.symbols ?? [], new Map()),
    lists: lists(deps),
    asOf: new Date().toISOString(),
    stale: false,
    usingFixtures: false,
    error,
    quotedCount: 0,
    requestedCount: list?.symbols.length ?? 0,
    diagnostics: [],
    ...extra,
  };
}

const FIXTURE_QUOTES: WatchlistQuoteInput[] = [
  { ticker: "SPY", last: 562.4, open: 560.8, changePercent: 0.41, volume: 48_200_000 },
  { ticker: "QQQ", last: 492.15, open: 489.4, changePercent: 0.66, volume: 32_100_000 },
  { ticker: "IWM", last: 221.3, open: 219.9, changePercent: 0.68, volume: 28_400_000 },
  { ticker: "TLT", last: 93.4, open: 94.05, changePercent: -0.74, volume: 22_000_000 },
  { ticker: "GLD", last: 238.5, open: 237.2, changePercent: 0.68, volume: 7_800_000 },
  { ticker: "USO", last: 76.2, open: 75.6, changePercent: 1.06, volume: 4_500_000 },
  { ticker: "NVDA", last: 131.4, open: 128.9, changePercent: 1.94, volume: 210_000_000 },
  { ticker: "MSFT", last: 428.1, open: 426.4, changePercent: 0.52, volume: 18_400_000 },
  { ticker: "AAPL", last: 227.3, open: 225.8, changePercent: 0.81, volume: 41_200_000 },
  { ticker: "AMD", last: 162.7, open: 158.2, changePercent: 2.84, volume: 55_000_000 },
  { ticker: "AVGO", last: 301.2, open: 298.5, changePercent: 1.12, volume: 12_800_000 },
  { ticker: "TSM", last: 178.4, open: 176.1, changePercent: 0.94, volume: 9_600_000 },
  { ticker: "PLTR", last: 41.8, open: 40.9, changePercent: 2.21, volume: 38_000_000 },
  { ticker: "CEG", last: 278.3, open: 272.4, changePercent: 2.87, volume: 148_000 },
  { ticker: "EQIX", last: 812.0, open: 808.5, changePercent: 0.44, volume: 420_000 },
  { ticker: "IREN", last: 18.4, open: 19.7, changePercent: -6.4, volume: 42_000_000 },
];

const FIXTURE_ENRICHMENT: Array<[string, WatchlistEnrichment]> = [
  ["SPY", { name: "SPDR S&P 500", marketCap: 580_000_000_000, avgVolume: 52_000_000, weekAgoClose: 554.2 }],
  ["QQQ", { name: "Invesco QQQ", marketCap: 310_000_000_000, avgVolume: 36_000_000, weekAgoClose: 484.1 }],
  ["IWM", { name: "iShares Russell 2000", marketCap: 68_000_000_000, avgVolume: 30_000_000, weekAgoClose: 217.4 }],
  ["TLT", { name: "iShares 20+ Year Treasury", marketCap: 52_000_000_000, avgVolume: 24_000_000, weekAgoClose: 94.8 }],
  ["GLD", { name: "SPDR Gold Shares", marketCap: 72_000_000_000, avgVolume: 8_200_000, weekAgoClose: 234.6 }],
  ["USO", { name: "United States Oil Fund", marketCap: 1_200_000_000, avgVolume: 4_800_000, weekAgoClose: 74.9 }],
  ["NVDA", { name: "NVIDIA", marketCap: 3_200_000_000_000, avgVolume: 180_000_000, weekAgoClose: 126.8 }],
  ["MSFT", { name: "Microsoft", marketCap: 3_180_000_000_000, avgVolume: 21_000_000, weekAgoClose: 422.5 }],
  ["AAPL", { name: "Apple", marketCap: 3_410_000_000_000, avgVolume: 48_000_000, weekAgoClose: 223.1 }],
  ["AMD", { name: "Advanced Micro Devices", marketCap: 263_000_000_000, avgVolume: 48_000_000, weekAgoClose: 156.4 }],
  ["AVGO", { name: "Broadcom", marketCap: 1_410_000_000_000, avgVolume: 14_000_000, weekAgoClose: 294.2 }],
  ["TSM", { name: "TSMC", marketCap: 926_000_000_000, avgVolume: 10_500_000, weekAgoClose: 174.8 }],
  ["PLTR", { name: "Palantir", marketCap: 96_000_000_000, avgVolume: 42_000_000, weekAgoClose: 39.6 }],
  ["CEG", { name: "Constellation Energy", marketCap: 87_000_000_000, avgVolume: 1_900_000, weekAgoClose: 268.1 }],
  ["EQIX", { name: "Equinix", marketCap: 77_000_000_000, avgVolume: 480_000, weekAgoClose: 805.2 }],
  ["IREN", { name: "IREN Limited", marketCap: 4_200_000_000, avgVolume: 14_000_000, weekAgoClose: 17.1 }],
];

export function fixtureIntelligenceQuotes(session: string | null = "regular") {
  const quotes = new Map(FIXTURE_QUOTES.map((row) => [row.ticker, row]));
  const enrichment = new Map(FIXTURE_ENRICHMENT);
  return assembleWatchlistRows([...quotes.keys()], quotes, enrichment).map((row) => ({
    ticker: row.ticker,
    name: row.name,
    changePercent: row.change1dPercent,
    relativeVolume: row.relativeVolume,
    preMarketChangePercent: row.preMarketChangePercent,
    afterHoursChangePercent: row.afterHoursChangePercent,
    flags: [] as string[],
    session,
  }));
}

export function fixtureWatchlistSnapshot(listId?: string | null, deps: WatchlistDeps = {}): DashboardWatchlistSnapshot {
  const list = pickList(listId, deps);
  if (!list) {
    return emptySnapshot(listId ?? undefined, "No watchlists are configured.", {
      usingFixtures: true,
      error: null,
    }, deps);
  }
  const quotes = new Map(FIXTURE_QUOTES.map((row) => [row.ticker, row]));
  const enrichment = new Map(FIXTURE_ENRICHMENT);
  const rows = assembleWatchlistRows(list.symbols, quotes, enrichment);
  return {
    listId: list.id,
    listName: list.name,
    symbols: list.symbols,
    rows,
    lists: lists(deps),
    asOf: new Date().toISOString(),
    stale: false,
    usingFixtures: true,
    error: null,
    quotedCount: watchlistQuotedCount(rows),
    requestedCount: list.symbols.length,
    diagnostics: buildWatchlistDiagnostics(rows),
  };
}

function sparkFromWeekCloses(
  weekCloses: Map<string, number | null>,
): Map<string, Array<{ date: string; close: number }>> {
  const out = new Map<string, Array<{ date: string; close: number }>>();
  for (const [symbol, close] of weekCloses) {
    if (close == null || !Number.isFinite(close)) {
      out.set(symbol, []);
      continue;
    }
    out.set(symbol, [
      { date: "2026-01-02", close },
      { date: "2026-01-05", close },
      { date: "2026-01-06", close },
      { date: "2026-01-07", close },
      { date: "2026-01-08", close },
      { date: "2026-01-09", close },
    ]);
  }
  return out;
}

export async function getWatchlistSnapshot(
  env: Env,
  quotes: NormalizedQuote[],
  listId?: string | null,
  deps: WatchlistDeps = {},
): Promise<DashboardWatchlistSnapshot> {
  const useFixtures =
    env.NODE_ENV !== "production" && (deps.useFixtures ?? isDemoAuthEnabled(env));
  if (useFixtures) return fixtureWatchlistSnapshot(listId, deps);

  const list = pickList(listId, { ...deps, lists: deps.lists ?? [] });
  if (!list) {
    return emptySnapshot(
      listId ?? undefined,
      listId
        ? "That watchlist or sector was not found."
        : "No watchlists are configured. Open Watchlists & Sectors to add coverage.",
      undefined,
      { ...deps, lists: deps.lists ?? [] },
    );
  }
  const key = `${list.id}:${quotes.length}`;
  const pending = inflight.get(key);
  if (pending) return pending;

  const load = (async (): Promise<DashboardWatchlistSnapshot> => {
    const quoted = await loadCoverageQuotes(list.symbols, {
      now: deps.now,
      tape: quotes,
      session: deps.session,
      yahooQuotes: deps.yahooQuotes,
      yahooSpark:
        deps.yahooSpark ??
        (deps.yahooWeekCloses
          ? async (symbols) => sparkFromWeekCloses(await deps.yahooWeekCloses!(symbols))
          : undefined),
    });
    const rows = quoted.rows.map((row) => ({
      ticker: row.ticker,
      name: row.name,
      last: row.last,
      change1dPercent: row.change1dPercent,
      changeFromOpenPercent: row.changeFromOpenPercent,
      change1wPercent: row.change1wPercent,
      change1mPercent: row.change1mPercent,
      changeYtdPercent: row.changeYtdPercent,
      preMarketChangePercent: row.preMarketChangePercent,
      afterHoursChangePercent: row.afterHoursChangePercent,
      relativeVolume: row.relativeVolume,
      marketCap: row.marketCap,
      volume: row.volume,
      avgVolume: row.avgVolume,
      dayHigh: row.dayHigh,
      dayLow: row.dayLow,
      priorClose: row.priorClose,
      volatility: row.volatility,
      missing: row.missing,
      quoteSource: row.quoteSource,
      quoteError: row.quoteError ?? null,
    }));
    return {
      listId: list.id,
      listName: list.name,
      symbols: list.symbols,
      rows,
      lists: lists({ ...deps, lists: deps.lists ?? [] }),
      asOf: quoted.asOf,
      stale: quoted.stale,
      usingFixtures: false,
      error: quoted.error,
      quotedCount: quoted.quotedCount,
      requestedCount: quoted.requestedCount,
      diagnostics: quoted.diagnostics,
    };
  })().finally(() => {
    inflight.delete(key);
  });

  inflight.set(key, load);
  return load;
}

export function emptyWatchlistSnapshot(
  error: string | null = null,
): DashboardWatchlistSnapshot {
  return emptySnapshot(undefined, error, undefined, { lists: [] });
}
