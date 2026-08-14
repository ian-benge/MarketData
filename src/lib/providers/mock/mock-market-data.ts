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
import { isUsRegularSession } from "@/lib/market-data/bars-window";
import {
  assertMockProvidersAllowed,
  MOCK_COVERAGE_NOTE,
  mockNowIso,
} from "./assert-mock";

type SeedQuote = {
  ticker: string;
  last: number;
  priorClose: number;
  volume: number;
  name?: string;
};

const SEED: SeedQuote[] = [
  { ticker: "SPY", last: 562.4, priorClose: 560.1, volume: 48_200_000 },
  { ticker: "QQQ", last: 492.15, priorClose: 488.9, volume: 32_100_000 },
  { ticker: "IWM", last: 221.3, priorClose: 219.8, volume: 28_400_000 },
  { ticker: "DIA", last: 412.6, priorClose: 411.2, volume: 3_200_000 },
  { ticker: "TLT", last: 93.4, priorClose: 94.1, volume: 22_000_000 },
  { ticker: "IEF", last: 95.2, priorClose: 95.5, volume: 6_100_000 },
  { ticker: "SHY", last: 82.1, priorClose: 82.05, volume: 2_400_000 },
  { ticker: "UUP", last: 29.8, priorClose: 29.65, volume: 1_100_000 },
  { ticker: "GLD", last: 238.5, priorClose: 236.9, volume: 7_800_000 },
  { ticker: "SLV", last: 28.4, priorClose: 28.1, volume: 14_200_000 },
  { ticker: "USO", last: 76.2, priorClose: 75.4, volume: 4_500_000 },
  { ticker: "UNG", last: 14.8, priorClose: 15.2, volume: 8_900_000 },
  { ticker: "BTC-USD", last: 97_450, priorClose: 96_200, volume: 28_000 },
  { ticker: "ETH-USD", last: 3_620, priorClose: 3_580, volume: 120_000 },
  { ticker: "NVDA", last: 131.4, priorClose: 128.9, volume: 210_000_000 },
  { ticker: "MSFT", last: 428.6, priorClose: 426.1, volume: 22_400_000 },
  { ticker: "AAPL", last: 227.3, priorClose: 225.8, volume: 48_000_000 },
  { ticker: "AMD", last: 162.7, priorClose: 158.2, volume: 55_000_000 },
  { ticker: "GOOGL", last: 178.9, priorClose: 177.4, volume: 18_200_000 },
  { ticker: "AMZN", last: 198.4, priorClose: 196.8, volume: 35_000_000 },
  { ticker: "META", last: 572.1, priorClose: 568.3, volume: 12_800_000 },
  { ticker: "AVGO", last: 248.5, priorClose: 244.2, volume: 19_500_000 },
  { ticker: "TSM", last: 186.2, priorClose: 183.5, volume: 11_200_000 },
  { ticker: "XLK", last: 232.4, priorClose: 230.1, volume: 5_400_000 },
  { ticker: "XLF", last: 45.8, priorClose: 45.5, volume: 32_000_000 },
  { ticker: "HYG", last: 79.4, priorClose: 78.9, volume: 18_400_000 },
  { ticker: "LQD", last: 110.1, priorClose: 109.8, volume: 9_100_000 },
  { ticker: "SMH", last: 268.2, priorClose: 263.5, volume: 7_200_000 },
  { ticker: "IBIT", last: 58.2, priorClose: 57.4, volume: 21_000_000 },
  { ticker: "VIXY", last: 14.2, priorClose: 14.8, volume: 6_700_000 },
];

function stepMinutes(interval: NonNullable<TimeSeriesRequest["interval"]>) {
  if (interval === "1h") return 60;
  if (interval === "15m") return 15;
  if (interval === "5m") return 5;
  return 1;
}

function mockBarStarts(
  interval: NonNullable<TimeSeriesRequest["interval"]>,
  limit: number,
): Date[] {
  const starts: Date[] = [];
  if (interval === "1d") {
    const cursor = new Date();
    cursor.setUTCHours(20, 0, 0, 0);
    while (starts.length < limit) {
      const weekday = cursor.getUTCDay();
      if (weekday !== 0 && weekday !== 6) {
        starts.push(new Date(cursor));
      }
      cursor.setUTCDate(cursor.getUTCDate() - 1);
    }
    return starts.reverse();
  }

  const step = stepMinutes(interval);
  const cursor = new Date();
  cursor.setUTCSeconds(0, 0);
  cursor.setUTCMilliseconds(0);
  cursor.setUTCMinutes(Math.floor(cursor.getUTCMinutes() / step) * step);
  while (starts.length < limit) {
    if (isUsRegularSession(cursor.toISOString())) {
      starts.push(new Date(cursor));
    }
    cursor.setUTCMinutes(cursor.getUTCMinutes() - step);
  }
  return starts.reverse();
}

function toQuote(seed: SeedQuote, now: string): NormalizedQuote {
  const changeAbsolute = seed.last - seed.priorClose;
  const changePercent = (changeAbsolute / seed.priorClose) * 100;
  return {
    instrumentId: `mock:${seed.ticker}`,
    ticker: seed.ticker,
    last: seed.last,
    open: seed.priorClose * 1.001,
    high: Math.max(seed.last, seed.priorClose) * 1.01,
    low: Math.min(seed.last, seed.priorClose) * 0.99,
    priorClose: seed.priorClose,
    volume: seed.volume,
    changeAbsolute,
    changePercent,
    value: seed.last,
    units: "price",
    marketSession: "regular",
    providerName: "mock-market",
    providerTimestamp: now,
    retrievalTimestamp: now,
    delayStatus: "delayed",
    currency: "USD",
    sourceQuality: "mock",
    coverageNotes: MOCK_COVERAGE_NOTE,
  };
}

export class MockMarketDataProvider implements MarketDataProvider {
  private readonly seeds: Map<string, SeedQuote>;

  constructor() {
    assertMockProvidersAllowed("MockMarketDataProvider");
    this.seeds = new Map(SEED.map((s) => [s.ticker.toUpperCase(), s]));
  }

  async getQuotes(symbols: string[]): Promise<NormalizedQuote[]> {
    const now = mockNowIso();
    return symbols.map((symbol) => {
      const key = symbol.toUpperCase();
      const seed = this.seeds.get(key) ?? {
        ticker: key,
        last: 100,
        priorClose: 99.5,
        volume: 1_000_000,
      };
      return toQuote(seed, now);
    });
  }

  async getTimeSeries(request: TimeSeriesRequest): Promise<NormalizedBar[]> {
    const now = mockNowIso();
    const key = request.symbol.toUpperCase();
    const seed = this.seeds.get(key) ?? {
      ticker: key,
      last: 100,
      priorClose: 99.5,
      volume: 1_000_000,
    };
    const interval = request.interval ?? "1d";
    const limit = request.limit ?? 30;
    const starts = mockBarStarts(interval, limit);
    const startPx =
      seed.last >= seed.priorClose ? seed.last * 0.94 : seed.last * 1.06;
    return starts.map((barStart, i) => {
      const t = starts.length <= 1 ? 1 : i / (starts.length - 1);
      const drifted = startPx + (seed.last - startPx) * t;
      const noise = 1 + 0.006 * Math.sin(i * 1.35) + 0.003 * ((i % 7) - 3);
      const open = drifted * (1 - 0.004 * ((i % 5) - 2));
      const barClose = i === starts.length - 1 ? seed.last : drifted * noise;
      const high = Math.max(open, barClose) * 1.008;
      const low = Math.min(open, barClose) * 0.992;
      return {
        instrumentId: `mock:${key}`,
        ticker: key,
        interval,
        open,
        high,
        low,
        close: barClose,
        volume: seed.volume * (0.8 + (i % 5) * 0.05),
        barStart: barStart.toISOString(),
        value: barClose,
        units: "price" as const,
        marketSession: "regular" as const,
        providerName: "mock-market",
        providerTimestamp: now,
        retrievalTimestamp: now,
        delayStatus: "delayed" as const,
        currency: "USD",
        sourceQuality: "mock" as const,
        coverageNotes: MOCK_COVERAGE_NOTE,
      };
    });
  }

  async getMarketBreadth(
    _request: BreadthRequest,
  ): Promise<NormalizedBreadth | null> {
    void _request;
    const now = mockNowIso();
    return {
      exchangeOrUniverse: "DEMO-US",
      advancing: 1842,
      declining: 1265,
      unchanged: 312,
      advVolume: 2.1e9,
      decVolume: 1.6e9,
      newHighs: 88,
      newLows: 41,
      providerName: "mock-market",
      providerTimestamp: now,
      retrievalTimestamp: now,
      delayStatus: "delayed",
      sourceQuality: "mock",
      coverageNotes: MOCK_COVERAGE_NOTE,
    };
  }

  async getTopMovers(request: MoversRequest): Promise<NormalizedMover[]> {
    const now = mockNowIso();
    const quotes = await this.getQuotes([...this.seeds.keys()]);
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
        direction: changePercent >= 0 ? "up" : "down",
        marketSession: q.marketSession,
        providerName: "mock-market",
        providerTimestamp: now,
        retrievalTimestamp: now,
        delayStatus: "delayed",
        currency: "USD",
        sourceQuality: "mock",
        coverageNotes: MOCK_COVERAGE_NOTE,
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
