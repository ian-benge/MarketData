import { z } from "zod";
import type { MarketDataProvider } from "@/lib/providers/interfaces";
import type {
  BreadthRequest,
  MoversRequest,
  NormalizedBar,
  NormalizedBreadth,
  NormalizedMover,
  NormalizedQuote,
  TimeSeriesRequest,
} from "@/lib/providers/types";
import { NormalizedQuoteSchema } from "@/lib/providers/types";

const FinnhubQuoteRawSchema = z.object({
  c: z.number().nullable().optional(),
  d: z.number().nullable().optional(),
  dp: z.number().nullable().optional(),
  h: z.number().nullable().optional(),
  l: z.number().nullable().optional(),
  o: z.number().nullable().optional(),
  pc: z.number().nullable().optional(),
  t: z.number().nullable().optional(),
});

const FinnhubCandleRawSchema = z.object({
  s: z.string(),
  t: z.array(z.number()).optional(),
  o: z.array(z.number()).optional(),
  h: z.array(z.number()).optional(),
  l: z.array(z.number()).optional(),
  c: z.array(z.number()).optional(),
  v: z.array(z.number()).optional(),
});

const COVERAGE =
  "Finnhub free-tier quotes — typically delayed; not a substitute for a paid realtime feed.";

function isoNow(): string {
  return new Date().toISOString();
}

function providerTs(unixSec: number | null | undefined): string {
  if (unixSec == null || !Number.isFinite(unixSec) || unixSec <= 0) {
    return isoNow();
  }
  return new Date(unixSec * 1000).toISOString();
}

export function normalizeFinnhubQuote(
  ticker: string,
  raw: unknown,
  retrievalTimestamp = isoNow(),
): NormalizedQuote {
  const q = FinnhubQuoteRawSchema.parse(raw);
  const last = q.c ?? null;
  const priorClose = q.pc ?? null;
  const changeAbsolute =
    q.d ??
    (last != null && priorClose != null ? last - priorClose : null);
  const changePercent =
    q.dp ??
    (changeAbsolute != null && priorClose != null && priorClose !== 0
      ? (changeAbsolute / priorClose) * 100
      : null);

  const quote: NormalizedQuote = {
    instrumentId: `finnhub:${ticker.toUpperCase()}`,
    ticker: ticker.toUpperCase(),
    last,
    open: q.o ?? null,
    high: q.h ?? null,
    low: q.l ?? null,
    priorClose,
    volume: null,
    changeAbsolute,
    changePercent,
    value: last,
    units: "price",
    marketSession: "unknown",
    providerName: "finnhub",
    providerTimestamp: providerTs(q.t),
    retrievalTimestamp,
    delayStatus: "delayed",
    currency: "USD",
    sourceQuality: "secondary",
    coverageNotes: COVERAGE,
  };
  return NormalizedQuoteSchema.parse(quote);
}

const RESOLUTION_MAP: Record<TimeSeriesRequest["interval"], string> = {
  "1m": "1",
  "5m": "5",
  "15m": "15",
  "1h": "60",
  "1d": "D",
};

export type FinnhubMarketDataOptions = {
  apiKey: string;
  fetchImpl?: typeof fetch;
  baseUrl?: string;
};

export class FinnhubMarketDataProvider implements MarketDataProvider {
  private readonly apiKey: string;
  private readonly fetchImpl: typeof fetch;
  private readonly baseUrl: string;

  constructor(options: FinnhubMarketDataOptions) {
    if (!options.apiKey) {
      throw new Error("FinnhubMarketDataProvider requires apiKey");
    }
    this.apiKey = options.apiKey;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.baseUrl = options.baseUrl ?? "https://finnhub.io/api/v1";
  }

  private async getJson(path: string, params: Record<string, string>): Promise<unknown> {
    const url = new URL(`${this.baseUrl}${path}`);
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
    url.searchParams.set("token", this.apiKey);
    const res = await this.fetchImpl(url.toString(), {
      headers: { accept: "application/json" },
    });
    if (!res.ok) {
      throw new Error(`Finnhub ${path} failed: HTTP ${res.status}`);
    }
    return res.json();
  }

  async getQuotes(symbols: string[]): Promise<NormalizedQuote[]> {
    const retrieval = isoNow();
    const out: NormalizedQuote[] = [];
    for (const symbol of symbols) {
      const raw = await this.getJson("/quote", { symbol: symbol.toUpperCase() });
      out.push(normalizeFinnhubQuote(symbol, raw, retrieval));
    }
    return out;
  }

  async getTimeSeries(request: TimeSeriesRequest): Promise<NormalizedBar[]> {
    const retrieval = isoNow();
    const resolution = RESOLUTION_MAP[request.interval ?? "1d"];
    const to = Math.floor(Date.now() / 1000);
    const from =
      request.range?.start != null
        ? Math.floor(new Date(request.range.start).getTime() / 1000)
        : to - 86_400 * (request.limit ?? 30);
    const raw = await this.getJson("/stock/candle", {
      symbol: request.symbol.toUpperCase(),
      resolution,
      from: String(from),
      to: String(to),
    });
    const candle = FinnhubCandleRawSchema.parse(raw);
    if (candle.s !== "ok" || !candle.t?.length) {
      return [];
    }
    const ticker = request.symbol.toUpperCase();
    const bars: NormalizedBar[] = [];
    for (let i = 0; i < candle.t.length; i += 1) {
      const close = candle.c?.[i] ?? null;
      bars.push({
        instrumentId: `finnhub:${ticker}`,
        ticker,
        interval: request.interval ?? "1d",
        open: candle.o?.[i] ?? null,
        high: candle.h?.[i] ?? null,
        low: candle.l?.[i] ?? null,
        close,
        volume: candle.v?.[i] ?? null,
        barStart: new Date(candle.t[i]! * 1000).toISOString(),
        value: close,
        units: "price",
        marketSession: "unknown",
        providerName: "finnhub",
        providerTimestamp: providerTs(candle.t[i]),
        retrievalTimestamp: retrieval,
        delayStatus: "delayed",
        currency: "USD",
        sourceQuality: "secondary",
        coverageNotes: COVERAGE,
      });
    }
    const limit = request.limit;
    return limit != null ? bars.slice(-limit) : bars;
  }

  async getMarketBreadth(
    _request: BreadthRequest,
  ): Promise<NormalizedBreadth | null> {
    void _request;
    // Free Finnhub does not expose a reliable breadth endpoint — leave null.
    return null;
  }

  async getTopMovers(request: MoversRequest): Promise<NormalizedMover[]> {
    const retrieval = isoNow();
    // Free tier: derive movers from quote fan-out on a default US mega-cap set
    // when universe is "configured" / generic.
    const universe =
      request.universe === "configured" || request.universe === "US"
        ? DEFAULT_MOVER_UNIVERSE
        : request.universe.split(",").map((s) => s.trim()).filter(Boolean);

    const quotes = await this.getQuotes(universe);
    let movers: NormalizedMover[] = quotes.map((q) => {
      const changePercent = q.changePercent ?? 0;
      return {
        instrumentId: q.instrumentId,
        ticker: q.ticker,
        name: q.ticker,
        last: q.last,
        changeAbsolute: q.changeAbsolute ?? null,
        changePercent,
        volume: q.volume,
        direction: changePercent >= 0 ? ("up" as const) : ("down" as const),
        marketSession: q.marketSession,
        providerName: "finnhub",
        providerTimestamp: q.providerTimestamp,
        retrievalTimestamp: retrieval,
        delayStatus: "delayed",
        currency: "USD",
        sourceQuality: "secondary",
        coverageNotes: COVERAGE,
      };
    });

    if (request.direction === "up") {
      movers = movers.filter((m) => m.direction === "up");
    } else if (request.direction === "down") {
      movers = movers.filter((m) => m.direction === "down");
    }

    movers.sort(
      (a, b) => Math.abs(b.changePercent ?? 0) - Math.abs(a.changePercent ?? 0),
    );
    return movers.slice(0, request.limit ?? 25);
  }
}

const DEFAULT_MOVER_UNIVERSE = [
  "SPY",
  "QQQ",
  "IWM",
  "AAPL",
  "MSFT",
  "NVDA",
  "AMZN",
  "META",
  "GOOGL",
  "AMD",
  "AVGO",
  "TSLA",
  "JPM",
  "XLF",
  "XLK",
];
