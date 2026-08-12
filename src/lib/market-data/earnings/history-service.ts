import { isDemoAuthEnabled } from "@/lib/auth/demo";
import {
  logEarningsDiagnostics,
  sanitizeEarningsError,
} from "@/lib/market-data/earnings/diagnostics";
import { ALPHA_VANTAGE_QUERY_URL } from "@/lib/market-data/earnings/alpha-vantage";
import {
  parseAlphaVantageEarningsHistory,
  parseFinnhubStockEarnings,
  parseFinnhubSymbolCalendar,
} from "@/lib/market-data/earnings/history-parse";
import { mergeHistoricalObservations } from "@/lib/market-data/earnings/history-merge";
import { attachPriceReactions } from "@/lib/market-data/earnings/history-reactions";
import {
  EARNINGS_HISTORY_BARS_TTL_MS,
  EARNINGS_HISTORY_TTL_MS,
  HISTORICAL_QUARTER_COUNT,
  type DailyClose,
  type EarningsHistorySnapshot,
  type EarningsHistorySourceHealth,
  type HistoricalSourceObservation,
} from "@/lib/market-data/earnings/history-types";
import type { EarningsCalendarProvider } from "@/lib/market-data/earnings/types";
import { toAlphaVantageSymbol, toCanonicalSymbol, toFinnhubSymbol } from "@/lib/market-data/earnings/symbols";
import { addCalendarDays } from "@/lib/market-data/earnings/window";
import { fetchYahooDailyCloses } from "@/lib/market-data/earnings/yahoo";
import type { Env } from "@/lib/env";
import { fetchWithSizeLimit } from "@/lib/providers/rss/ssrf";
import { chicagoDateString } from "@/lib/scheduling/chicago-schedule";

type CacheEntry<T> = {
  expiresAt: number;
  value: T;
};

const fundamentalsCache = new Map<string, CacheEntry<EarningsHistorySnapshot>>();
const barsCache = new Map<string, CacheEntry<DailyClose[]>>();
const inflight = new Map<string, Promise<EarningsHistorySnapshot>>();
const STALE_RETRY_TTL_MS = 15 * 60 * 1000;

export type HistoryDeps = {
  now?: Date;
  useFixtures?: boolean;
  finnhubFetch?: typeof fetch;
  alphaVantageFetch?: typeof fetch;
  yahooCloses?: (symbol: string) => Promise<DailyClose[]>;
  companyName?: string | null;
};

export function resetEarningsHistoryCache() {
  fundamentalsCache.clear();
  barsCache.clear();
  inflight.clear();
}

function emptyHealth(
  configured: boolean,
  error: string | null,
): EarningsHistorySourceHealth {
  return {
    configured,
    ok: false,
    stale: false,
    fetchedAt: null,
    rowCount: 0,
    error,
  };
}

async function fetchFinnhubHistory(
  env: Env,
  canonical: string,
  fetchImpl: typeof fetch,
): Promise<{ rows: HistoricalSourceObservation[]; health: EarningsHistorySourceHealth }> {
  if (!env.FINNHUB_API_KEY) {
    return { rows: [], health: emptyHealth(false, "FINNHUB_API_KEY is not set") };
  }
  const today = chicagoDateString(new Date());
  const from = addCalendarDays(today, -365 * 3);
  const symbol = toFinnhubSymbol(canonical);
  try {
    const earningsUrl = new URL("https://finnhub.io/api/v1/stock/earnings");
    earningsUrl.searchParams.set("symbol", symbol);
    earningsUrl.searchParams.set("token", env.FINNHUB_API_KEY);
    const calendarUrl = new URL("https://finnhub.io/api/v1/calendar/earnings");
    calendarUrl.searchParams.set("symbol", symbol);
    calendarUrl.searchParams.set("from", from);
    calendarUrl.searchParams.set("to", today);
    calendarUrl.searchParams.set("token", env.FINNHUB_API_KEY);
    const [earningsRes, calendarRes] = await Promise.all([
      fetchImpl(earningsUrl.toString(), {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(15_000),
      }),
      fetchImpl(calendarUrl.toString(), {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(15_000),
      }),
    ]);
    const rows: HistoricalSourceObservation[] = [];
    if (earningsRes.ok) rows.push(...parseFinnhubStockEarnings(await earningsRes.json()));
    if (calendarRes.ok) rows.push(...parseFinnhubSymbolCalendar(await calendarRes.json()));
    if (!earningsRes.ok && !calendarRes.ok) {
      throw new Error(`Finnhub history failed: HTTP ${earningsRes.status}`);
    }
    return {
      rows,
      health: {
        configured: true,
        ok: true,
        stale: false,
        fetchedAt: new Date().toISOString(),
        rowCount: rows.length,
        error:
          earningsRes.ok && calendarRes.ok
            ? null
            : `Partial Finnhub history (earnings HTTP ${earningsRes.status}, calendar HTTP ${calendarRes.status}).`,
      },
    };
  } catch (error) {
    return {
      rows: [],
      health: {
        configured: true,
        ok: false,
        stale: false,
        fetchedAt: null,
        rowCount: 0,
        error: sanitizeEarningsError(
          error instanceof Error ? error.message : "Finnhub history failed.",
        ),
      },
    };
  }
}

async function fetchAlphaVantageHistory(
  env: Env,
  canonical: string,
  fetchImpl?: typeof fetch,
): Promise<{ rows: HistoricalSourceObservation[]; health: EarningsHistorySourceHealth }> {
  if (!env.ALPHA_VANTAGE_API_KEY) {
    return { rows: [], health: emptyHealth(false, "ALPHA_VANTAGE_API_KEY is not set") };
  }
  try {
    const url = new URL(ALPHA_VANTAGE_QUERY_URL);
    url.searchParams.set("function", "EARNINGS");
    url.searchParams.set("symbol", toAlphaVantageSymbol(canonical));
    url.searchParams.set("apikey", env.ALPHA_VANTAGE_API_KEY);
    const response = await fetchWithSizeLimit(url.toString(), {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(20_000),
      maxBytes: 1_500_000,
      fetchImpl,
    });
    if (!response.ok) {
      throw new Error(`Alpha Vantage EARNINGS failed: HTTP ${response.status}`);
    }
    const rows = parseAlphaVantageEarningsHistory(await response.json());
    return {
      rows,
      health: {
        configured: true,
        ok: true,
        stale: false,
        fetchedAt: new Date().toISOString(),
        rowCount: rows.length,
        error: null,
      },
    };
  } catch (error) {
    return {
      rows: [],
      health: {
        configured: true,
        ok: false,
        stale: false,
        fetchedAt: null,
        rowCount: 0,
        error: sanitizeEarningsError(
          error instanceof Error ? error.message : "Alpha Vantage history failed.",
        ),
      },
    };
  }
}

async function loadYahooBars(
  canonical: string,
  deps: HistoryDeps,
): Promise<{ closes: DailyClose[]; health: EarningsHistorySourceHealth }> {
  const hit = barsCache.get(canonical);
  if (hit && hit.expiresAt > Date.now()) {
    return {
      closes: hit.value,
      health: {
        configured: true,
        ok: hit.value.length > 0,
        stale: false,
        fetchedAt: new Date().toISOString(),
        rowCount: hit.value.length,
        error: hit.value.length ? null : "Yahoo daily bars returned no closes.",
      },
    };
  }
  try {
    const closes = await (deps.yahooCloses ?? fetchYahooDailyCloses)(canonical);
    barsCache.set(canonical, {
      expiresAt: Date.now() + EARNINGS_HISTORY_BARS_TTL_MS,
      value: closes,
    });
    return {
      closes,
      health: {
        configured: true,
        ok: closes.length > 0,
        stale: false,
        fetchedAt: new Date().toISOString(),
        rowCount: closes.length,
        error: closes.length ? null : "Yahoo daily bars returned no closes.",
      },
    };
  } catch (error) {
    const message = sanitizeEarningsError(
      error instanceof Error ? error.message : "Yahoo daily bars failed.",
    );
    if (hit) {
      return {
        closes: hit.value,
        health: {
          configured: true,
          ok: false,
          stale: true,
          fetchedAt: null,
          rowCount: hit.value.length,
          error: message,
        },
      };
    }
    return {
      closes: [],
      health: {
        configured: true,
        ok: false,
        stale: false,
        fetchedAt: null,
        rowCount: 0,
        error: message,
      },
    };
  }
}

async function withYahooReactions(
  snapshot: EarningsHistorySnapshot,
  canonical: string,
  deps: HistoryDeps,
): Promise<EarningsHistorySnapshot> {
  const yahoo = await loadYahooBars(canonical, deps);
  return {
    ...snapshot,
    stale: snapshot.stale || yahoo.health.stale,
    quarters: attachPriceReactions(snapshot.quarters, yahoo.closes),
    sources: { ...snapshot.sources, yahoo: yahoo.health },
  };
}

function fixtureHistory(ticker: string, companyName: string | null): EarningsHistorySnapshot {
  const quarters = [
    ["Q1 2025", "2025-02-26", 0.89, 0.96, 54_200_000_000, 57_000_000_000, 8.2, 6.1],
    ["Q2 2025", "2025-05-28", 0.74, 0.81, 43_300_000_000, 44_100_000_000, -2.4, 1.2],
    ["Q3 2025", "2025-08-27", 0.68, 0.67, 32_800_000_000, 35_100_000_000, 4.1, -3.3],
    ["Q4 2025", "2025-11-19", 0.84, 0.93, 39_900_000_000, 39_300_000_000, -1.8, 0.4],
    ["Q1 2026", "2026-02-25", 0.84, 0.89, 39_100_000_000, 39_900_000_000, 5.6, 9.8],
    ["Q2 2026", "2026-05-28", 0.74, 0.76, 43_200_000_000, 44_100_000_000, -0.7, 2.1],
    ["Q3 2026", "2026-08-27", 1.01, 1.08, 45_100_000_000, 46_700_000_000, 7.4, 4.2],
    ["Q4 2026", "2026-11-18", 1.12, null, 48_000_000_000, null, null, null],
  ] as const;
  return {
    ticker,
    companyName,
    asOf: new Date().toISOString(),
    stale: false,
    usingFixtures: true,
    quarters: quarters.map((row, index, all) => {
      const prev = all[index - 1];
      const epsEst = row[2];
      const epsAct = row[3];
      const revEst = row[4];
      const revAct = row[5];
      return {
        id: `hist-${row[0].replaceAll(" ", "")}`,
        fiscalPeriod: row[0],
        reportDate: row[1],
        session: "amc" as const,
        epsEstimate: epsEst,
        epsActual: epsAct,
        epsSurprise: epsAct != null ? Math.round((epsAct - epsEst) * 100) / 100 : null,
        epsSurprisePercent:
          epsAct != null ? Math.round(((epsAct - epsEst) / Math.abs(epsEst)) * 1000) / 10 : null,
        revenueEstimate: revEst,
        revenueActual: revAct,
        revenueSurprise: revAct != null ? revAct - revEst : null,
        revenueSurprisePercent:
          revAct != null ? Math.round(((revAct - revEst) / Math.abs(revEst)) * 1000) / 10 : null,
        revenueGrowthPercent:
          revAct != null && prev && prev[5] != null
            ? Math.round(((revAct - prev[5]) / Math.abs(prev[5])) * 1000) / 10
            : null,
        reactionNextPercent: row[6],
        reactionFiveDayPercent: row[7],
        sources: ["finnhub", "alphaVantage"] as EarningsCalendarProvider[],
        missing: epsAct == null ? ["epsActual", "revenueActual", "reactionNext", "reactionFiveDay"] : [],
      };
    }).reverse(),
    sources: {
      finnhub: { configured: true, ok: true, stale: false, fetchedAt: new Date().toISOString(), rowCount: 8, error: null },
      alphaVantage: { configured: true, ok: true, stale: false, fetchedAt: new Date().toISOString(), rowCount: 8, error: null },
      yahoo: { configured: true, ok: true, stale: false, fetchedAt: new Date().toISOString(), rowCount: 8, error: null },
    },
    error: null,
  };
}

async function loadLive(
  env: Env,
  canonical: string,
  deps: HistoryDeps,
): Promise<EarningsHistorySnapshot> {
  const fetchImpl = deps.finnhubFetch ?? fetch;
  const [finnhub, alpha] = await Promise.all([
    fetchFinnhubHistory(env, canonical, fetchImpl),
    fetchAlphaVantageHistory(env, canonical, deps.alphaVantageFetch),
  ]);
  let merged = mergeHistoricalObservations(
    [...finnhub.rows, ...alpha.rows],
    HISTORICAL_QUARTER_COUNT * 2,
  );
  const yahoo = await loadYahooBars(canonical, deps);
  merged = attachPriceReactions(merged, yahoo.closes);

  const reported = merged.filter((row) => row.epsActual != null || row.revenueActual != null);
  const quarters = (reported.length ? reported : merged).slice(0, HISTORICAL_QUARTER_COUNT);

  const snapshot: EarningsHistorySnapshot = {
    ticker: canonical,
    companyName: deps.companyName ?? null,
    asOf: new Date().toISOString(),
    stale: yahoo.health.stale,
    usingFixtures: false,
    quarters,
    sources: {
      finnhub: finnhub.health,
      alphaVantage: alpha.health,
      yahoo: yahoo.health,
    },
    error:
      quarters.length === 0
        ? [finnhub.health.error, alpha.health.error].filter(Boolean).join(" ") ||
          "No historical earnings rows were returned."
        : null,
  };
  logEarningsDiagnostics({
    scope: "earnings-history",
    ticker: canonical,
    quarters: quarters.length,
    finnhub: finnhub.health.rowCount,
    alphaVantage: alpha.health.rowCount,
    yahoo: yahoo.health.rowCount,
  });
  return snapshot;
}

export async function getEarningsHistorySnapshot(
  env: Env,
  rawSymbol: string,
  deps: HistoryDeps = {},
): Promise<EarningsHistorySnapshot> {
  const canonical = toCanonicalSymbol(rawSymbol);
  if (!canonical) {
    return {
      ticker: rawSymbol.trim().toUpperCase(),
      companyName: deps.companyName ?? null,
      asOf: new Date().toISOString(),
      stale: false,
      usingFixtures: false,
      quarters: [],
      sources: {
        finnhub: emptyHealth(Boolean(env.FINNHUB_API_KEY), null),
        alphaVantage: emptyHealth(Boolean(env.ALPHA_VANTAGE_API_KEY), null),
        yahoo: emptyHealth(true, null),
      },
      error: "Invalid ticker.",
    };
  }

  const useFixtures =
    env.NODE_ENV !== "production" && (deps.useFixtures ?? isDemoAuthEnabled(env));
  if (useFixtures) return fixtureHistory(canonical, deps.companyName ?? null);

  const nowMs = deps.now?.getTime() ?? Date.now();
  const cached = fundamentalsCache.get(canonical);
  if (cached && cached.expiresAt > nowMs) {
    return withYahooReactions(cached.value, canonical, deps);
  }
  const pending = inflight.get(canonical);
  if (pending) return pending;

  const load = loadLive(env, canonical, deps)
    .then((payload) => {
      const previous = cached?.value;
      if (payload.quarters.length === 0 && previous && previous.quarters.length > 0) {
        const stale: EarningsHistorySnapshot = {
          ...previous,
          stale: true,
          error: payload.error
            ? `${payload.error} Keeping last successful snapshot.`
            : "History refresh returned no rows; keeping last successful snapshot.",
          sources: {
            finnhub: { ...payload.sources.finnhub, stale: true },
            alphaVantage: { ...payload.sources.alphaVantage, stale: true },
            yahoo: { ...previous.sources.yahoo, stale: true },
          },
        };
        fundamentalsCache.set(canonical, {
          expiresAt: nowMs + STALE_RETRY_TTL_MS,
          value: stale,
        });
        return stale;
      }
      fundamentalsCache.set(canonical, {
        expiresAt: nowMs + EARNINGS_HISTORY_TTL_MS,
        value: payload,
      });
      return payload;
    })
    .catch((error): EarningsHistorySnapshot => {
      const message = sanitizeEarningsError(
        error instanceof Error ? error.message : "History refresh failed.",
      );
      if (cached?.value.quarters.length) {
        const stale: EarningsHistorySnapshot = {
          ...cached.value,
          stale: true,
          error: message,
        };
        fundamentalsCache.set(canonical, {
          expiresAt: nowMs + STALE_RETRY_TTL_MS,
          value: stale,
        });
        return stale;
      }
      return {
        ticker: canonical,
        companyName: deps.companyName ?? null,
        asOf: new Date().toISOString(),
        stale: false,
        usingFixtures: false,
        quarters: [],
        sources: {
          finnhub: emptyHealth(Boolean(env.FINNHUB_API_KEY), message),
          alphaVantage: emptyHealth(Boolean(env.ALPHA_VANTAGE_API_KEY), null),
          yahoo: emptyHealth(true, null),
        },
        error: message,
      };
    })
    .finally(() => {
      inflight.delete(canonical);
    });

  inflight.set(canonical, load);
  return load;
}
