import type { Env } from "@/lib/env";
import { isDemoAuthEnabled } from "@/lib/auth/demo";
import {
  calculateMeetings,
  targetFromBounds,
  targetFromEffr,
} from "@/lib/market-data/fedwatch/calc";
import {
  formatMeetingLabel,
  lastBusinessDayOfMonth,
  meetingToContractCode,
  parseIsoDate,
  scheduleStatus,
  upcomingFomcMeetings,
} from "@/lib/market-data/fedwatch/fomc";
import {
  attachMeetingHistory,
  seriesToLatestQuotes,
  type ZqContractSeries,
} from "@/lib/market-data/fedwatch/compare";
import {
  attachSettlementStats,
  fetchCmeSettlements,
  fetchNyFedTarget,
  fetchOfficialFedWatch,
  fetchYahooZqLive,
  fetchYahooZqSeries,
  mergeFedFundsQuotes,
} from "@/lib/market-data/fedwatch/sources";
import {
  FEDWATCH_HISTORY_MS,
  FEDWATCH_REFRESH_MS,
  FEDWATCH_TARGET_MS,
  type FedFundsQuote,
  type FedWatchMeeting,
  type FedWatchSnapshot,
  type FedWatchSource,
  type TargetContext,
} from "@/lib/market-data/fedwatch/types";

const ATTRIBUTION: Record<FedWatchSource, string> = {
  cme_official:
    "Official CME FedWatch API. Licensed CME Group market data — not a substitute for the public FedWatch web tool.",
  zq_delayed:
    "Implied from delayed 30-Day Fed Funds futures (ZQ) using CME FedWatch methodology. Last prints are polled every 15 seconds. Not the licensed CME FedWatch stream.",
  cme_settlement:
    "Implied from CME 30-Day Fed Funds futures settlements using FedWatch methodology. End-of-day prices — not the licensed intraday stream.",
  unavailable:
    "No live Fed funds futures or CME FedWatch feed is available. Probabilities are not invented.",
};

const SOURCE_LABEL: Record<FedWatchSource, string> = {
  cme_official: "CME FedWatch API",
  zq_delayed: "ZQ · delayed 15s",
  cme_settlement: "CME ZQ settlements",
  unavailable: "Unavailable",
};

type CacheEntry<T> = {
  expiresAt: number;
  value: T;
};

type HistoryBundle = {
  series: ZqContractSeries[];
  settlements: FedFundsQuote[];
};

let snapshotCache: CacheEntry<FedWatchSnapshot> | null = null;
let targetCache: CacheEntry<TargetContext | null> | null = null;
let historyCache: CacheEntry<HistoryBundle> | null = null;
let inflight: Promise<FedWatchSnapshot> | null = null;

export function resetFedWatchCache() {
  snapshotCache = null;
  targetCache = null;
  historyCache = null;
  inflight = null;
}

async function readThrough<T>(
  current: CacheEntry<T> | null,
  ttlMs: number,
  load: () => Promise<T>,
): Promise<{ entry: CacheEntry<T>; hit: boolean }> {
  if (current && current.expiresAt > Date.now()) {
    return { entry: current, hit: true };
  }
  const value = await load();
  return { entry: { expiresAt: Date.now() + ttlMs, value }, hit: false };
}

function decorateMeetings(meetings: FedWatchMeeting[]): FedWatchMeeting[] {
  return meetings.map((meeting) => {
    const date = parseIsoDate(meeting.date);
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth() + 1;
    return {
      ...meeting,
      label: meeting.label.includes("-")
        ? formatMeetingLabel(meeting.date, 4)
        : meeting.label,
      tabLabel: meeting.tabLabel.includes("-")
        ? formatMeetingLabel(meeting.date, 2)
        : meeting.tabLabel,
      contract: meeting.contract || meetingToContractCode(meeting.date),
      expires:
        meeting.expires.includes("-") && meeting.expires.length === 10
          ? meeting.expires
          : lastBusinessDayOfMonth(year, month),
    };
  });
}

function snapshot(partial: Omit<FedWatchSnapshot, "refreshSeconds" | "attribution" | "sourceLabel">): FedWatchSnapshot {
  return {
    ...partial,
    sourceLabel: SOURCE_LABEL[partial.source],
    attribution: ATTRIBUTION[partial.source],
    refreshSeconds: FEDWATCH_REFRESH_MS / 1000,
  };
}

function latestQuoteTime(quotes: FedFundsQuote[]): string | null {
  let latest = 0;
  for (const quote of quotes) {
    if (!quote.tradedAt) continue;
    const ms = Date.parse(quote.tradedAt);
    if (Number.isFinite(ms) && ms > latest) latest = ms;
  }
  return latest ? new Date(latest).toISOString() : null;
}

async function loadTarget(): Promise<TargetContext | null> {
  const loaded = await readThrough(targetCache, FEDWATCH_TARGET_MS, async () => {
    try {
      return await fetchNyFedTarget();
    } catch {
      return null;
    }
  });
  targetCache = loaded.entry;
  return loaded.entry.value;
}

async function loadHistory(meetingIsos: string[]): Promise<HistoryBundle> {
  const loaded = await readThrough(historyCache, FEDWATCH_HISTORY_MS, async () => {
    const [series, settlements] = await Promise.all([
      fetchYahooZqSeries(meetingIsos).catch(() => []),
      fetchCmeSettlements().catch(() => []),
    ]);
    return { series, settlements };
  });
  historyCache = loaded.entry;
  return loaded.entry.value;
}

async function loadFedWatch(env: Env): Promise<FedWatchSnapshot> {
  const asOf = new Date().toISOString();
  const meetingsUpcoming = upcomingFomcMeetings();
  const schedule = scheduleStatus();
  const target = await loadTarget();

  const currentTarget = target
    ? targetFromBounds(target.lowerPct, target.upperPct)
    : null;
  const currentLowerBps = currentTarget?.lowerBps ?? 0;

  if (env.CME_FEDWATCH_ACCESS_TOKEN) {
    try {
      const official = await fetchOfficialFedWatch(env, currentLowerBps);
      if (official?.length) {
        return snapshot({
          asOf,
          quoteAsOf: asOf,
          source: "cme_official",
          delayed: false,
          stale: false,
          currentTarget,
          effr: target?.effr != null && target.effrAsOf
            ? { value: target.effr, asOf: target.effrAsOf }
            : null,
          meetings: decorateMeetings(official),
          error:
            schedule.state === "expired"
              ? "Built-in FOMC schedule has no remaining meetings."
              : null,
        });
      }
    } catch {
      /* fall through to public ZQ path */
    }
  }

  if (!target) {
    return snapshot({
      asOf,
      source: "unavailable",
      delayed: true,
      stale: false,
      currentTarget: null,
      effr: null,
      meetings: [],
      error:
        "Could not load the NY Fed target-rate range. Rate probabilities are withheld.",
    });
  }

  if (!meetingsUpcoming.length) {
    return snapshot({
      asOf,
      source: "unavailable",
      delayed: true,
      stale: false,
      currentTarget,
      effr: target.effr != null && target.effrAsOf
        ? { value: target.effr, asOf: target.effrAsOf }
        : null,
      meetings: [],
      error: "No upcoming FOMC meetings remain on the built-in calendar.",
    });
  }

  const [live, history] = await Promise.all([
    fetchYahooZqLive(meetingsUpcoming).catch(() => [] as FedFundsQuote[]),
    loadHistory(meetingsUpcoming),
  ]);
  const historyQuotes = seriesToLatestQuotes(history.series);
  let quotes = mergeFedFundsQuotes(historyQuotes, live);
  let source: FedWatchSource = "zq_delayed";
  if (!quotes.length && history.settlements.length) {
    quotes = history.settlements;
    source = "cme_settlement";
  } else if (quotes.length) {
    quotes = attachSettlementStats(quotes, history.settlements);
  }

  if (!quotes.length) {
    return snapshot({
      asOf,
      source: "unavailable",
      delayed: true,
      stale: false,
      currentTarget,
      effr: target.effr != null && target.effrAsOf
        ? { value: target.effr, asOf: target.effrAsOf }
        : null,
      meetings: [],
      error:
        "30-Day Fed Funds futures quotes were unavailable. Probabilities are not shown.",
    });
  }

  const meetings = calculateMeetings(meetingsUpcoming, quotes, {
    ...target,
    effr: target.effr,
    effrAsOf: target.effrAsOf,
    lowerPct: target.lowerPct,
    upperPct: target.upperPct,
  });

  if (!meetings.length) {
    return snapshot({
      asOf,
      source: "unavailable",
      delayed: true,
      stale: false,
      currentTarget,
      effr: target.effr != null && target.effrAsOf
        ? { value: target.effr, asOf: target.effrAsOf }
        : null,
      meetings: [],
      error:
        "Futures quotes did not cover the next FOMC contract months. Probabilities are not shown.",
    });
  }

  return snapshot({
    asOf,
    quoteAsOf: latestQuoteTime(live) ?? latestQuoteTime(quotes),
    source,
    delayed: true,
    stale: !live.length,
    currentTarget: currentTarget ?? targetFromEffr(target.effr ?? target.lowerPct),
    effr: target.effr != null && target.effrAsOf
      ? { value: target.effr, asOf: target.effrAsOf }
      : null,
    meetings: attachMeetingHistory(
      decorateMeetings(meetings),
      history.series,
      target,
    ),
    error:
      schedule.state === "expiring"
        ? `FOMC calendar has ${schedule.remaining} remaining hardcoded dates.`
        : null,
  });
}

export async function getFedWatchSnapshot(env: Env): Promise<FedWatchSnapshot> {
  if (isDemoAuthEnabled(env)) {
    return snapshot({
      asOf: new Date().toISOString(),
      source: "unavailable",
      delayed: true,
      stale: false,
      currentTarget: null,
      effr: null,
      meetings: [],
      error:
        "Demo mode does not call CME FedWatch or ZQ futures. Rate probabilities are not invented.",
    });
  }
  if (snapshotCache && snapshotCache.expiresAt > Date.now()) {
    return snapshotCache.value;
  }
  if (inflight) return inflight;

  inflight = loadFedWatch(env)
    .then((payload) => {
      snapshotCache = { expiresAt: Date.now() + FEDWATCH_REFRESH_MS, value: payload };
      return payload;
    })
    .catch((error) => {
      if (snapshotCache) {
        return {
          ...snapshotCache.value,
          stale: true,
          error:
            error instanceof Error
              ? error.message
              : "FedWatch refresh failed; showing last valid snapshot.",
        };
      }
      return snapshot({
        asOf: new Date().toISOString(),
        source: "unavailable",
        delayed: true,
        stale: false,
        currentTarget: null,
        effr: null,
        meetings: [],
        error:
          error instanceof Error
            ? error.message
            : "FedWatch refresh failed.",
      });
    })
    .finally(() => {
      inflight = null;
    });

  return inflight;
}
