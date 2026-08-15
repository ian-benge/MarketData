import { fixturesEnabled } from "@/lib/api/http";
import type { SessionUser } from "@/lib/auth/session";
import { getDashboardResearch } from "@/lib/dashboard/research-context";
import { getEnv } from "@/lib/env";
import {
  fixtureDashboard,
  type DashboardSnapshot,
} from "@/lib/fixtures/dashboard";
import {
  fixtureSectorRecords,
  fixtureWatchlistRecords,
} from "@/lib/fixtures/watchlists";
import { getMarketDataCache } from "@/lib/market-data/cache";
import { licenseConfigFromEnv } from "@/lib/market-data/licensing";
import {
  inferUsEquitySession,
  runMarketDataRefresh,
} from "@/lib/market-data/refresh-service";
import {
  emptyWatchlistSnapshot,
  fixtureWatchlistSnapshot,
  getWatchlistSnapshot,
  type WatchlistListSource,
} from "@/lib/market-data/watchlist-service";
import { createProviders } from "@/lib/providers/registry";
import { loadOpenPositionTickers } from "@/lib/positions/store";
import {
  isLiveReportsAvailable,
  listLiveReports,
} from "@/lib/reports/live-reports";
import {
  buildDashboardCoverageDigest,
  emptyDashboardCoverageDigest,
  visibleOverviewLists,
} from "@/lib/watchlists/dashboard-digest";
import {
  listStoredSectors,
  listStoredWatchlists,
} from "@/lib/watchlists/store";
import type { CoverageWatchlist } from "@/lib/watchlists/types";
import type {
  DashboardWatchlistSnapshot,
} from "@/lib/market-data/watchlist-types";
import { coverageFromCollections, getIntelligenceBundle } from "@/lib/intelligence/service";
import type { IntelligenceBundle, QuoteContext } from "@/lib/intelligence/types";

function quotesFromWatchlist(
  rows: DashboardWatchlistSnapshot["rows"],
  session?: string | null,
): QuoteContext[] {
  return rows.map((row) => ({
    ticker: row.ticker,
    name: row.name,
    changePercent: row.change1dPercent,
    relativeVolume: row.relativeVolume,
    preMarketChangePercent: row.preMarketChangePercent,
    afterHoursChangePercent: row.afterHoursChangePercent,
    flags: [],
    session: session ?? null,
  }));
}

function compactIntelligence(
  bundle: IntelligenceBundle | null | undefined,
): DashboardSnapshot["intelligence"] {
  if (!bundle) return null;
  return {
    events: bundle.events.slice(0, 24),
    moves: bundle.moves.slice(0, 40),
    gaps: bundle.gaps,
    sources: bundle.sources,
    fetchedAt: bundle.fetchedAt,
    stale: bundle.stale,
  };
}

async function latestLiveReport(): Promise<DashboardSnapshot["latestReport"]> {
  try {
    if (!isLiveReportsAvailable()) return null;
    const reports = await listLiveReports();
    const first = reports[0];
    if (!first) return null;
    return {
      id: first.id,
      edition: first.edition,
      tradingDate: first.tradingDate,
      status: first.status,
      headlineSummary: first.headlineSummary,
      completedAt: first.completedAt ?? first.tradingDate,
    };
  } catch {
    return null;
  }
}

function toWatchlistSources(lists: CoverageWatchlist[]): WatchlistListSource[] {
  return lists.map((list) => ({
    id: list.id,
    name: list.name,
    isDefault: list.isDefault,
    symbols: list.symbols,
    visibility: list.visibility,
  }));
}

function unavailableDashboard(
  licenseWarning: string | null,
  extra?: Partial<DashboardSnapshot>,
): DashboardSnapshot {
  const now = new Date().toISOString();
  return {
    asOf: now,
    dataCutoff: now,
    stale: true,
    tape: [],
    movers: [],
    watchlist: emptyWatchlistSnapshot(
      extra?.watchlist?.error ??
        "No market-data cache is available. Run a refresh or wait for the next scheduled refresh.",
    ),
    headlines: [],
    calendar: [],
    providers: [],
    latestReport: null,
    latencyCoverageLabel: "Unavailable",
    feedCoverage: "unknown",
    latencyClass: "unavailable",
    marketSession: inferUsEquitySession(),
    licenseWarning,
    breadthSupported: false,
    breadthExplanation:
      "No market-data cache is available. Run a refresh or wait for the next scheduled refresh.",
    coverage: emptyDashboardCoverageDigest(),
    intelligence: extra?.intelligence ?? null,
    ...extra,
  };
}

function liveRefreshDueSeconds(session: string | null | undefined): number {
  if (session === "regular") return 15;
  if (session === "premarket" || session === "afterhours") return 30;
  return 60;
}

function providerList(env: ReturnType<typeof getEnv>): DashboardSnapshot["providers"] {
  try {
    return createProviders(env).registry.list().map((provider) => ({
      id: provider.id,
      name: provider.name,
      category: provider.category,
      health: provider.health,
      lastSuccessAt: provider.lastSuccessAt ?? null,
    }));
  } catch (error) {
    console.error("createProviders failed for dashboard health list", error);
    return [];
  }
}

async function fixtureCoverage(user: SessionUser, listId?: string | null) {
  const lists = fixtureWatchlistRecords(user.id);
  const sectors = fixtureSectorRecords();
  const sources = toWatchlistSources(visibleOverviewLists(lists, user.id));
  const watchlist = fixtureWatchlistSnapshot(listId, { lists: sources });
  const inBookTickers = await loadOpenPositionTickers().catch(() => [] as string[]);
  const coverage = buildDashboardCoverageDigest({
    user,
    tape: fixtureDashboard.tape,
    lists,
    sectors,
    selectedListId: watchlist.listId,
    inBookTickers,
  });
  return { watchlist, coverage };
}

export async function loadDashboardSnapshot(options: {
  user: SessionUser;
  listId?: string | null;
  live?: boolean;
}): Promise<DashboardSnapshot> {
  const env = getEnv();
  const license = licenseConfigFromEnv(env);
  const licenseWarning =
    license.scope === "single_user_development" || !license.acknowledged
      ? `License scope "${license.scope}" (acknowledged=${license.acknowledged}). Acknowledgement is an operational guardrail, not proof of a license.`
      : null;

  if (fixturesEnabled()) {
    const { watchlist, coverage } = await fixtureCoverage(
      options.user,
      options.listId,
    );
    const intelligence = await getIntelligenceBundle(env, {
      coverageTickers: coverage.coverageSymbolSet,
      quotes: quotesFromWatchlist(watchlist.rows, "regular"),
      session: "regular",
    });
    return {
      ...fixtureDashboard,
      watchlist,
      coverage,
      intelligence: compactIntelligence(intelligence),
      latencyCoverageLabel: "Mock data",
      feedCoverage: "unknown",
      latencyClass: "mock",
      marketSession: "regular",
      licenseWarning:
        license.scope === "single_user_development"
          ? "License scope is single_user_development — shared production surfaces are not authorized."
          : null,
      breadthSupported: true,
      breadthExplanation: null,
    };
  }

  const cache = getMarketDataCache(env);
  let cached = cache.getDashboardSnapshot();
  const lastRefreshAt = cache.getMeta().lastSuccessfulRefreshAt;
  const ageSec = lastRefreshAt
    ? (Date.now() - Date.parse(lastRefreshAt)) / 1000
    : Number.POSITIVE_INFINITY;
  const session = cached?.marketSession ?? inferUsEquitySession();
  const liveDue = Boolean(options.live) && ageSec >= liveRefreshDueSeconds(session);
  try {
    await runMarketDataRefresh({
      env,
      force: !cached || Boolean(cached.stale) || liveDue,
    });
    cached = cache.getDashboardSnapshot();
  } catch {
    cached = cache.getDashboardSnapshot();
  }

  const providers = providerList(env);
  const storedLists = await listStoredWatchlists(options.user).catch(() => ({
    lists: [] as CoverageWatchlist[],
    persistence: "unavailable" as const,
  }));
  const storedSectors = await listStoredSectors(options.user).catch(() => ({
    sectors: [] as Awaited<ReturnType<typeof listStoredSectors>>["sectors"],
    persistence: storedLists.persistence,
  }));
  const visible = visibleOverviewLists(storedLists.lists, options.user.id);
  const sources = toWatchlistSources(visible);
  const persistence = storedLists.persistence;
  const inBookTickers = await loadOpenPositionTickers().catch(() => [] as string[]);

  if (!cached) {
    const watchlist =
      persistence === "unavailable"
        ? emptyWatchlistSnapshot(
            "Coverage persistence is not connected in this environment.",
          )
        : await getWatchlistSnapshot(env, [], options.listId, {
            lists: sources,
            useFixtures: false,
          });
    const research = await getDashboardResearch(env).catch(() => ({
      headlines: [] as DashboardSnapshot["headlines"],
      calendar: [] as DashboardSnapshot["calendar"],
      fetchedAt: new Date().toISOString(),
      intelligence: null,
    }));
    return unavailableDashboard(licenseWarning, {
      headlines: research.headlines,
      calendar: research.calendar,
      intelligence: compactIntelligence(research.intelligence),
      providers,
      watchlist,
      coverage: buildDashboardCoverageDigest({
        user: options.user,
        tape: [],
        lists: storedLists.lists,
        sectors: storedSectors.sectors,
        selectedListId: options.listId ?? watchlist.listId,
        inBookTickers,
      }),
    });
  }

  const watchlist =
    persistence === "unavailable"
      ? emptyWatchlistSnapshot(
          "Coverage persistence is not connected in this environment.",
        )
      : await getWatchlistSnapshot(env, cached.tape, options.listId, {
          lists: sources,
          useFixtures: false,
        });
  const coverage = buildDashboardCoverageDigest({
    user: options.user,
    tape: cached.tape,
    lists: storedLists.lists,
    sectors: storedSectors.sectors,
    selectedListId: options.listId ?? watchlist.listId,
    inBookTickers,
  });
  const research = await getDashboardResearch(env, {
    coverageTickers: coverage.coverageSymbolSet,
    coverage: coverageFromCollections(storedLists.lists, storedSectors.sectors),
    quotes: quotesFromWatchlist(watchlist.rows, cached.marketSession),
    session: cached.marketSession,
  }).catch(() => ({
    headlines: [] as DashboardSnapshot["headlines"],
    calendar: [] as DashboardSnapshot["calendar"],
    fetchedAt: new Date().toISOString(),
    intelligence: null,
  }));
  const latestReport = await latestLiveReport();

  return {
    asOf: cached.asOf,
    dataCutoff: cached.dataCutoff,
    stale: cached.stale,
    tape: cached.tape,
    movers: cached.movers,
    watchlist,
    coverage,
    headlines: research.headlines,
    calendar: research.calendar,
    intelligence: compactIntelligence(research.intelligence),
    providers,
    latestReport,
    moversCoverageNotes:
      cache.getMeta()?.moversCoverageNotes ??
      cached.notes?.find((note) => /mover/i.test(note)) ??
      null,
    latencyCoverageLabel: cached.latencyCoverageLabel,
    feedCoverage: cached.feedCoverage,
    latencyClass: cached.latencyClass,
    marketSession: cached.marketSession,
    licenseWarning,
    breadthSupported: cached.breadth.supported,
    breadthExplanation: cached.breadth.explanation,
  };
}

export { toWatchlistSources };
