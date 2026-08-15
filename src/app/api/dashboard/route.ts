import { handleRouteError, jsonOk, fixturesEnabled } from "@/lib/api/http";
import { requirePermission } from "@/lib/auth/authorize";
import {
  fixtureDashboard,
  type DashboardSnapshot,
} from "@/lib/fixtures/dashboard";
import { getEnv } from "@/lib/env";
import { getMarketDataCache } from "@/lib/market-data/cache";
import { licenseConfigFromEnv } from "@/lib/market-data/licensing";
import {
  inferUsEquitySession,
  runMarketDataRefresh,
} from "@/lib/market-data/refresh-service";
import {
  emptyWatchlistSnapshot,
  getWatchlistSnapshot,
} from "@/lib/market-data/watchlist-service";
import { getDashboardResearch } from "@/lib/dashboard/research-context";
import { createProviders } from "@/lib/providers/registry";
import { listStoredWatchlists } from "@/lib/watchlists/store";
import {
  isLiveReportsAvailable,
  listLiveReports,
} from "@/lib/reports/live-reports";

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
    ...extra,
  };
}

function liveRefreshDueSeconds(session: string | null | undefined): number {
  if (session === "regular") return 15;
  if (session === "premarket" || session === "afterhours") return 30;
  return 60;
}

export async function GET(request?: Request) {
  try {
    const user = await requirePermission("viewDashboard");

    // Pure demo / fixtures path — no market primary required.
    if (fixturesEnabled()) {
      const env = getEnv();
      const license = licenseConfigFromEnv(env);
      const payload: DashboardSnapshot = {
        ...fixtureDashboard,
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
      return jsonOk(payload);
    }

    const env = getEnv();
    const cache = getMarketDataCache(env);
    let cached = cache.getDashboardSnapshot();
    const live =
      request !== undefined &&
      new URL(request.url).searchParams.get("live") === "1";
    const lastRefreshAt = cache.getMeta().lastSuccessfulRefreshAt;
    const ageSec = lastRefreshAt
      ? (Date.now() - Date.parse(lastRefreshAt)) / 1000
      : Number.POSITIVE_INFINITY;
    const session = cached?.marketSession ?? inferUsEquitySession();
    const liveDue = live && ageSec >= liveRefreshDueSeconds(session);
    try {
      await runMarketDataRefresh({
        env,
        force: !cached || Boolean(cached.stale) || liveDue,
      });
      cached = cache.getDashboardSnapshot();
    } catch {
      cached = cache.getDashboardSnapshot();
    }
    const license = licenseConfigFromEnv(env);
    const licenseWarning =
      license.scope === "single_user_development" || !license.acknowledged
        ? `License scope "${license.scope}" (acknowledged=${license.acknowledged}). Acknowledgement is an operational guardrail, not proof of a license.`
        : null;

    const research = await getDashboardResearch(env).catch(() => ({
      headlines: [] as DashboardSnapshot["headlines"],
      calendar: [] as DashboardSnapshot["calendar"],
      fetchedAt: new Date().toISOString(),
    }));

    if (cached) {
      let providers: DashboardSnapshot["providers"] = [];
      try {
        providers = createProviders(env).registry.list().map((p) => ({
          id: p.id,
          name: p.name,
          category: p.category,
          health: p.health,
          lastSuccessAt: p.lastSuccessAt ?? null,
        }));
      } catch (error) {
        console.error("createProviders failed for dashboard health list", error);
      }
      const stored = await listStoredWatchlists(user).catch(() => ({
        lists: [] as Awaited<ReturnType<typeof listStoredWatchlists>>["lists"],
      }));
      const lists = stored.lists
        .filter((list) => list.visibility === "shared" && !list.archivedAt)
        .map((list) => ({
          id: list.id,
          name: list.name,
          isDefault: list.isDefault,
          symbols: list.symbols,
        }));
      const watchlist = await getWatchlistSnapshot(env, cached.tape, undefined, {
        lists: lists.length ? lists : undefined,
      });
      const latestReport = await latestLiveReport();
      const payload: DashboardSnapshot = {
        asOf: cached.asOf,
        dataCutoff: cached.dataCutoff,
        stale: cached.stale,
        tape: cached.tape,
        movers: cached.movers,
        watchlist,
        headlines: research.headlines,
        calendar: research.calendar,
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
      return jsonOk(payload);
    }

    // No cache yet: return an unavailable payload without substituting fixtures.
    let providers: DashboardSnapshot["providers"] = [];
    try {
      providers = createProviders(env).registry.list().map((p) => ({
        id: p.id,
        name: p.name,
        category: p.category,
        health: p.health,
        lastSuccessAt: p.lastSuccessAt ?? null,
      }));
    } catch (error) {
      console.error("createProviders failed for dashboard health list", error);
    }
    return jsonOk(
      unavailableDashboard(licenseWarning, {
        headlines: research.headlines,
        calendar: research.calendar,
        providers,
      }),
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
