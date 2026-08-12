import type { Env } from "@/lib/env";
import type {
  BarProvider,
  CapabilityKeyedProvider,
  MarketDataCapabilities,
  MoverProvider,
  QuoteProvider,
} from "@/lib/market-data/capabilities";
import {
  assertSurfaceAllowed,
  licenseConfigFromEnv,
  type LicenseConfig,
} from "@/lib/market-data/licensing";
import {
  EntitlementError,
  BarsRequestSchema,
  MoversRequestSchema,
  QuoteRequestSchema,
  SnapshotRequestSchema,
  type FeedCoverage,
  type LatencyClass,
  type MoversRequest,
  type NormalizedBarBatch,
  type NormalizedMoverBatch,
  type NormalizedQuoteBatch,
  type NormalizedSnapshotBatch,
  type ProductSurface,
  type QuoteRequest,
  type BarsRequest,
  type SnapshotRequest,
} from "@/lib/market-data/schemas";
import type { MarketDataProvider } from "@/lib/providers/interfaces";
import type {
  BreadthRequest,
  MoversRequest as LegacyMoversRequest,
  NormalizedBar,
  NormalizedBreadth,
  NormalizedMover,
  NormalizedQuote,
  TimeSeriesRequest,
} from "@/lib/providers/types";
import { AlpacaMarketDataProvider } from "@/lib/providers/alpaca/market-data";
import { FinnhubMarketDataProvider } from "@/lib/providers/finnhub/market-data";
import { MassiveMarketDataProvider } from "@/lib/providers/massive/market-data";

export type ProviderHealthEvent = {
  at: string;
  providerId: string;
  status: "healthy" | "degraded" | "fallback" | "entitlement" | "down";
  message: string;
  details?: Record<string, unknown>;
};

export type MarketDataRouterOptions = {
  env: Env;
  license?: LicenseConfig;
  primary?: CapabilityKeyedProvider & { legacy?: MarketDataProvider };
  fallback?: (CapabilityKeyedProvider & { legacy?: MarketDataProvider }) | null;
  onHealthEvent?: (event: ProviderHealthEvent) => void;
};

type Slot = CapabilityKeyedProvider & {
  legacy?: MarketDataProvider;
  feedCoverage?: FeedCoverage;
  latencyClass?: LatencyClass;
};

function hasCapability(
  slot: Slot | null | undefined,
  capability: keyof MarketDataCapabilities,
): slot is Slot {
  return Boolean(slot?.capabilities[capability]);
}

/**
 * Capability-aware primary/fallback router.
 * Preserves provenance on fallback (never relabels IEX as SIP).
 * Rejects disallowed product surfaces via licensing config.
 */
export class MarketDataRouter implements MarketDataProvider {
  private readonly license: LicenseConfig;
  private readonly primary: Slot | null;
  private readonly fallback: Slot | null;
  private readonly onHealthEvent?: (event: ProviderHealthEvent) => void;
  readonly healthEvents: ProviderHealthEvent[] = [];

  constructor(options: MarketDataRouterOptions) {
    this.license = options.license ?? licenseConfigFromEnv(options.env);
    this.primary = options.primary ?? null;
    this.fallback = options.fallback ?? null;
    this.onHealthEvent = options.onHealthEvent;
  }

  private emit(event: Omit<ProviderHealthEvent, "at">): void {
    const full: ProviderHealthEvent = { ...event, at: new Date().toISOString() };
    this.healthEvents.push(full);
    this.onHealthEvent?.(full);
  }

  private assertSurface(surface: ProductSurface): void {
    assertSurfaceAllowed(this.license, surface);
  }

  private async withFallback<T extends { feedCoverage: FeedCoverage; latencyClass: LatencyClass; providerName: string }>(
    capability: keyof MarketDataCapabilities,
    surface: ProductSurface,
    run: (slot: Slot) => Promise<T>,
  ): Promise<T> {
    this.assertSurface(surface);
    const primaryOk = hasCapability(this.primary, capability);
    const fallbackOk = hasCapability(this.fallback, capability);

    if (!primaryOk && !fallbackOk) {
      throw new EntitlementError(
        "feature_unavailable",
        `No market-data provider available for capability "${capability}".`,
      );
    }

    if (primaryOk) {
      try {
        return await run(this.primary);
      } catch (err) {
        if (!fallbackOk) throw err;
        this.emit({
          providerId: this.primary.id,
          status: "fallback",
          message: `Primary provider failed for ${capability}; trying fallback.`,
          details: {
            error: err instanceof Error ? err.message : String(err),
            primaryFeed: this.primary.feedCoverage,
            fallbackId: this.fallback!.id,
          },
        });
      }
    }

    const result = await run(this.fallback!);
    // Provenance must remain the fallback provider's own feed/latency —
    // never rewrite to primary's labels (e.g. do not relabel IEX as SIP).
    return { ...result, usedFallback: true } as T;
  }

  async fetchQuotes(request: QuoteRequest): Promise<NormalizedQuoteBatch> {
    const req = QuoteRequestSchema.parse(request);
    return this.withFallback("quotes", req.surface, async (slot) => {
      if (!slot.quotes) {
        throw new EntitlementError(
          "feature_unavailable",
          `Provider ${slot.id} lacks quotes`,
        );
      }
      return slot.quotes.getQuotes(req);
    });
  }

  async fetchBars(request: BarsRequest): Promise<NormalizedBarBatch> {
    const req = BarsRequestSchema.parse(request);
    return this.withFallback("bars", req.surface, async (slot) => {
      if (!slot.bars) {
        throw new EntitlementError(
          "feature_unavailable",
          `Provider ${slot.id} lacks bars`,
        );
      }
      return slot.bars.getBars(req);
    });
  }

  async fetchSnapshots(
    request: SnapshotRequest,
  ): Promise<NormalizedSnapshotBatch> {
    const req = SnapshotRequestSchema.parse(request);
    return this.withFallback("snapshots", req.surface, async (slot) => {
      if (!slot.snapshots) {
        throw new EntitlementError(
          "feature_unavailable",
          `Provider ${slot.id} lacks snapshots`,
        );
      }
      return slot.snapshots.getSnapshots(req);
    });
  }

  async fetchMovers(request: MoversRequest): Promise<NormalizedMoverBatch> {
    const req = MoversRequestSchema.parse(request);
    return this.withFallback("movers", req.surface, async (slot) => {
      if (!slot.movers) {
        throw new EntitlementError(
          "feature_unavailable",
          `Provider ${slot.id} lacks movers`,
        );
      }
      return slot.movers.getMovers(req);
    });
  }

  /* ---- Legacy MarketDataProvider (uses primary then fallback legacy adapters) ---- */

  private legacySlots(): MarketDataProvider[] {
    const out: MarketDataProvider[] = [];
    if (this.primary?.legacy) out.push(this.primary.legacy);
    if (this.fallback?.legacy) out.push(this.fallback.legacy);
    return out;
  }

  async getQuotes(symbols: string[]): Promise<NormalizedQuote[]> {
    this.assertSurface("dashboard_display");
    const slots = this.legacySlots();
    if (slots.length === 0) {
      throw new EntitlementError(
        "feature_unavailable",
        "No legacy market-data provider configured",
      );
    }
    try {
      return await slots[0]!.getQuotes(symbols);
    } catch (err) {
      if (slots.length < 2) throw err;
      this.emit({
        providerId: this.primary?.id ?? "primary",
        status: "fallback",
        message: "Legacy getQuotes falling back",
        details: { error: err instanceof Error ? err.message : String(err) },
      });
      return slots[1]!.getQuotes(symbols);
    }
  }

  async getTimeSeries(request: TimeSeriesRequest): Promise<NormalizedBar[]> {
    this.assertSurface("dashboard_display");
    const slots = this.legacySlots();
    if (slots.length === 0) {
      throw new EntitlementError(
        "feature_unavailable",
        "No legacy market-data provider configured",
      );
    }
    try {
      return await slots[0]!.getTimeSeries(request);
    } catch (err) {
      if (slots.length < 2) throw err;
      this.emit({
        providerId: this.primary?.id ?? "primary",
        status: "fallback",
        message: "Legacy getTimeSeries falling back",
        details: { error: err instanceof Error ? err.message : String(err) },
      });
      return slots[1]!.getTimeSeries(request);
    }
  }

  async getMarketBreadth(
    request: BreadthRequest,
  ): Promise<NormalizedBreadth | null> {
    const slots = this.legacySlots();
    for (const slot of slots) {
      const breadth = await slot.getMarketBreadth(request);
      if (breadth) return breadth;
    }
    return null;
  }

  async getTopMovers(request: LegacyMoversRequest): Promise<NormalizedMover[]> {
    this.assertSurface("dashboard_display");
    const slots = this.legacySlots();
    if (slots.length === 0) {
      throw new EntitlementError(
        "feature_unavailable",
        "No legacy market-data provider configured",
      );
    }
    try {
      return await slots[0]!.getTopMovers(request);
    } catch (err) {
      if (slots.length < 2) throw err;
      this.emit({
        providerId: this.primary?.id ?? "primary",
        status: "fallback",
        message: "Legacy getTopMovers falling back",
        details: { error: err instanceof Error ? err.message : String(err) },
      });
      return slots[1]!.getTopMovers(request);
    }
  }
}

function alpacaSlot(provider: AlpacaMarketDataProvider): Slot {
  return {
    id: "alpaca",
    capabilities: provider.capabilities,
    quotes: provider.asQuoteProvider,
    bars: provider.asBarProvider,
    snapshots: provider.asSnapshotProvider,
    movers: provider.asMoverProvider,
    marketClock: provider.asClockProvider,
    legacy: provider,
  };
}

function massiveSlot(provider: MassiveMarketDataProvider): Slot {
  return {
    id: "massive",
    capabilities: provider.capabilities,
    quotes: provider.asQuoteProvider,
    bars: provider.asBarProvider,
    snapshots: provider.asSnapshotProvider,
    movers: provider.asMoverProvider,
    reference: provider.asReferenceProvider,
    marketClock: provider.asClockProvider,
    legacy: provider,
  };
}

function mapLegacySessionToExtended(
  session: string,
): "overnight" | "premarket" | "regular" | "afterhours" | "closed" {
  if (session === "premarket") return "premarket";
  if (session === "afterhours") return "afterhours";
  if (session === "regular") return "regular";
  return "closed";
}

function finnhubSlot(provider: FinnhubMarketDataProvider): Slot {
  const quotes: QuoteProvider = {
    getQuotes: async (request) => {
      const req = QuoteRequestSchema.parse(request);
      const rows = await provider.getQuotes(req.symbols);
      const retrievalTimestamp = new Date().toISOString();
      return {
        providerName: "finnhub",
        retrievalTimestamp,
        feedCoverage: "delayed_15m",
        latencyClass: "delayed_15m",
        licenseScopeId: "finnhub:secondary",
        permittedSurfaces: [req.surface],
        quotes: rows.map((q) => ({
          instrumentId: q.instrumentId,
          ticker: q.ticker,
          last: q.last,
          bid: q.bid ?? null,
          ask: q.ask ?? null,
          open: q.open ?? null,
          high: q.high ?? null,
          low: q.low ?? null,
          priorClose: q.priorClose ?? null,
          volume: q.volume ?? null,
          changeAbsolute: q.changeAbsolute ?? null,
          changePercent: q.changePercent ?? null,
          marketSession: mapLegacySessionToExtended(q.marketSession),
          providerName: "finnhub",
          providerTimestamp: q.providerTimestamp,
          retrievalTimestamp: q.retrievalTimestamp,
          feedCoverage: "delayed_15m" as const,
          latencyClass: "delayed_15m" as const,
          licenseScopeId: "finnhub:secondary",
          permittedSurfaces: [req.surface],
          valueKind: "normalized" as const,
          coverageNotes: q.coverageNotes,
          sourceQuality: q.sourceQuality,
          currency: q.currency,
        })),
      };
    },
  };

  const bars: BarProvider = {
    getBars: async (request) => {
      const req = BarsRequestSchema.parse(request);
      const rows = await provider.getTimeSeries({
        symbol: req.symbol,
        interval: req.interval,
        range:
          req.start && req.end
            ? { start: req.start, end: req.end }
            : undefined,
        limit: req.limit,
      });
      const retrievalTimestamp = new Date().toISOString();
      return {
        providerName: "finnhub",
        retrievalTimestamp,
        feedCoverage: "delayed_15m",
        latencyClass: "delayed_15m",
        licenseScopeId: "finnhub:secondary",
        permittedSurfaces: [req.surface],
        bars: rows.map((b) => ({
          instrumentId: b.instrumentId,
          ticker: b.ticker,
          interval: b.interval,
          open: b.open,
          high: b.high,
          low: b.low,
          close: b.close,
          volume: b.volume ?? null,
          barStart: b.barStart,
          barEnd: b.barEnd,
          providerName: "finnhub",
          providerTimestamp: b.providerTimestamp,
          retrievalTimestamp: b.retrievalTimestamp,
          feedCoverage: "delayed_15m" as const,
          latencyClass: "delayed_15m" as const,
          licenseScopeId: "finnhub:secondary",
          permittedSurfaces: [req.surface],
          valueKind: "normalized" as const,
          coverageNotes: b.coverageNotes,
          sourceQuality: b.sourceQuality,
          currency: b.currency,
        })),
      };
    },
  };

  const movers: MoverProvider = {
    getMovers: async (request) => {
      const req = MoversRequestSchema.parse(request);
      const rows = await provider.getTopMovers({
        universe: req.universe.join(","),
        direction: req.direction,
        limit: req.limit,
      });
      const retrievalTimestamp = new Date().toISOString();
      return {
        providerName: "finnhub",
        retrievalTimestamp,
        feedCoverage: "delayed_15m",
        latencyClass: "delayed_15m",
        licenseScopeId: "finnhub:secondary",
        permittedSurfaces: [req.surface],
        movers: rows.map((m) => ({
          instrumentId: m.instrumentId,
          ticker: m.ticker,
          name: m.name,
          last: m.last,
          changeAbsolute: m.changeAbsolute,
          changePercent: m.changePercent,
          volume: m.volume ?? null,
          direction: m.direction,
          marketSession: mapLegacySessionToExtended(m.marketSession),
          providerName: "finnhub",
          providerTimestamp: m.providerTimestamp,
          retrievalTimestamp: m.retrievalTimestamp,
          feedCoverage: "delayed_15m" as const,
          latencyClass: "delayed_15m" as const,
          licenseScopeId: "finnhub:secondary",
          permittedSurfaces: [req.surface],
          valueKind: "normalized" as const,
          coverageNotes: m.coverageNotes,
          sourceQuality: m.sourceQuality,
          currency: m.currency,
        })),
      };
    },
  };

  return {
    id: "finnhub",
    capabilities: {
      quotes: true,
      bars: true,
      snapshots: false,
      movers: true,
      reference: false,
      corporateActions: false,
      marketClock: false,
    },
    quotes,
    bars,
    movers,
    legacy: provider,
  };
}

function pickProvider(
  env: Env,
  id: string,
): (CapabilityKeyedProvider & { legacy?: MarketDataProvider }) | null {
  if (id === "alpaca") {
    const p = AlpacaMarketDataProvider.fromEnv(env);
    return p ? alpacaSlot(p) : null;
  }
  if (id === "massive") {
    const p = MassiveMarketDataProvider.fromEnv(env);
    return p ? massiveSlot(p) : null;
  }
  if (id === "finnhub" && env.FINNHUB_API_KEY) {
    return finnhubSlot(
      new FinnhubMarketDataProvider({ apiKey: env.FINNHUB_API_KEY }),
    );
  }
  return null;
}

/** Build a router from env primary/fallback settings. */
export function createMarketDataRouter(
  env: Env,
  onHealthEvent?: (event: ProviderHealthEvent) => void,
): MarketDataRouter | null {
  const primaryId = env.MARKET_DATA_PRIMARY;
  const fallbackId =
    env.MARKET_DATA_FALLBACK === "none" ? null : env.MARKET_DATA_FALLBACK;

  const primary = pickProvider(env, primaryId);
  const fallback = fallbackId ? pickProvider(env, fallbackId) : null;

  if (!primary && !fallback) return null;

  return new MarketDataRouter({
    env,
    primary: primary ?? fallback ?? undefined,
    fallback: primary ? fallback : null,
    onHealthEvent,
  });
}

/** Resolve MarketDataProvider for registry: router → finnhub → null. */
export function createRoutedMarketDataProvider(env: Env): MarketDataProvider | null {
  const router = createMarketDataRouter(env);
  if (router) return router;
  if (env.FINNHUB_API_KEY) {
    return new FinnhubMarketDataProvider({ apiKey: env.FINNHUB_API_KEY });
  }
  return null;
}
