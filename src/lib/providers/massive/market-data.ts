import type { Env } from "@/lib/env";
import type {
  BarProvider,
  MarketClockProvider,
  MarketDataCapabilities,
  MarketSnapshotProvider,
  MoverProvider,
  QuoteProvider,
  ReferenceDataProvider,
} from "@/lib/market-data/capabilities";
import {
  assertSurfaceAllowed,
  licenseConfigFromEnv,
  type LicenseConfig,
} from "@/lib/market-data/licensing";
import type {
  BarsRequest,
  CorporateActionsRequest,
  InstrumentRequest,
  MoversRequest,
  NormalizedBarBatch,
  NormalizedCorporateActionBatch,
  NormalizedInstrumentBatch,
  NormalizedMarketStatus,
  NormalizedMoverBatch,
  NormalizedQuoteBatch,
  NormalizedSnapshotBatch,
  NormalizedSnapshotObservation,
  QuoteRequest,
  SnapshotRequest,
} from "@/lib/market-data/schemas";
import {
  BarsRequestSchema,
  CorporateActionsRequestSchema,
  InstrumentRequestSchema,
  MoversRequestSchema,
  QuoteRequestSchema,
  SnapshotRequestSchema,
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
import { defaultBarsStart } from "@/lib/market-data/bars-window";
import { MassiveClient } from "@/lib/providers/massive/client";
import {
  MASSIVE_TIMESPAN,
  MassiveAggsResponseSchema,
  MassiveDividendsResponseSchema,
  MassiveSnapshotsResponseSchema,
  MassiveSplitsResponseSchema,
  MassiveTickerDetailsSchema,
  MassiveTickersListSchema,
  mapLegacySession,
  normalizeMassiveAggBar,
  normalizeMassiveDividend,
  normalizeMassiveInstrument,
  normalizeMassiveMarketStatus,
  normalizeMassiveSnapshot,
  normalizeMassiveSplit,
  resolveMassiveCoverage,
  snapshotToQuote,
  snapshotsToMovers,
  type MassiveNormalizeContext,
} from "@/lib/providers/massive/normalize";

export type MassiveMarketDataOptions = {
  apiKey: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  preferFmv?: boolean;
  /** Override latency when plan is known delayed. */
  latencyClass?: MassiveNormalizeContext["latencyClass"];
  feedCoverage?: MassiveNormalizeContext["feedCoverage"];
  license?: LicenseConfig;
  env?: Pick<
    Env,
    "MARKET_DATA_LICENSE_SCOPE" | "MARKET_DATA_LICENSE_ACKNOWLEDGED"
  >;
};

function isoNow(): string {
  return new Date().toISOString();
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Massive (formerly Polygon.io) market-data adapter.
 * Inactive when no API key is supplied (use fromEnv → null).
 * Paths are configuration-gated via base URL; shapes follow documented REST.
 */
export class MassiveMarketDataProvider implements MarketDataProvider {
  readonly id = "massive";
  readonly capabilities: MarketDataCapabilities = {
    quotes: true,
    bars: true,
    snapshots: true,
    movers: true,
    reference: true,
    corporateActions: true,
    marketClock: true,
  };

  private readonly client: MassiveClient;
  private readonly license: LicenseConfig;
  private readonly latencyClass: MassiveNormalizeContext["latencyClass"];
  private readonly feedCoverage: MassiveNormalizeContext["feedCoverage"];
  private cachedSession: NormalizedMarketStatus["session"] | null = null;

  readonly asQuoteProvider: QuoteProvider = {
    getQuotes: (r) => this.fetchQuotes(r),
  };
  readonly asBarProvider: BarProvider = {
    getBars: (r) => this.fetchBars(r),
  };
  readonly asSnapshotProvider: MarketSnapshotProvider = {
    getSnapshots: (r) => this.fetchSnapshots(r),
  };
  readonly asMoverProvider: MoverProvider = {
    getMovers: (r) => this.fetchMovers(r),
  };
  readonly asReferenceProvider: ReferenceDataProvider = {
    resolveInstruments: (r) => this.resolveInstruments(r),
    getCorporateActions: (r) => this.getCorporateActions(r),
  };
  readonly asClockProvider: MarketClockProvider = {
    getMarketStatus: (at) => this.fetchMarketStatus(at),
  };

  constructor(options: MassiveMarketDataOptions) {
    this.client = new MassiveClient({
      apiKey: options.apiKey,
      baseUrl: options.baseUrl,
      fetchImpl: options.fetchImpl,
      preferFmv: options.preferFmv,
    });
    this.license =
      options.license ??
      licenseConfigFromEnv(
        options.env ?? {
          MARKET_DATA_LICENSE_SCOPE: "single_user_development",
          MARKET_DATA_LICENSE_ACKNOWLEDGED: false,
        },
        "massive",
      );
    this.latencyClass = options.latencyClass;
    this.feedCoverage = options.feedCoverage;
  }

  static fromEnv(
    env: Env,
    fetchImpl?: typeof fetch,
  ): MassiveMarketDataProvider | null {
    if (!env.MASSIVE_API_KEY) return null;
    return new MassiveMarketDataProvider({
      apiKey: env.MASSIVE_API_KEY,
      baseUrl: env.MASSIVE_API_BASE_URL,
      fetchImpl,
      env,
    });
  }

  private ctx(retrievalTimestamp = isoNow()): MassiveNormalizeContext {
    return {
      licenseScopeId: this.license.licenseScopeId,
      permittedSurfaces: this.license.permittedSurfaces,
      retrievalTimestamp,
      marketSession: this.cachedSession ?? undefined,
      preferFmv: this.client.preferFmv,
      latencyClass: this.latencyClass,
      feedCoverage: this.feedCoverage,
    };
  }

  private batchMeta(retrievalTimestamp: string) {
    const cov = resolveMassiveCoverage(this.ctx(retrievalTimestamp));
    return {
      providerName: "massive" as const,
      retrievalTimestamp,
      feedCoverage: cov.feedCoverage,
      latencyClass: cov.latencyClass,
      licenseScopeId: this.license.licenseScopeId,
      permittedSurfaces: this.license.permittedSurfaces,
    };
  }

  async fetchSnapshots(
    request: SnapshotRequest,
  ): Promise<NormalizedSnapshotBatch> {
    const req = SnapshotRequestSchema.parse(request);
    assertSurfaceAllowed(this.license, req.surface);
    const retrievalTimestamp = isoNow();
    const symbols = req.symbols.map((s) => s.toUpperCase());
    const raw = await this.client.getJson(
      "/v2/snapshot/locale/us/markets/stocks/tickers",
      { tickers: symbols.join(",") },
    );
    const parsed = MassiveSnapshotsResponseSchema.parse(raw);
    const ctx = this.ctx(retrievalTimestamp);
    const tickers = parsed.tickers ?? (parsed.ticker ? [parsed.ticker] : []);
    const bySym = new Map(
      tickers.map((t) => [t.ticker.toUpperCase(), t] as const),
    );
    const snapshots: NormalizedSnapshotObservation[] = [];
    for (const sym of symbols) {
      const row = bySym.get(sym);
      if (row) snapshots.push(normalizeMassiveSnapshot(row, ctx));
    }
    return { ...this.batchMeta(retrievalTimestamp), snapshots };
  }

  async fetchQuotes(request: QuoteRequest): Promise<NormalizedQuoteBatch> {
    const req = QuoteRequestSchema.parse(request);
    const batch = await this.fetchSnapshots({
      symbols: req.symbols,
      surface: req.surface,
    });
    return {
      ...this.batchMeta(batch.retrievalTimestamp),
      quotes: batch.snapshots.map(snapshotToQuote),
    };
  }

  async fetchBars(request: BarsRequest): Promise<NormalizedBarBatch> {
    const req = BarsRequestSchema.parse(request);
    assertSurfaceAllowed(this.license, req.surface);
    const retrievalTimestamp = isoNow();
    const symbol = req.symbol.toUpperCase();
    const { multiplier, timespan } = MASSIVE_TIMESPAN[req.interval];
    const to = req.end ? ymd(new Date(req.end)) : ymd(new Date());
    const from = req.start
      ? ymd(new Date(req.start))
      : ymd(new Date(defaultBarsStart(req.interval, req.limit ?? 100)));
    const raw = await this.client.getJson(
      `/v2/aggs/ticker/${encodeURIComponent(symbol)}/range/${multiplier}/${timespan}/${from}/${to}`,
      {
        adjusted: req.adjusted === false ? "false" : "true",
        sort: "asc",
        limit: req.limit != null ? String(req.limit) : "50000",
      },
    );
    const parsed = MassiveAggsResponseSchema.parse(raw);
    const ctx = this.ctx(retrievalTimestamp);
    const bars = (parsed.results ?? []).map((b) =>
      normalizeMassiveAggBar(symbol, b, req.interval, ctx),
    );
    return { ...this.batchMeta(retrievalTimestamp), bars };
  }

  async fetchMovers(request: MoversRequest): Promise<NormalizedMoverBatch> {
    const req = MoversRequestSchema.parse(request);
    assertSurfaceAllowed(this.license, req.surface);
    const snaps = await this.fetchSnapshots({
      symbols: req.universe,
      surface: req.surface,
    });
    const movers = snapshotsToMovers(
      snaps.snapshots,
      req.direction,
      req.limit,
    );
    return { ...this.batchMeta(snaps.retrievalTimestamp), movers };
  }

  async fetchMarketStatus(_at: Date): Promise<NormalizedMarketStatus> {
    void _at;
    const retrievalTimestamp = isoNow();
    const raw = await this.client.getJson("/v1/marketstatus/now");
    const status = normalizeMassiveMarketStatus(raw, this.ctx(retrievalTimestamp));
    this.cachedSession = status.session;
    return status;
  }

  async resolveInstruments(
    request: InstrumentRequest,
  ): Promise<NormalizedInstrumentBatch> {
    const req = InstrumentRequestSchema.parse(request);
    assertSurfaceAllowed(this.license, req.surface);
    const retrievalTimestamp = isoNow();
    const ctx = this.ctx(retrievalTimestamp);
    const instruments = [];

    if (req.tickers?.length) {
      for (const ticker of req.tickers) {
        const raw = await this.client.getJson(
          `/v3/reference/tickers/${encodeURIComponent(ticker.toUpperCase())}`,
        );
        const parsed = MassiveTickerDetailsSchema.parse(raw);
        if (parsed.results) {
          instruments.push(normalizeMassiveInstrument(parsed.results, ctx));
        }
      }
    } else if (req.search) {
      const raw = await this.client.getJson("/v3/reference/tickers", {
        search: req.search,
        active: "true",
        limit: String(req.limit),
      });
      const parsed = MassiveTickersListSchema.parse(raw);
      for (const row of parsed.results ?? []) {
        instruments.push(normalizeMassiveInstrument(row, ctx));
      }
    }

    return { ...this.batchMeta(retrievalTimestamp), instruments };
  }

  async getCorporateActions(
    request: CorporateActionsRequest,
  ): Promise<NormalizedCorporateActionBatch> {
    const req = CorporateActionsRequestSchema.parse(request);
    assertSurfaceAllowed(this.license, req.surface);
    const retrievalTimestamp = isoNow();
    const ctx = this.ctx(retrievalTimestamp);
    const ticker = req.ticker.toUpperCase();
    const types = req.types ?? ["dividend", "split"];
    const actions = [];

    if (types.includes("dividend")) {
      const raw = await this.client.getJson("/stocks/v1/dividends", {
        ticker,
        limit: String(req.limit),
      });
      const parsed = MassiveDividendsResponseSchema.parse(raw);
      for (const row of parsed.results ?? []) {
        actions.push(normalizeMassiveDividend(row, ctx));
      }
    }
    if (types.includes("split")) {
      const raw = await this.client.getJson("/stocks/v1/splits", {
        ticker,
        limit: String(req.limit),
      });
      const parsed = MassiveSplitsResponseSchema.parse(raw);
      for (const row of parsed.results ?? []) {
        actions.push(normalizeMassiveSplit(row, ctx));
      }
    }

    return { ...this.batchMeta(retrievalTimestamp), actions };
  }

  /* ---- Legacy MarketDataProvider ---- */

  async getQuotes(symbols: string[]): Promise<NormalizedQuote[]> {
    const batch = await this.fetchQuotes({
      symbols,
      surface: "dashboard_display",
    });
    return batch.quotes.map((s) => ({
      instrumentId: s.instrumentId,
      ticker: s.ticker,
      last: s.last,
      bid: s.bid,
      ask: s.ask,
      open: s.open,
      high: s.high,
      low: s.low,
      priorClose: s.priorClose,
      volume: s.volume,
      changeAbsolute: s.changeAbsolute,
      changePercent: s.changePercent,
      value: s.last,
      units: "price",
      marketSession: mapLegacySession(s.marketSession),
      providerName: "massive",
      providerTimestamp: s.providerTimestamp,
      retrievalTimestamp: s.retrievalTimestamp,
      delayStatus:
        s.latencyClass === "realtime" ? ("realtime" as const) : ("delayed" as const),
      currency: "USD",
      sourceQuality: "secondary",
      coverageNotes: s.coverageNotes,
    }));
  }

  async getTimeSeries(request: TimeSeriesRequest): Promise<NormalizedBar[]> {
    const batch = await this.fetchBars({
      symbol: request.symbol,
      interval: request.interval ?? "1d",
      start: request.range?.start,
      end: request.range?.end,
      limit: request.limit,
      surface: "dashboard_display",
    });
    return batch.bars.map((b) => ({
      instrumentId: b.instrumentId,
      ticker: b.ticker,
      interval: b.interval,
      open: b.open,
      high: b.high,
      low: b.low,
      close: b.close,
      volume: b.volume,
      barStart: b.barStart,
      barEnd: b.barEnd,
      value: b.close,
      units: "price",
      marketSession: b.marketSession
        ? mapLegacySession(b.marketSession)
        : "unknown",
      providerName: "massive",
      providerTimestamp: b.providerTimestamp,
      retrievalTimestamp: b.retrievalTimestamp,
      delayStatus:
        b.latencyClass === "realtime" ? ("realtime" as const) : ("delayed" as const),
      currency: "USD",
      sourceQuality: "secondary",
      coverageNotes: b.coverageNotes,
    }));
  }

  async getMarketBreadth(
    _request: BreadthRequest,
  ): Promise<NormalizedBreadth | null> {
    void _request;
    return null;
  }

  async getTopMovers(request: LegacyMoversRequest): Promise<NormalizedMover[]> {
    const universe =
      request.universe === "configured" || request.universe === "US"
        ? DEFAULT_UNIVERSE
        : request.universe.split(",").map((s) => s.trim()).filter(Boolean);
    const batch = await this.fetchMovers({
      universe,
      direction: request.direction,
      limit: request.limit ?? 25,
      surface: "dashboard_display",
    });
    return batch.movers.map((m) => ({
      instrumentId: m.instrumentId,
      ticker: m.ticker,
      name: m.name,
      last: m.last,
      changeAbsolute: m.changeAbsolute,
      changePercent: m.changePercent,
      volume: m.volume,
      direction: m.direction,
      marketSession: mapLegacySession(m.marketSession),
      providerName: "massive",
      providerTimestamp: m.providerTimestamp,
      retrievalTimestamp: m.retrievalTimestamp,
      delayStatus:
        m.latencyClass === "realtime" ? ("realtime" as const) : ("delayed" as const),
      currency: "USD",
      sourceQuality: "secondary",
      coverageNotes: m.coverageNotes,
    }));
  }
}

const DEFAULT_UNIVERSE = [
  "SPY",
  "QQQ",
  "IWM",
  "DIA",
  "AAPL",
  "MSFT",
  "NVDA",
  "AMZN",
  "META",
  "GOOGL",
];
