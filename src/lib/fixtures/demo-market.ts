/**
 * DEMO market snapshot fixtures — clearly labeled, not live data.
 */
import type {
  NormalizedBreadth,
  NormalizedMover,
  NormalizedQuote,
  ReportEdition,
} from "@/lib/providers/types";

export const DEMO_MARKET_NOTE =
  "DEMO market data — synthetic fixtures for local development and tests only.";

const RETRIEVED = "2026-08-10T14:30:00.000Z";

function quote(
  ticker: string,
  last: number,
  priorClose: number,
  volume: number,
  session: NormalizedQuote["marketSession"] = "regular",
): NormalizedQuote {
  const changeAbsolute = last - priorClose;
  const changePercent = (changeAbsolute / priorClose) * 100;
  return {
    instrumentId: `demo:${ticker}`,
    ticker,
    last,
    open: priorClose * 1.001,
    high: Math.max(last, priorClose) * 1.008,
    low: Math.min(last, priorClose) * 0.992,
    priorClose,
    volume,
    changeAbsolute,
    changePercent,
    value: last,
    units: "price",
    marketSession: session,
    providerName: "demo-fixture",
    providerTimestamp: RETRIEVED,
    retrievalTimestamp: RETRIEVED,
    delayStatus: "delayed",
    currency: "USD",
    sourceQuality: "mock",
    coverageNotes: DEMO_MARKET_NOTE,
  };
}

function moverFromQuote(q: NormalizedQuote): NormalizedMover {
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
    providerName: "demo-fixture",
    providerTimestamp: RETRIEVED,
    retrievalTimestamp: RETRIEVED,
    delayStatus: "delayed",
    currency: "USD",
    sourceQuality: "mock",
    coverageNotes: DEMO_MARKET_NOTE,
  };
}

const BASE_QUOTES: NormalizedQuote[] = [
  quote("SPY", 562.4, 560.1, 48_200_000),
  quote("QQQ", 492.15, 488.9, 32_100_000),
  quote("IWM", 221.3, 219.8, 28_400_000),
  quote("DIA", 412.6, 411.2, 3_200_000),
  quote("TLT", 93.4, 94.1, 22_000_000),
  quote("UUP", 29.8, 29.65, 1_100_000),
  quote("GLD", 238.5, 236.9, 7_800_000),
  quote("USO", 76.2, 75.4, 4_500_000),
  quote("BTC-USD", 97_450, 96_200, 28_000),
  quote("NVDA", 131.4, 128.9, 210_000_000),
  quote("MSFT", 428.6, 426.1, 22_400_000),
  quote("AAPL", 227.3, 225.8, 48_000_000),
  quote("AMD", 162.7, 158.2, 55_000_000),
  quote("META", 572.1, 568.3, 12_800_000),
  quote("VIXY", 14.2, 14.8, 6_700_000),
  quote("XLK", 232.15, 230.4, 8_200_000),
  quote("XLF", 44.22, 44.05, 9_100_000),
  quote("XLE", 91.84, 90.9, 6_400_000),
  quote("XLV", 142.28, 142.1, 5_100_000),
  quote("SMH", 268.42, 264.1, 7_300_000),
  quote("HYG", 78.41, 78.25, 4_200_000),
  quote("LQD", 110.18, 110.05, 3_800_000),
  quote("AVGO", 171.22, 168.9, 18_400_000),
  quote("AMZN", 184.62, 183.1, 28_600_000),
  quote("GOOGL", 172.84, 171.4, 19_200_000),
  quote("VRT", 98.41, 96.1, 6_800_000),
  quote("CEG", 201.35, 198.7, 3_400_000),
];

export type DemoMarketSnapshot = {
  edition: ReportEdition;
  tradingDate: string;
  asOf: string;
  note: string;
  quotes: NormalizedQuote[];
  movers: NormalizedMover[];
  breadth: NormalizedBreadth;
  watchlistTickers: string[];
};

function breadthFor(edition: ReportEdition): NormalizedBreadth {
  const advancing =
    edition === "premarket" ? 620 : edition === "midday" ? 1410 : 1842;
  const declining =
    edition === "premarket" ? 480 : edition === "midday" ? 1120 : 1265;
  return {
    exchangeOrUniverse: "DEMO-US",
    advancing,
    declining,
    unchanged: 312,
    advVolume: 2.1e9,
    decVolume: 1.6e9,
    newHighs: edition === "close_postmarket" ? 88 : 41,
    newLows: edition === "close_postmarket" ? 41 : 22,
    providerName: "demo-fixture",
    providerTimestamp: RETRIEVED,
    retrievalTimestamp: RETRIEVED,
    delayStatus: "delayed",
    sourceQuality: "mock",
    coverageNotes: DEMO_MARKET_NOTE,
  };
}

function sessionFor(edition: ReportEdition): NormalizedQuote["marketSession"] {
  if (edition === "premarket") return "premarket";
  if (edition === "close_postmarket") return "afterhours";
  return "regular";
}

export function demoMarketSnapshot(
  edition: ReportEdition,
  tradingDate = "2026-08-10",
): DemoMarketSnapshot {
  const session = sessionFor(edition);
  const quotes = BASE_QUOTES.map((q) => ({ ...q, marketSession: session }));
  // Slight edition-aware tweak without inventing unrelated symbols
  if (edition === "premarket") {
    const nvda = quotes.find((q) => q.ticker === "NVDA");
    if (nvda && nvda.last != null && nvda.priorClose != null) {
      nvda.last = 130.2;
      nvda.changeAbsolute = nvda.last - nvda.priorClose;
      nvda.changePercent = (nvda.changeAbsolute / nvda.priorClose) * 100;
    }
  }
  if (edition === "midday") {
    const amd = quotes.find((q) => q.ticker === "AMD");
    if (amd && amd.last != null && amd.priorClose != null) {
      amd.last = 161.1;
      amd.changeAbsolute = amd.last - amd.priorClose;
      amd.changePercent = (amd.changeAbsolute / amd.priorClose) * 100;
    }
  }

  const movers = [...quotes]
    .map(moverFromQuote)
    .sort(
      (a, b) => Math.abs(b.changePercent ?? 0) - Math.abs(a.changePercent ?? 0),
    )
    .slice(0, 8);

  return {
    edition,
    tradingDate,
    asOf: RETRIEVED,
    note: DEMO_MARKET_NOTE,
    quotes,
    movers,
    breadth: breadthFor(edition),
    watchlistTickers: ["SPY", "QQQ", "NVDA", "AAPL", "MSFT", "TLT", "SMH", "VRT"],
  };
}

export const DEMO_MARKET_BY_EDITION: Record<ReportEdition, DemoMarketSnapshot> =
  {
    premarket: demoMarketSnapshot("premarket"),
    midday: demoMarketSnapshot("midday"),
    close_postmarket: demoMarketSnapshot("close_postmarket"),
  };
