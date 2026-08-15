/**
 * Adaptive market-data refresh: universe → router batch → cache → usage/health.
 * In-memory mutex (+ optional DB lease claim) prevents overlapping double-fetch.
 */

import type { Env } from "@/lib/env";
import { getEnv } from "@/lib/env";
import {
  getMarketDataCache,
  type MarketDataCache,
} from "@/lib/market-data/cache";
import {
  createMarketDataRouter,
  type MarketDataRouter,
  type ProviderHealthEvent,
} from "@/lib/market-data/router";
import {
  EntitlementError,
  type ExtendedMarketSession,
  type FeedCoverage,
  type NormalizedMoverObservation,
  type NormalizedQuoteObservation,
  type NormalizedSnapshotObservation,
} from "@/lib/market-data/schemas";
import {
  buildUniverse,
  type UniverseBuildResult,
} from "@/lib/market-data/universe";
import {
  getUsageStore,
  type UsageSnapshot,
  type UsageStore,
} from "@/lib/market-data/usage";
import { inferUsEquitySession } from "@/lib/market-data/us-session";
import { loadOpenPositionTickers } from "@/lib/positions/store";
import { loadFirmCoverageSymbols } from "@/lib/watchlists/firm-coverage";

export { inferUsEquitySession };

export function refreshCadenceSeconds(
  env: Pick<
    Env,
    | "MARKET_DATA_REFRESH_OPEN_SECONDS"
    | "MARKET_DATA_REFRESH_EXTENDED_SECONDS"
    | "MARKET_DATA_REFRESH_CLOSED_SECONDS"
  >,
  session: ExtendedMarketSession = inferUsEquitySession(),
): number {
  if (session === "regular") return env.MARKET_DATA_REFRESH_OPEN_SECONDS;
  if (session === "premarket" || session === "afterhours") {
    return env.MARKET_DATA_REFRESH_EXTENDED_SECONDS;
  }
  return env.MARKET_DATA_REFRESH_CLOSED_SECONDS;
}

export function breadthSupported(feed: FeedCoverage): boolean {
  return feed === "sip" || feed === "full_market";
}

export function iexMoversCoverageNote(feed: FeedCoverage): string | null {
  if (feed === "iex") {
    return "Movers restricted to the configured tracked universe (IEX feed — not SIP/full-market breadth).";
  }
  if (feed !== "sip" && feed !== "full_market") {
    return "Movers restricted to the configured tracked universe.";
  }
  return "Movers computed over the configured refresh universe.";
}

/* ---- Advisory lock / lease ---- */

export type LeaseClaimResult = {
  claimed: boolean;
  ownerId: string;
  reason?: string;
};

/** Optional durable lease (DB advisory lock). In-memory mutex always wraps it. */
export interface RefreshLeaseClaim {
  tryClaim(ownerId: string, ttlMs: number): Promise<LeaseClaimResult>;
  release(ownerId: string): Promise<void>;
}

export class InMemoryRefreshLock implements RefreshLeaseClaim {
  private ownerId: string | null = null;
  private expiresAtMs = 0;

  async tryClaim(ownerId: string, ttlMs: number): Promise<LeaseClaimResult> {
    const now = Date.now();
    if (this.ownerId && now < this.expiresAtMs && this.ownerId !== ownerId) {
      return {
        claimed: false,
        ownerId: this.ownerId,
        reason: "lock_held",
      };
    }
    this.ownerId = ownerId;
    this.expiresAtMs = now + ttlMs;
    return { claimed: true, ownerId };
  }

  async release(ownerId: string): Promise<void> {
    if (this.ownerId === ownerId) {
      this.ownerId = null;
      this.expiresAtMs = 0;
    }
  }

  /** Test helper */
  isHeld(): boolean {
    return this.ownerId != null && Date.now() < this.expiresAtMs;
  }
}

/** Process-wide mutex so overlapping ticks share one in-flight refresh. */
class ProcessMutex {
  private chain: Promise<unknown> = Promise.resolve();
  private active = false;
  private activeOwner: string | null = null;

  get isActive(): boolean {
    return this.active;
  }

  get owner(): string | null {
    return this.activeOwner;
  }

  async runExclusive<T>(
    ownerId: string,
    fn: () => Promise<T>,
  ): Promise<{ ran: boolean; result?: T; skippedReason?: string }> {
    if (this.active) {
      return {
        ran: false,
        skippedReason: `overlap: active owner ${this.activeOwner ?? "unknown"}`,
      };
    }

    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const prev = this.chain;
    this.chain = prev.then(() => gate);

    await prev;
    if (this.active) {
      release();
      return {
        ran: false,
        skippedReason: `overlap: active owner ${this.activeOwner ?? "unknown"}`,
      };
    }

    this.active = true;
    this.activeOwner = ownerId;
    try {
      const result = await fn();
      return { ran: true, result };
    } finally {
      this.active = false;
      this.activeOwner = null;
      release();
    }
  }
}

const processMutex = new ProcessMutex();
const defaultLock = new InMemoryRefreshLock();

export function getRefreshLock(): InMemoryRefreshLock {
  return defaultLock;
}

export function isRefreshActive(): boolean {
  return processMutex.isActive;
}

/* ---- Refresh run result ---- */

export type RefreshRunResult = {
  status: "completed" | "skipped" | "failed";
  startedAt: string;
  finishedAt: string;
  session: ExtendedMarketSession;
  cadenceSeconds: number;
  universe: UniverseBuildResult | null;
  symbolsRequested: number;
  symbolsReceived: number;
  providerName: string | null;
  feedCoverage: FeedCoverage | null;
  usedFallback: boolean;
  healthEvents: ProviderHealthEvent[];
  usage: UsageSnapshot | null;
  errorMessage: string | null;
  skippedReason: string | null;
  breadth: {
    supported: boolean;
    explanation: string | null;
  };
  moversCoverageNotes: string | null;
};

export type RefreshServiceOptions = {
  env?: Env;
  router?: MarketDataRouter | null;
  cache?: MarketDataCache;
  usage?: UsageStore;
  lock?: RefreshLeaseClaim;
  watchlistSymbols?: string[];
  positionSymbols?: string[];
  reportInProgressSymbols?: string[];
  /** Force refresh even if cadence not due. */
  force?: boolean;
  now?: Date;
  lastRefreshAt?: Date | null;
  onHealthEvent?: (event: ProviderHealthEvent) => void;
};

let lastSuccessfulRefreshAt: Date | null = null;

export function getLastRefreshAt(): Date | null {
  return lastSuccessfulRefreshAt;
}

export function setLastRefreshAt(at: Date | null): void {
  lastSuccessfulRefreshAt = at;
}

/**
 * Run one adaptive refresh tick when due (or forced).
 * Overlapping callers: only one executes; others return status=skipped.
 */
export async function runMarketDataRefresh(
  options: RefreshServiceOptions = {},
): Promise<RefreshRunResult> {
  const env = options.env ?? getEnv();
  const now = options.now ?? new Date();
  const session = inferUsEquitySession(now);
  const cadenceSeconds = refreshCadenceSeconds(env, session);
  const startedAt = now.toISOString();
  const healthEvents: ProviderHealthEvent[] = [];
  const onHealth = (e: ProviderHealthEvent) => {
    healthEvents.push(e);
    options.onHealthEvent?.(e);
  };

  const lastAt = options.lastRefreshAt ?? lastSuccessfulRefreshAt;
  if (!options.force && lastAt) {
    const elapsedSec = (now.getTime() - lastAt.getTime()) / 1000;
    if (elapsedSec < cadenceSeconds) {
      return {
        status: "skipped",
        startedAt,
        finishedAt: new Date().toISOString(),
        session,
        cadenceSeconds,
        universe: null,
        symbolsRequested: 0,
        symbolsReceived: 0,
        providerName: null,
        feedCoverage: null,
        usedFallback: false,
        healthEvents,
        usage: null,
        errorMessage: null,
        skippedReason: `cadence: ${elapsedSec.toFixed(1)}s < ${cadenceSeconds}s`,
        breadth: {
          supported: false,
          explanation: null,
        },
        moversCoverageNotes: null,
      };
    }
  }

  const ownerId = `refresh:${startedAt}:${Math.random().toString(36).slice(2, 8)}`;
  const lock = options.lock ?? defaultLock;
  const ttlMs = Math.max(30_000, cadenceSeconds * 1000);

  const exclusive = await processMutex.runExclusive(ownerId, async () => {
    const claim = await lock.tryClaim(ownerId, ttlMs);
    if (!claim.claimed) {
      return {
        status: "skipped" as const,
        skippedReason: claim.reason ?? "lease_not_claimed",
        resultPartial: true as const,
      };
    }

    try {
      return await executeRefresh({
        env,
        now,
        session,
        cadenceSeconds,
        startedAt,
        healthEvents,
        onHealth,
        options,
      });
    } finally {
      await lock.release(ownerId);
    }
  });

  if (!exclusive.ran) {
    return {
      status: "skipped",
      startedAt,
      finishedAt: new Date().toISOString(),
      session,
      cadenceSeconds,
      universe: null,
      symbolsRequested: 0,
      symbolsReceived: 0,
      providerName: null,
      feedCoverage: null,
      usedFallback: false,
      healthEvents,
      usage: null,
      errorMessage: null,
      skippedReason: exclusive.skippedReason ?? "overlap",
      breadth: { supported: false, explanation: null },
      moversCoverageNotes: null,
    };
  }

  const inner = exclusive.result!;
  if ("resultPartial" in inner && inner.resultPartial) {
    return {
      status: "skipped",
      startedAt,
      finishedAt: new Date().toISOString(),
      session,
      cadenceSeconds,
      universe: null,
      symbolsRequested: 0,
      symbolsReceived: 0,
      providerName: null,
      feedCoverage: null,
      usedFallback: false,
      healthEvents,
      usage: null,
      errorMessage: null,
      skippedReason: inner.skippedReason ?? "lease_not_claimed",
      breadth: { supported: false, explanation: null },
      moversCoverageNotes: null,
    };
  }

  return inner as RefreshRunResult;
}

async function executeRefresh(args: {
  env: Env;
  now: Date;
  session: ExtendedMarketSession;
  cadenceSeconds: number;
  startedAt: string;
  healthEvents: ProviderHealthEvent[];
  onHealth: (e: ProviderHealthEvent) => void;
  options: RefreshServiceOptions;
}): Promise<RefreshRunResult> {
  const { env, now, session, cadenceSeconds, startedAt, healthEvents, onHealth, options } =
    args;
  const cache = options.cache ?? getMarketDataCache(env);
  const usage = options.usage ?? getUsageStore();
  const positionSymbols =
    options.positionSymbols ?? (await loadOpenPositionTickers());
  const coverage =
    options.watchlistSymbols != null
      ? { symbols: options.watchlistSymbols, notes: [] as string[] }
      : await loadFirmCoverageSymbols();

  const universe = buildUniverse({
    maxSize: env.MARKET_DATA_MAX_UNIVERSE_SIZE,
    watchlistSymbols: coverage.symbols,
    positionSymbols,
    reportInProgressSymbols: options.reportInProgressSymbols ?? [],
    now,
  });
  if (coverage.notes.length) {
    universe.notes.push(...coverage.notes);
  }

  const router =
    options.router === undefined
      ? createMarketDataRouter(env, onHealth)
      : options.router;

  if (!router) {
    const msg = "No market-data router configured";
    cache.markRefreshFailed(msg, now);
    return {
      status: "failed",
      startedAt,
      finishedAt: new Date().toISOString(),
      session,
      cadenceSeconds,
      universe,
      symbolsRequested: universe.symbols.length,
      symbolsReceived: 0,
      providerName: null,
      feedCoverage: null,
      usedFallback: false,
      healthEvents,
      usage: null,
      errorMessage: msg,
      skippedReason: null,
      breadth: {
        supported: false,
        explanation:
          "Breadth requires sip or full_market feed coverage; no provider configured.",
      },
      moversCoverageNotes: null,
    };
  }

  const primaryKey = env.MARKET_DATA_PRIMARY;
  if (usage.isCircuitOpen(primaryKey, now)) {
    const backoff = usage.backoffMs(primaryKey, now);
    const msg = `Circuit open for ${primaryKey}; backoff ${backoff}ms`;
    onHealth({
      at: now.toISOString(),
      providerId: primaryKey,
      status: "degraded",
      message: msg,
    });
    return {
      status: "skipped",
      startedAt,
      finishedAt: new Date().toISOString(),
      session,
      cadenceSeconds,
      universe,
      symbolsRequested: universe.symbols.length,
      symbolsReceived: 0,
      providerName: primaryKey,
      feedCoverage: null,
      usedFallback: false,
      healthEvents,
      usage: usage.getSnapshot(primaryKey, now),
      errorMessage: null,
      skippedReason: msg,
      breadth: { supported: false, explanation: null },
      moversCoverageNotes: null,
    };
  }

  try {
    let quotes: NormalizedQuoteObservation[] = [];
    let snapshots: NormalizedSnapshotObservation[] = [];
    let feedCoverage: FeedCoverage = "unknown";
    let providerName: string = primaryKey;
    let licenseScopeId = "";
    let latencyClass: "realtime" | "delayed_15m" | "eod" | "stale" | "unavailable" | "mock" =
      "unavailable";
    let usedFallback = false;

    try {
      const snapBatch = await router.fetchSnapshots({
        symbols: universe.symbols,
        surface: "dashboard_display",
      });
      snapshots = snapBatch.snapshots;
      quotes = snapBatch.snapshots;
      feedCoverage = snapBatch.feedCoverage;
      providerName = snapBatch.providerName;
      licenseScopeId = snapBatch.licenseScopeId;
      latencyClass = snapBatch.latencyClass;
      usedFallback = Boolean(snapBatch.usedFallback);
    } catch (snapErr) {
      if (snapErr instanceof EntitlementError) {
        onHealth({
          at: new Date().toISOString(),
          providerId: primaryKey,
          status: "entitlement",
          message: snapErr.message,
          details: { code: snapErr.code },
        });
      }
      const quoteBatch = await router.fetchQuotes({
        symbols: universe.symbols,
        surface: "dashboard_display",
      });
      quotes = quoteBatch.quotes;
      feedCoverage = quoteBatch.feedCoverage;
      providerName = quoteBatch.providerName;
      licenseScopeId = quoteBatch.licenseScopeId;
      latencyClass = quoteBatch.latencyClass;
      usedFallback = Boolean(quoteBatch.usedFallback);
    }

    if (snapshots.length > 0) {
      cache.writeSnapshots(snapshots, {
        feedCoverage,
        latencyClass,
        licenseScopeId,
        providerName,
        marketSession: session,
        universeSymbols: universe.symbols,
        at: now,
      });
    } else {
      cache.writeQuotes(quotes, {
        feedCoverage,
        latencyClass,
        licenseScopeId,
        providerName,
        marketSession: session,
        universeSymbols: universe.symbols,
        at: now,
      });
    }

    const moversCoverageNotes = iexMoversCoverageNote(feedCoverage);
    let movers: NormalizedMoverObservation[] = [];
    try {
      const moverBatch = await router.fetchMovers({
        universe: universe.symbols,
        direction: "both",
        limit: 25,
        surface: "dashboard_display",
      });
      movers = moverBatch.movers;
      if (moverBatch.usedFallback) usedFallback = true;
    } catch (moverErr) {
      // Derive movers from cached quotes when provider movers unavailable
      movers = deriveMoversFromQuotes(quotes, session, {
        feedCoverage,
        latencyClass,
        licenseScopeId,
        providerName,
      });
      if (moverErr instanceof EntitlementError) {
        onHealth({
          at: new Date().toISOString(),
          providerId: providerName,
          status: "entitlement",
          message: moverErr.message,
          details: { code: moverErr.code },
        });
      }
    }
    cache.writeMovers(movers, moversCoverageNotes);

    const breadthOk = breadthSupported(feedCoverage);
    if (breadthOk) {
      cache.setBreadth({
        supported: true,
        advancing: null,
        declining: null,
      });
    } else {
      cache.setBreadth({
        supported: false,
        explanation: `Breadth unavailable: feed coverage is "${feedCoverage}" (requires sip or full_market).`,
      });
    }

    const usageSnap = usage.record({
      providerKey: providerName,
      requests: 1,
      symbols: universe.symbols.length,
      records: quotes.length + movers.length,
      at: now,
    });

    lastSuccessfulRefreshAt = now;

    if (usedFallback) {
      onHealth({
        at: new Date().toISOString(),
        providerId: providerName,
        status: "fallback",
        message: "Refresh completed via fallback provider",
        details: { feedCoverage, latencyClass },
      });
    }

    return {
      status: "completed",
      startedAt,
      finishedAt: new Date().toISOString(),
      session,
      cadenceSeconds,
      universe,
      symbolsRequested: universe.symbols.length,
      symbolsReceived: quotes.length,
      providerName,
      feedCoverage,
      usedFallback,
      healthEvents,
      usage: usageSnap,
      errorMessage: null,
      skippedReason: null,
      breadth: {
        supported: breadthOk,
        explanation: breadthOk
          ? null
          : `Breadth unavailable: feed coverage is "${feedCoverage}" (requires sip or full_market).`,
      },
      moversCoverageNotes,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    cache.markRefreshFailed(message, now);
    usage.record({
      providerKey: primaryKey,
      requests: 1,
      error: true,
      at: now,
    });

    if (err instanceof EntitlementError) {
      onHealth({
        at: new Date().toISOString(),
        providerId: primaryKey,
        status: "entitlement",
        message,
        details: { code: err.code },
      });
    } else {
      onHealth({
        at: new Date().toISOString(),
        providerId: primaryKey,
        status: "down",
        message,
      });
    }

    return {
      status: "failed",
      startedAt,
      finishedAt: new Date().toISOString(),
      session,
      cadenceSeconds,
      universe,
      symbolsRequested: universe.symbols.length,
      symbolsReceived: 0,
      providerName: primaryKey,
      feedCoverage: null,
      usedFallback: false,
      healthEvents,
      usage: usage.getSnapshot(primaryKey, now),
      errorMessage: message,
      skippedReason: null,
      breadth: {
        supported: false,
        explanation:
          "Breadth unavailable after refresh failure.",
      },
      moversCoverageNotes: null,
    };
  }
}

function deriveMoversFromQuotes(
  quotes: NormalizedQuoteObservation[],
  session: ExtendedMarketSession,
  meta: {
    feedCoverage: FeedCoverage;
    latencyClass: NormalizedQuoteObservation["latencyClass"];
    licenseScopeId: string;
    providerName: string;
  },
): NormalizedMoverObservation[] {
  return [...quotes]
    .filter((q) => q.changePercent != null && Number.isFinite(q.changePercent))
    .sort(
      (a, b) =>
        Math.abs(b.changePercent ?? 0) - Math.abs(a.changePercent ?? 0),
    )
    .slice(0, 25)
    .map((q) => ({
      instrumentId: q.instrumentId,
      ticker: q.ticker,
      name: q.ticker,
      last: q.last,
      changeAbsolute: q.changeAbsolute ?? null,
      changePercent: q.changePercent ?? null,
      volume: q.volume ?? null,
      direction: (q.changePercent ?? 0) >= 0 ? ("up" as const) : ("down" as const),
      marketSession: session,
      providerName: meta.providerName,
      providerTimestamp: q.providerTimestamp,
      retrievalTimestamp: q.retrievalTimestamp,
      feedCoverage: meta.feedCoverage,
      latencyClass: meta.latencyClass,
      licenseScopeId: meta.licenseScopeId,
      permittedSurfaces: q.permittedSurfaces,
      valueKind: "derived" as const,
      coverageNotes: iexMoversCoverageNote(meta.feedCoverage) ?? undefined,
      sourceQuality: q.sourceQuality,
      currency: q.currency,
    }));
}

/** Whether a cron tick should attempt refresh (always tries; service enforces cadence). */
export function shouldAttemptRefresh(): boolean {
  return true;
}
