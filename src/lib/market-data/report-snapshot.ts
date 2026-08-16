/**
 * Freeze market observations + session baselines + provenance at report
 * normalizing stage. Snapshot is immutable (deep-frozen).
 */

import {
  computeSessionBaselines,
  withGap,
  type SessionBaselines,
} from "@/lib/market-data/session-math";
import {
  effectiveLatencyClass,
  latencyCoverageLabel,
  type ExtendedMarketSession,
  type FeedCoverage,
  type LatencyClass,
  type LicenseScope,
  type ProductSurface,
} from "@/lib/market-data/schemas";
import type {
  NormalizedBreadth,
  NormalizedMover,
  NormalizedQuote,
} from "@/lib/providers/types";

export type FrozenQuoteObservation = {
  ticker: string;
  instrumentId: string;
  last: number | null;
  priorClose: number | null;
  open: number | null;
  high: number | null;
  low: number | null;
  volume: number | null;
  changeAbsolute: number | null;
  changePercent: number | null;
  marketSession: ExtendedMarketSession;
  baselines: SessionBaselines;
  providerName: string;
  providerTimestamp: string;
  retrievalTimestamp: string;
  feedCoverage: FeedCoverage;
  latencyClass: LatencyClass;
  licenseScopeId: string;
  permittedSurfaces: ProductSurface[];
  coverageNotes?: string;
};

export type ReportMarketFreezeProvenance = {
  frozenAt: string;
  dataCutoff: string;
  feedCoverage: FeedCoverage;
  latencyClass: LatencyClass;
  latencyCoverageLabel: string;
  licenseScopeId: string;
  licenseScope?: LicenseScope;
  permittedSurfaces: ProductSurface[];
  providerNames: string[];
  marketSession: ExtendedMarketSession;
  sourceMode: "live" | "fixtures" | "cache";
  notes: string[];
};

export type ReportMarketFreeze = {
  provenance: ReportMarketFreezeProvenance;
  observations: FrozenQuoteObservation[];
  movers: Array<{
    ticker: string;
    last: number | null;
    changePercent: number | null;
    changeAbsolute: number | null;
    direction: "up" | "down";
    feedCoverage: FeedCoverage;
    latencyClass: LatencyClass;
  }>;
  breadth: {
    included: boolean;
    explanation: string | null;
    advancing: number | null;
    declining: number | null;
  };
  /** Opaque calculations bag (baselines already on observations). */
  calculations: {
    sessionBaselinesByTicker: Record<string, SessionBaselines>;
  };
  /** Resolved at collect time; archived reports must not live-bind later list edits. */
  watchlistTickers: string[];
};

function mapLegacySession(
  session: string | undefined,
): ExtendedMarketSession {
  if (session === "premarket") return "premarket";
  if (session === "afterhours") return "afterhours";
  if (session === "regular") return "regular";
  if (session === "overnight") return "overnight";
  return "closed";
}

function inferFeedFromQuotes(quotes: NormalizedQuote[]): FeedCoverage {
  const notes = quotes.map((q) => q.coverageNotes ?? "").join(" ").toLowerCase();
  if (notes.includes("iex")) return "iex";
  if (notes.includes("sip")) return "sip";
  if (quotes.some((q) => q.delayStatus === "realtime")) return "unknown";
  if (quotes.some((q) => q.sourceQuality === "mock")) return "unknown";
  return "delayed_15m";
}

function inferLatency(
  quotes: NormalizedQuote[],
  session: ExtendedMarketSession,
): LatencyClass {
  if (quotes.some((q) => q.sourceQuality === "mock")) return "mock";
  if (session === "closed") return "eod";
  if (quotes.every((q) => q.delayStatus === "realtime")) return "realtime";
  if (quotes.some((q) => q.delayStatus === "delayed")) return "delayed_15m";
  return "unavailable";
}

function officialCloseForQuote(
  quote: NormalizedQuote,
  session: ExtendedMarketSession,
): number | null {
  const explicit =
    quote.officialClose != null && Number.isFinite(quote.officialClose)
      ? quote.officialClose
      : null;
  if (session === "afterhours") {
    return explicit;
  }
  return explicit ?? quote.priorClose ?? null;
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object") return value;
  Object.freeze(value);
  for (const v of Object.values(value as Record<string, unknown>)) {
    if (v && typeof v === "object" && !Object.isFrozen(v)) {
      deepFreeze(v);
    }
  }
  return value;
}

export type FreezeMarketInput = {
  quotes: NormalizedQuote[];
  movers?: NormalizedMover[];
  breadth?: NormalizedBreadth | null;
  asOf?: string;
  feedCoverage?: FeedCoverage;
  latencyClass?: LatencyClass;
  licenseScopeId?: string;
  licenseScope?: LicenseScope;
  permittedSurfaces?: ProductSurface[];
  marketSession?: ExtendedMarketSession;
  sourceMode?: "live" | "fixtures" | "cache";
  notes?: string[];
  now?: Date;
  watchlistTickers?: string[];
};

/**
 * Build an immutable report market snapshot from live/normalized quotes.
 */
export function freezeReportMarketSnapshot(
  input: FreezeMarketInput,
): ReportMarketFreeze {
  const now = input.now ?? new Date();
  const frozenAt = now.toISOString();
  const dataCutoff = input.asOf ?? frozenAt;
  const feedCoverage =
    input.feedCoverage ?? inferFeedFromQuotes(input.quotes);
  const session =
    input.marketSession ??
    mapLegacySession(input.quotes[0]?.marketSession) ??
    "closed";
  const latencyClass = effectiveLatencyClass(
    input.latencyClass ?? inferLatency(input.quotes, session),
    session,
  );
  const licenseScopeId = input.licenseScopeId ?? "unknown";
  const permittedSurfaces = input.permittedSurfaces ?? [
    "dashboard_display",
    "server_calculations",
    "in_app_reports",
  ];

  const observations: FrozenQuoteObservation[] = input.quotes.map((q) => {
    const marketSession = mapLegacySession(q.marketSession) ?? session;
    let baselines = computeSessionBaselines({
      session: marketSession,
      last: q.last,
      priorRegularClose: q.priorClose,
      officialClose: officialCloseForQuote(q, marketSession),
    });
    baselines = withGap(baselines, q.open, q.priorClose);
    return {
      ticker: q.ticker,
      instrumentId: q.instrumentId,
      last: q.last,
      priorClose: q.priorClose ?? null,
      open: q.open ?? null,
      high: q.high ?? null,
      low: q.low ?? null,
      volume: q.volume ?? null,
      changeAbsolute: q.changeAbsolute ?? null,
      changePercent: q.changePercent ?? null,
      marketSession,
      baselines,
      providerName: q.providerName,
      providerTimestamp: q.providerTimestamp,
      retrievalTimestamp: q.retrievalTimestamp,
      feedCoverage,
      latencyClass,
      licenseScopeId,
      permittedSurfaces: [...permittedSurfaces],
      coverageNotes: q.coverageNotes,
    };
  });

  const sessionBaselinesByTicker: Record<string, SessionBaselines> = {};
  for (const obs of observations) {
    sessionBaselinesByTicker[obs.ticker] = obs.baselines;
  }

  const breadthSupported =
    feedCoverage === "sip" || feedCoverage === "full_market";
  const breadth = breadthSupported
    ? {
        included: true,
        explanation: null as string | null,
        advancing: input.breadth?.advancing ?? null,
        declining: input.breadth?.declining ?? null,
      }
    : {
        included: false,
        explanation: `Breadth omitted: feed coverage "${feedCoverage}" is too narrow (requires sip or full_market).`,
        advancing: null,
        declining: null,
      };

  const movers = (input.movers ?? []).map((m) => ({
    ticker: m.ticker,
    last: m.last,
    changePercent: m.changePercent,
    changeAbsolute: m.changeAbsolute,
    direction: m.direction,
    feedCoverage,
    latencyClass,
  }));

  const notes = [...(input.notes ?? [])];
  if (feedCoverage === "iex") {
    notes.push(
      "IEX tracked-universe movers only — not labeled as SIP or full-market breadth.",
    );
  }
  if (!breadth.included && breadth.explanation) {
    notes.push(breadth.explanation);
  }

  const freeze: ReportMarketFreeze = {
    provenance: {
      frozenAt,
      dataCutoff,
      feedCoverage,
      latencyClass,
      latencyCoverageLabel: latencyCoverageLabel({
        feedCoverage,
        latencyClass,
        marketSession: session,
      }),
      licenseScopeId,
      licenseScope: input.licenseScope,
      permittedSurfaces: [...permittedSurfaces],
      providerNames: [
        ...new Set(input.quotes.map((q) => q.providerName)),
      ],
      marketSession: session,
      sourceMode: input.sourceMode ?? "live",
      notes,
    },
    observations,
    movers,
    breadth,
    calculations: { sessionBaselinesByTicker },
    watchlistTickers: [...(input.watchlistTickers ?? [])],
  };

  return deepFreeze(freeze);
}

/** True when a freeze object is deeply frozen (tests). */
export function isDeeplyFrozen(value: unknown): boolean {
  if (value === null || typeof value !== "object") return true;
  if (!Object.isFrozen(value)) return false;
  return Object.values(value as Record<string, unknown>).every(isDeeplyFrozen);
}
