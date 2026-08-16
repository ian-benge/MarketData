/**
 * In-memory observation cache — latest quotes by ticker with provenance,
 * optional minute-bar rings. Dashboard reads must never call providers.
 * Never zero-fills missing values; preserves last valid on refresh failure.
 */

import type { Env } from "@/lib/env";
import { getEnv } from "@/lib/env";
import {
  effectiveLatencyClass,
  latencyCoverageLabel,
  type ExtendedMarketSession,
  type FeedCoverage,
  type LatencyClass,
  type NormalizedBarObservation,
  type NormalizedMoverObservation,
  type NormalizedQuoteObservation,
  type NormalizedSnapshotObservation,
} from "@/lib/market-data/schemas";
import type {
  NormalizedMover,
  NormalizedQuote,
} from "@/lib/providers/types";

export type CachedQuoteEntry = {
  observation: NormalizedQuoteObservation;
  /** Wall-clock when this entry was written successfully. */
  cachedAt: string;
  stale: boolean;
  staleReason?: string;
};

export type CachedBarsEntry = {
  ticker: string;
  interval: "1m";
  bars: NormalizedBarObservation[];
  cachedAt: string;
  stale: boolean;
};

export type CacheMeta = {
  feedCoverage: FeedCoverage;
  latencyClass: LatencyClass;
  latencyCoverageLabel: string;
  licenseScopeId: string;
  providerName: string;
  marketSession: ExtendedMarketSession | null;
  lastSuccessfulRefreshAt: string | null;
  lastAttemptAt: string | null;
  lastError: string | null;
  universeSymbols: string[];
  universeCoverageLabel: string | null;
  movers: NormalizedMoverObservation[];
  moversCoverageNotes: string | null;
  breadth: {
    supported: boolean;
    explanation: string | null;
    advancing: number | null;
    declining: number | null;
  };
};

export type DashboardCacheSnapshot = {
  asOf: string;
  dataCutoff: string;
  stale: boolean;
  latencyCoverageLabel: string;
  feedCoverage: FeedCoverage;
  latencyClass: LatencyClass;
  marketSession: ExtendedMarketSession | null;
  licenseScopeId: string | null;
  tape: NormalizedQuote[];
  movers: NormalizedMover[];
  breadth: CacheMeta["breadth"];
  universeSize: number;
  universeCoverageLabel: string | null;
  lastSuccessfulRefreshAt: string | null;
  notes: string[];
};

const DEFAULT_BAR_RING = 120;

function mapSessionToLegacy(
  session: ExtendedMarketSession,
): "premarket" | "regular" | "afterhours" | "closed" | "unknown" {
  if (session === "overnight") return "closed";
  return session;
}

function latencyToDelayStatus(
  latency: LatencyClass,
): "realtime" | "delayed" | "unknown" {
  if (latency === "realtime") return "realtime";
  if (latency === "mock" || latency === "unavailable") return "unknown";
  return "delayed";
}

export function quoteObservationToLegacy(
  obs: NormalizedQuoteObservation,
): NormalizedQuote {
  return {
    instrumentId: obs.instrumentId,
    ticker: obs.ticker,
    last: obs.last,
    bid: obs.bid ?? null,
    ask: obs.ask ?? null,
    open: obs.open ?? null,
    high: obs.high ?? null,
    low: obs.low ?? null,
    priorClose: obs.priorClose ?? null,
    volume: obs.volume ?? null,
    changeAbsolute: obs.changeAbsolute ?? null,
    changePercent: obs.changePercent ?? null,
    value: obs.last,
    units: "price",
    marketSession: mapSessionToLegacy(obs.marketSession),
    providerName: obs.providerName,
    providerTimestamp: obs.providerTimestamp,
    retrievalTimestamp: obs.retrievalTimestamp,
    delayStatus: latencyToDelayStatus(obs.latencyClass),
    currency: obs.currency ?? "USD",
    sourceQuality: obs.sourceQuality ?? "secondary",
    coverageNotes: obs.coverageNotes,
    officialClose:
      "dailyClose" in obs &&
      typeof (obs as { dailyClose?: number | null }).dailyClose === "number"
        ? (obs as { dailyClose: number }).dailyClose
        : null,
  };
}

export function moverObservationToLegacy(
  m: NormalizedMoverObservation,
): NormalizedMover {
  return {
    instrumentId: m.instrumentId,
    ticker: m.ticker,
    name: m.name,
    last: m.last,
    changeAbsolute: m.changeAbsolute,
    changePercent: m.changePercent,
    volume: m.volume ?? null,
    direction: m.direction,
    marketSession: mapSessionToLegacy(m.marketSession),
    providerName: m.providerName,
    providerTimestamp: m.providerTimestamp,
    retrievalTimestamp: m.retrievalTimestamp,
    delayStatus: latencyToDelayStatus(m.latencyClass),
    currency: m.currency ?? "USD",
    sourceQuality: m.sourceQuality ?? "secondary",
    coverageNotes: m.coverageNotes,
  };
}

export type MarketDataCacheOptions = {
  staleAfterSeconds?: number;
  barRingSize?: number;
};

export class MarketDataCache {
  private quotes = new Map<string, CachedQuoteEntry>();
  private bars = new Map<string, CachedBarsEntry>();
  private meta: CacheMeta = {
    feedCoverage: "unknown",
    latencyClass: "unavailable",
    latencyCoverageLabel: "Unavailable",
    licenseScopeId: "",
    providerName: "",
    marketSession: null,
    lastSuccessfulRefreshAt: null,
    lastAttemptAt: null,
    lastError: null,
    universeSymbols: [],
    universeCoverageLabel: null,
    movers: [],
    moversCoverageNotes: null,
    breadth: {
      supported: false,
      explanation:
        "Breadth requires sip or full_market feed coverage; not available for IEX/narrow feeds.",
      advancing: null,
      declining: null,
    },
  };
  private readonly staleAfterSeconds: number;
  private readonly barRingSize: number;

  constructor(options: MarketDataCacheOptions = {}) {
    this.staleAfterSeconds = options.staleAfterSeconds ?? 180;
    this.barRingSize = options.barRingSize ?? DEFAULT_BAR_RING;
  }

  clear(): void {
    this.quotes.clear();
    this.bars.clear();
    this.meta = {
      feedCoverage: "unknown",
      latencyClass: "unavailable",
      latencyCoverageLabel: "Unavailable",
      licenseScopeId: "",
      providerName: "",
      marketSession: null,
      lastSuccessfulRefreshAt: null,
      lastAttemptAt: null,
      lastError: null,
      universeSymbols: [],
      universeCoverageLabel: null,
      movers: [],
      moversCoverageNotes: null,
      breadth: {
        supported: false,
        explanation:
          "Breadth requires sip or full_market feed coverage; not available for IEX/narrow feeds.",
        advancing: null,
        declining: null,
      },
    };
  }

  getMeta(): CacheMeta {
    return {
      ...this.meta,
      breadth: { ...this.meta.breadth },
      movers: [...this.meta.movers],
      universeSymbols: [...this.meta.universeSymbols],
    };
  }

  size(): number {
    return this.quotes.size;
  }

  hasData(): boolean {
    return this.quotes.size > 0;
  }

  private isEntryStale(entry: CachedQuoteEntry, now: Date): boolean {
    if (entry.stale) return true;
    const ageMs = now.getTime() - Date.parse(entry.cachedAt);
    return ageMs > this.staleAfterSeconds * 1000;
  }

  getQuote(ticker: string, now: Date = new Date()): CachedQuoteEntry | null {
    const entry = this.quotes.get(ticker.trim().toUpperCase());
    if (!entry) return null;
    const stale = this.isEntryStale(entry, now);
    return stale && !entry.stale
      ? { ...entry, stale: true, staleReason: "exceeded stale-after threshold" }
      : { ...entry, observation: { ...entry.observation } };
  }

  getQuotes(
    tickers: string[],
    now: Date = new Date(),
  ): CachedQuoteEntry[] {
    const out: CachedQuoteEntry[] = [];
    for (const t of tickers) {
      const e = this.getQuote(t, now);
      if (e) out.push(e);
    }
    return out;
  }

  getAllQuotes(now: Date = new Date()): CachedQuoteEntry[] {
    return [...this.quotes.keys()]
      .map((t) => this.getQuote(t, now)!)
      .filter(Boolean);
  }

  getBars(ticker: string): CachedBarsEntry | null {
    const entry = this.bars.get(ticker.trim().toUpperCase());
    if (!entry) return null;
    return {
      ...entry,
      bars: entry.bars.map((b) => ({ ...b })),
    };
  }

  /**
   * Write successful quote batch. Only updates tickers present in the batch —
   * missing symbols keep prior values (never zero-filled).
   */
  writeQuotes(
    observations: NormalizedQuoteObservation[],
    opts?: {
      feedCoverage?: FeedCoverage;
      latencyClass?: LatencyClass;
      licenseScopeId?: string;
      providerName?: string;
      marketSession?: ExtendedMarketSession;
      universeSymbols?: string[];
      universeCoverageLabel?: string | null;
      at?: Date;
    },
  ): void {
    const at = (opts?.at ?? new Date()).toISOString();
    for (const obs of observations) {
      const ticker = obs.ticker.trim().toUpperCase();
      // Skip empty shells — never write fabricated zeros
      if (obs.last == null && obs.bid == null && obs.ask == null) continue;
      this.quotes.set(ticker, {
        observation: {
          ...obs,
          ticker,
          marketSession: opts?.marketSession ?? obs.marketSession,
        },
        cachedAt: at,
        stale: false,
      });
    }

    if (opts?.feedCoverage) this.meta.feedCoverage = opts.feedCoverage;
    if (opts?.latencyClass) this.meta.latencyClass = opts.latencyClass;
    if (opts?.licenseScopeId) this.meta.licenseScopeId = opts.licenseScopeId;
    if (opts?.providerName) this.meta.providerName = opts.providerName;
    if (opts?.marketSession) this.meta.marketSession = opts.marketSession;
    if (opts?.universeSymbols) {
      this.meta.universeSymbols = [...opts.universeSymbols];
    }
    if (opts?.universeCoverageLabel !== undefined) {
      this.meta.universeCoverageLabel = opts.universeCoverageLabel;
    }
    this.meta.latencyCoverageLabel = latencyCoverageLabel({
      feedCoverage: this.meta.feedCoverage,
      latencyClass: this.meta.latencyClass,
      marketSession: this.meta.marketSession,
    });
    this.meta.lastSuccessfulRefreshAt = at;
    this.meta.lastAttemptAt = at;
    this.meta.lastError = null;
  }

  writeSnapshots(
    snapshots: NormalizedSnapshotObservation[],
    opts?: Parameters<MarketDataCache["writeQuotes"]>[1],
  ): void {
    this.writeQuotes(snapshots, opts);
    const at = (opts?.at ?? new Date()).toISOString();
    for (const snap of snapshots) {
      const ticker = snap.ticker.trim().toUpperCase();
      if (
        snap.minuteOpen == null &&
        snap.minuteHigh == null &&
        snap.minuteLow == null &&
        snap.minuteClose == null
      ) {
        continue;
      }
      const bar: NormalizedBarObservation = {
        instrumentId: snap.instrumentId,
        ticker,
        interval: "1m",
        open: snap.minuteOpen ?? null,
        high: snap.minuteHigh ?? null,
        low: snap.minuteLow ?? null,
        close: snap.minuteClose ?? snap.last,
        volume: snap.minuteVolume ?? null,
        barStart: snap.providerTimestamp,
        providerName: snap.providerName,
        providerTimestamp: snap.providerTimestamp,
        retrievalTimestamp: snap.retrievalTimestamp,
        feedCoverage: snap.feedCoverage,
        latencyClass: snap.latencyClass,
        licenseScopeId: snap.licenseScopeId,
        permittedSurfaces: snap.permittedSurfaces,
        valueKind: snap.valueKind,
        marketSession: snap.marketSession,
        currency: snap.currency,
        coverageNotes: snap.coverageNotes,
        sourceQuality: snap.sourceQuality,
      };
      const existing = this.bars.get(ticker);
      const ring = existing ? [...existing.bars, bar] : [bar];
      while (ring.length > this.barRingSize) ring.shift();
      this.bars.set(ticker, {
        ticker,
        interval: "1m",
        bars: ring,
        cachedAt: at,
        stale: false,
      });
    }
  }

  writeBars(ticker: string, bars: NormalizedBarObservation[], at?: Date): void {
    const key = ticker.trim().toUpperCase();
    const existing = this.bars.get(key);
    const merged = existing ? [...existing.bars] : [];
    for (const b of bars) {
      merged.push({ ...b, ticker: key });
    }
    while (merged.length > this.barRingSize) merged.shift();
    this.bars.set(key, {
      ticker: key,
      interval: "1m",
      bars: merged,
      cachedAt: (at ?? new Date()).toISOString(),
      stale: false,
    });
  }

  writeMovers(
    movers: NormalizedMoverObservation[],
    coverageNotes?: string | null,
  ): void {
    this.meta.movers = movers.map((m) => ({ ...m }));
    this.meta.moversCoverageNotes = coverageNotes ?? null;
  }

  setBreadth(
    input:
      | { supported: true; advancing: number | null; declining: number | null }
      | { supported: false; explanation: string },
  ): void {
    if (input.supported) {
      this.meta.breadth = {
        supported: true,
        explanation: null,
        advancing: input.advancing,
        declining: input.declining,
      };
    } else {
      this.meta.breadth = {
        supported: false,
        explanation: input.explanation,
        advancing: null,
        declining: null,
      };
    }
  }

  /**
   * Mark existing entries stale after a failed refresh — preserve last valid values.
   */
  markRefreshFailed(error: string, at: Date = new Date()): void {
    const atIso = at.toISOString();
    this.meta.lastAttemptAt = atIso;
    this.meta.lastError = error;
    for (const [ticker, entry] of this.quotes) {
      this.quotes.set(ticker, {
        ...entry,
        stale: true,
        staleReason: error,
      });
    }
    for (const [ticker, entry] of this.bars) {
      this.bars.set(ticker, { ...entry, stale: true });
    }
  }

  /**
   * Cache-only dashboard snapshot. Never invokes providers.
   * Returns null when the cache has never been populated.
   */
  getDashboardSnapshot(now: Date = new Date()): DashboardCacheSnapshot | null {
    if (!this.hasData()) return null;

    const entries = this.getAllQuotes(now);
    const anyStale =
      entries.some((e) => e.stale) ||
      (this.meta.lastSuccessfulRefreshAt != null &&
        now.getTime() - Date.parse(this.meta.lastSuccessfulRefreshAt) >
          this.staleAfterSeconds * 1000);

    const lastPrintAt = entries
      .map((entry) => Date.parse(entry.observation.providerTimestamp))
      .filter((ms) => Number.isFinite(ms))
      .sort((a, b) => b - a)[0];
    const tapeAsOf =
      lastPrintAt != null ? new Date(lastPrintAt).toISOString() : null;
    const asOf =
      tapeAsOf ??
      this.meta.lastSuccessfulRefreshAt ??
      entries[0]?.cachedAt ??
      now.toISOString();

    const notes: string[] = [];
    if (anyStale) {
      notes.push("Serving last valid observations; refresh is stale or failed.");
    }
    if (this.meta.lastError) {
      notes.push(`Last refresh error: ${this.meta.lastError}`);
    }
    if (!this.meta.breadth.supported && this.meta.breadth.explanation) {
      notes.push(this.meta.breadth.explanation);
    }
    if (this.meta.moversCoverageNotes) {
      notes.push(this.meta.moversCoverageNotes);
    }

    const latencyClass: LatencyClass = anyStale
      ? "stale"
      : effectiveLatencyClass(this.meta.latencyClass, this.meta.marketSession);

    return {
      asOf,
      dataCutoff: asOf,
      stale: anyStale,
      latencyCoverageLabel: latencyCoverageLabel({
        feedCoverage: this.meta.feedCoverage,
        latencyClass,
        marketSession: this.meta.marketSession,
      }),
      feedCoverage: this.meta.feedCoverage,
      latencyClass,
      marketSession: this.meta.marketSession,
      licenseScopeId: this.meta.licenseScopeId || null,
      tape: entries.map((e) => quoteObservationToLegacy(e.observation)),
      movers: this.meta.movers.map(moverObservationToLegacy),
      breadth: { ...this.meta.breadth },
      universeSize: this.meta.universeSymbols.length,
      universeCoverageLabel: this.meta.universeCoverageLabel,
      lastSuccessfulRefreshAt: this.meta.lastSuccessfulRefreshAt,
      notes,
    };
  }
}

let globalCache: MarketDataCache | null = null;

export function getMarketDataCache(env: Env = getEnv()): MarketDataCache {
  if (!globalCache) {
    globalCache = new MarketDataCache({
      staleAfterSeconds: env.MARKET_DATA_STALE_AFTER_SECONDS,
    });
  }
  return globalCache;
}

export function resetMarketDataCache(): void {
  globalCache = null;
}
