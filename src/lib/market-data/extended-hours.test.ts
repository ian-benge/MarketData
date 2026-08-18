import { describe, expect, it } from "vitest";
import type { YahooEquityQuote } from "@/lib/market-data/earnings/types";
import {
  looksUnmovedFromClose,
  mergeBarSeries,
  overlayExtendedSessionQuotes,
  withExtendedSessionPercents,
  yahooIntradayToNormalizedBars,
} from "@/lib/market-data/extended-hours";

function yahoo(overrides: Partial<YahooEquityQuote> = {}): YahooEquityQuote {
  return {
    symbol: "NVDA",
    name: "NVIDIA",
    price: 103.5,
    marketCap: 1,
    avgVolume: 1,
    quoteType: "EQUITY",
    previousClose: 100,
    marketState: "PRE",
    preMarketPrice: 103.5,
    preMarketChangePercent: 3.5,
    ...overrides,
  };
}

describe("extended-hours overlay", () => {
  it("replaces an idle IEX last with Yahoo premarket", () => {
    const [row] = overlayExtendedSessionQuotes(
      [{ ticker: "NVDA", last: 100, priorClose: 100, changePercent: 0 }],
      new Map([["NVDA", yahoo()]]),
      "premarket",
    );
    expect(row?.last).toBe(103.5);
    expect(row?.changePercent).toBe(3.5);
    expect(row?.preMarketChangePercent).toBe(3.5);
    expect(row?.coverageNotes).toMatch(/Premarket last from Yahoo/i);
  });

  it("keeps a live primary print and still stamps premarket percent", () => {
    const [row] = overlayExtendedSessionQuotes(
      [{ ticker: "NVDA", last: 102, priorClose: 100, changePercent: 2 }],
      new Map([["NVDA", yahoo()]]),
      "premarket",
    );
    expect(row?.last).toBe(102);
    expect(row?.preMarketChangePercent).toBe(3.5);
  });

  it("does not overlay during regular hours", () => {
    const [row] = overlayExtendedSessionQuotes(
      [{ ticker: "NVDA", last: 100, priorClose: 100, changePercent: 0 }],
      new Map([["NVDA", yahoo()]]),
      "regular",
    );
    expect(row?.last).toBe(100);
    expect(row?.preMarketChangePercent).toBeUndefined();
  });
});

describe("withExtendedSessionPercents", () => {
  it("uses last vs prior close as premarket percent", () => {
    const stamped = withExtendedSessionPercents(
      {
        last: 105,
        priorClose: 100,
        changePercent: 5,
        marketSession: "premarket",
      },
      "premarket",
    );
    expect(stamped.preMarketChangePercent).toBeCloseTo(5);
    expect(stamped.afterHoursChangePercent).toBeNull();
  });

  it("preserves this morning's premarket percent into regular hours", () => {
    const stamped = withExtendedSessionPercents(
      {
        last: 110,
        priorClose: 100,
        changePercent: 10,
        marketSession: "regular",
      },
      "regular",
      {
        last: 105,
        priorClose: 100,
        changePercent: 5,
        preMarketChangePercent: 3.2,
        marketSession: "premarket",
      },
    );
    expect(stamped.preMarketChangePercent).toBe(3.2);
  });
});

describe("looksUnmovedFromClose / mergeBarSeries", () => {
  it("treats a 5bp gap as unmoved", () => {
    expect(looksUnmovedFromClose(100.04, 100)).toBe(true);
    expect(looksUnmovedFromClose(101, 100)).toBe(false);
  });

  it("lets primary bars win on the same bucket and keeps extra premarket bars", () => {
    const merged = mergeBarSeries(
      [{ barStart: "2026-08-10T13:30:00.000Z", close: 101 }],
      [
        { barStart: "2026-08-10T12:00:00.000Z", close: 100.4 },
        { barStart: "2026-08-10T13:30:00.000Z", close: 99 },
      ],
      60_000,
    );
    expect(merged.map((bar) => bar.close)).toEqual([100.4, 101]);
  });

  it("keeps primary observation provenance and stamps Yahoo extras with delayed metadata", () => {
    const merged = mergeBarSeries(
      [
        {
          barStart: "2026-08-10T13:30:00.000Z",
          close: 101,
          providerName: "alpaca",
          feedCoverage: "iex" as const,
          latencyClass: "realtime" as const,
          licenseScopeId: "alpaca:single_user_development",
          permittedSurfaces: ["dashboard_display" as const],
          valueKind: "normalized" as const,
        },
      ],
      [
        {
          barStart: "2026-08-10T12:00:00.000Z",
          close: 100.4,
          providerName: "yahoo",
          feedCoverage: "delayed_15m" as const,
          latencyClass: "delayed_15m" as const,
          licenseScopeId: "yahoo:public-chart",
          permittedSurfaces: ["dashboard_display" as const],
          valueKind: "normalized" as const,
        },
        {
          barStart: "2026-08-10T13:30:00.000Z",
          close: 99,
          providerName: "yahoo",
          feedCoverage: "delayed_15m" as const,
          latencyClass: "delayed_15m" as const,
          licenseScopeId: "yahoo:public-chart",
          permittedSurfaces: ["dashboard_display" as const],
          valueKind: "normalized" as const,
        },
      ],
      60_000,
    );
    expect(merged).toHaveLength(2);
    expect(merged[0]?.providerName).toBe("yahoo");
    expect(merged[0]?.feedCoverage).toBe("delayed_15m");
    expect(merged[0]?.licenseScopeId).toBe("yahoo:public-chart");
    expect(merged[1]?.close).toBe(101);
    expect(merged[1]?.providerName).toBe("alpaca");
    expect(merged[1]?.feedCoverage).toBe("iex");
    expect(merged[1]?.latencyClass).toBe("realtime");
    expect(merged[1]?.licenseScopeId).toBe("alpaca:single_user_development");
  });

  it("converts Yahoo chart bars into observation records with delayed provenance", () => {
    const [bar] = yahooIntradayToNormalizedBars("nvda", "1m", [
      {
        barStart: "2026-08-10T12:00:00.000Z",
        open: 100,
        high: 101,
        low: 99.5,
        close: 100.4,
        volume: 1_000,
      },
    ]);
    expect(bar?.ticker).toBe("NVDA");
    expect(bar?.feedCoverage).toBe("delayed_15m");
    expect(bar?.latencyClass).toBe("delayed_15m");
    expect(bar?.licenseScopeId).toBe("yahoo:public-chart");
    expect(bar?.permittedSurfaces).toContain("dashboard_display");
    expect(bar?.valueKind).toBe("normalized");
    expect(bar?.sourceQuality).toBe("secondary");
    expect(bar?.providerName).toBe("yahoo");
  });
});
