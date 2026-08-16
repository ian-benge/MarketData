import type { Env } from "@/lib/env";
import type {
  BarProvider,
  MarketClockProvider,
  MarketDataCapabilities,
  MarketSnapshotProvider,
  MoverProvider,
  QuoteProvider,
} from "@/lib/market-data/capabilities";
import {
  assertSurfaceAllowed,
  licenseConfigFromEnv,
  type LicenseConfig,
} from "@/lib/market-data/licensing";
import type {
  BarsRequest,
  MoversRequest,
  NormalizedBarBatch,
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
import { inferUsEquitySession } from "@/lib/market-data/us-session";
import { AlpacaClient } from "@/lib/providers/alpaca/client";
import {
  ALPACA_TIMEFRAME,
  AlpacaBarsResponseSchema,
  AlpacaClockSchema,
  AlpacaSnapshotsResponseSchema,
  coverageNotesForFeed,
  feedCoverageFromAlpacaFeed,
  latencyClassForAlpacaFeed,
  mapLegacySession,
  normalizeAlpacaBar,
  normalizeAlpacaSnapshot,
  sessionFromAlpacaClock,
  snapshotToQuote,
  snapshotsToMovers,
  type AlpacaNormalizeContext,
} from "@/lib/providers/alpaca/normalize";

export type AlpacaMarketDataOptions = {
  keyId: string;
  secretKey: string;
  stockFeed?: "iex" | "sip";
  dataBaseUrl?: string;
  clockBaseUrl?: string;
  fetchImpl?: typeof fetch;
  license?: LicenseConfig;
  env?: Pick<
    Env,
    "MARKET_DATA_LICENSE_SCOPE" | "MARKET_DATA_LICENSE_ACKNOWLEDGED"
  >;
};

function isoNow(): string {
  return new Date().toISOString();
}

/**
 * Alpaca `/v2/stocks/*` rejects crypto/FX tickers (e.g. BTC-USD, BTC/USD).
 * One invalid symbol 400s the entire snapshots batch.
 */
export function alpacaStockSymbols(symbols: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of symbols) {
    const symbol = raw.trim().toUpperCase();
    if (!symbol || seen.has(symbol)) continue;
    if (/[-/=]/.test(symbol)) continue;
    if (!/^[A-Z][A-Z0-9.]{0,9}$/.test(symbol)) continue;
    seen.add(symbol);
    out.push(symbol);
  }
  return out;
}

function clockBaseForKey(keyId: string, override?: string): string | undefined {
  if (override) return override;
  // Paper keys are not entitled on the live trading host; clock is read-only.
  if (keyId.startsWith("PK")) return "https://paper-api.alpaca.markets";
  return undefined;
}

/**
 * Alpaca Market Data adapter.
 * Capability interfaces (request/batch) + legacy MarketDataProvider bridge.
 * Never claims IEX is SIP/full_market/NBBO. Clock is read-only GET /v2/clock only.
 */
export class AlpacaMarketDataProvider implements MarketDataProvider {
  readonly id = "alpaca";
  readonly capabilities: MarketDataCapabilities = {
    quotes: true,
    bars: true,
    snapshots: true,
    movers: true,
    reference: false,
    corporateActions: false,
    marketClock: true,
  };

  private readonly client: AlpacaClient;
  private readonly license: LicenseConfig;
  private cachedSession: ReturnType<typeof sessionFromAlpacaClock> | null =
    null;

  /** Capability-facing views for the router (avoids getQuotes overload clash). */
  readonly asQuoteProvider: QuoteProvider = {
    getQuotes: (request) => this.fetchQuotes(request),
  };
  readonly asBarProvider: BarProvider = {
    getBars: (request) => this.fetchBars(request),
  };
  readonly asSnapshotProvider: MarketSnapshotProvider = {
    getSnapshots: (request) => this.fetchSnapshots(request),
  };
  readonly asMoverProvider: MoverProvider = {
    getMovers: (request) => this.fetchMovers(request),
  };
  readonly asClockProvider: MarketClockProvider = {
    getMarketStatus: (at) => this.fetchMarketStatus(at),
  };

  constructor(options: AlpacaMarketDataOptions) {
    this.client = new AlpacaClient({
      keyId: options.keyId,
      secretKey: options.secretKey,
      stockFeed: options.stockFeed ?? "iex",
      dataBaseUrl: options.dataBaseUrl,
      clockBaseUrl: clockBaseForKey(options.keyId, options.clockBaseUrl),
      fetchImpl: options.fetchImpl,
    });
    this.license =
      options.license ??
      licenseConfigFromEnv(
        options.env ?? {
          MARKET_DATA_LICENSE_SCOPE: "single_user_development",
          MARKET_DATA_LICENSE_ACKNOWLEDGED: false,
        },
        "alpaca",
      );
  }

  static fromEnv(
    env: Env,
    fetchImpl?: typeof fetch,
  ): AlpacaMarketDataProvider | null {
    if (!env.ALPACA_DATA_KEY_ID || !env.ALPACA_DATA_SECRET_KEY) return null;
    return new AlpacaMarketDataProvider({
      keyId: env.ALPACA_DATA_KEY_ID,
      secretKey: env.ALPACA_DATA_SECRET_KEY,
      stockFeed: env.ALPACA_STOCK_FEED,
      dataBaseUrl: env.ALPACA_DATA_BASE_URL,
      fetchImpl,
      env,
    });
  }

  private ctx(retrievalTimestamp = isoNow()): AlpacaNormalizeContext {
    return {
      feed: this.client.stockFeed,
      licenseScopeId: this.license.licenseScopeId,
      permittedSurfaces: this.license.permittedSurfaces,
      retrievalTimestamp,
      // Clock is only cached after fetchMarketStatus. Snapshots must not
      // default every quote to "closed" or Market Pulse drops the tape.
      marketSession: this.cachedSession ?? inferUsEquitySession(),
    };
  }

  private batchMeta(retrievalTimestamp: string) {
    return {
      providerName: "alpaca" as const,
      retrievalTimestamp,
      feedCoverage: feedCoverageFromAlpacaFeed(this.client.stockFeed),
      latencyClass: latencyClassForAlpacaFeed(this.client.stockFeed),
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
    const symbols = alpacaStockSymbols(req.symbols);
    if (symbols.length === 0) {
      return { ...this.batchMeta(retrievalTimestamp), snapshots: [] };
    }
    const raw = await this.client.getDataJson("/v2/stocks/snapshots", {
      symbols: symbols.join(","),
      feed: this.client.stockFeed,
    });
    const parsed = AlpacaSnapshotsResponseSchema.parse(raw);
    const ctx = this.ctx(retrievalTimestamp);
    const snapshots = symbols
      .map((sym) => normalizeAlpacaSnapshot(sym, parsed[sym], ctx))
      .filter((s): s is NormalizedSnapshotObservation => s != null);

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
    const [symbol] = alpacaStockSymbols([req.symbol]);
    if (!symbol) {
      return { ...this.batchMeta(retrievalTimestamp), bars: [] };
    }
    const timeframe = ALPACA_TIMEFRAME[req.interval];
    const limit = req.limit ?? 100;
    const raw = await this.client.getDataJson(
      `/v2/stocks/${encodeURIComponent(symbol)}/bars`,
      {
        timeframe,
        start: req.start ?? defaultBarsStart(req.interval, limit),
        end: req.end,
        // Intraday windows include extended-hours prints; request a full page
        // then keep the most recent `limit` so weekends do not drop the latest session.
        limit: req.interval === "1d" ? String(limit) : "10000",
        feed: this.client.stockFeed,
        adjustment: req.adjusted === false ? "raw" : "split",
      },
    );
    const parsed = AlpacaBarsResponseSchema.parse(raw);
    const ctx = this.ctx(retrievalTimestamp);
    const bars = (parsed.bars ?? [])
      .map((b) => normalizeAlpacaBar(symbol, b, req.interval, ctx))
      .slice(-limit);
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
    ).map((m) => ({
      ...m,
      coverageNotes: `${coverageNotesForFeed(this.client.stockFeed)} Tracked-universe movers only.`,
    }));
    return { ...this.batchMeta(snaps.retrievalTimestamp), movers };
  }

  async fetchMarketStatus(_at: Date): Promise<NormalizedMarketStatus> {
    void _at;
    const retrievalTimestamp = isoNow();
    const raw = await this.client.getClockJson();
    const clock = AlpacaClockSchema.parse(raw);
    const session = sessionFromAlpacaClock(clock);
    this.cachedSession = session;
    return {
      ...this.batchMeta(retrievalTimestamp),
      providerTimestamp: clock.timestamp,
      valueKind: "normalized",
      coverageNotes: coverageNotesForFeed(this.client.stockFeed),
      asOf: clock.timestamp,
      session,
      isOpen: clock.is_open,
      nextOpen: clock.next_open,
      nextClose: clock.next_close,
    };
  }

  /* ---- Legacy MarketDataProvider ---- */

  async getQuotes(symbols: string[]): Promise<NormalizedQuote[]> {
    const batch = await this.fetchQuotes({
      symbols,
      surface: "dashboard_display",
    });
    return batch.quotes.map((s) => this.toLegacyQuote(s));
  }

  private toLegacyQuote(
    s: NormalizedSnapshotObservation | NormalizedQuoteBatch["quotes"][number],
  ): NormalizedQuote {
    return {
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
      providerName: "alpaca",
      providerTimestamp: s.providerTimestamp,
      retrievalTimestamp: s.retrievalTimestamp,
      delayStatus: "realtime",
      currency: "USD",
      sourceQuality: "secondary",
      coverageNotes: s.coverageNotes,
      officialClose:
        "dailyClose" in s && typeof s.dailyClose === "number"
          ? s.dailyClose
          : null,
    };
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
      providerName: "alpaca",
      providerTimestamp: b.providerTimestamp,
      retrievalTimestamp: b.retrievalTimestamp,
      delayStatus: "realtime",
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
      providerName: "alpaca",
      providerTimestamp: m.providerTimestamp,
      retrievalTimestamp: m.retrievalTimestamp,
      delayStatus: "realtime",
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
