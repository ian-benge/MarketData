import { describe, expect, it } from "vitest";
import { buildAttentionItems } from "@/lib/market-data/overview-attention";
import type { MarketPulseDriver } from "@/lib/market-data/market-pulse";
import type { JoinedMover } from "@/lib/market-data/overview-movers";
import type { DashboardCoverageDigest } from "@/lib/watchlists/dashboard-digest";

function driver(overrides: Partial<MarketPulseDriver> = {}): MarketPulseDriver {
  return {
    id: "equity",
    label: "Equity",
    symbols: ["SPY"],
    quote: {
      instrumentId: "spy",
      ticker: "SPY",
      last: 560,
      priorClose: 558,
      changeAbsolute: 2,
      changePercent: 0.4,
      volume: 1,
      marketSession: "regular",
      providerName: "test",
      providerTimestamp: "2026-08-14T18:00:00.000Z",
      retrievalTimestamp: "2026-08-14T18:00:00.000Z",
      delayStatus: "delayed",
      currency: "USD",
      sourceQuality: "secondary",
      value: 560,
      units: "price",
    },
    rawValue: 0.4,
    normalizedValue: 0.4,
    weight: 0.2,
    contribution: 8,
    metric: "%",
    explanation: "test",
    providerName: "test",
    providerTimestamp: "2026-08-14T18:00:00.000Z",
    ...overrides,
  };
}

function mover(ticker: string, changePercent: number): JoinedMover {
  return {
    ticker,
    last: 100,
    changePercent,
    volume: 1,
    relativeVolume: null,
    direction: changePercent >= 0 ? "up" : "down",
    causalStatus: "unclear",
    attribution: null,
    confidence: null,
    evidenceNature: null,
    headlineTitle: null,
    headlineId: null,
    coverageNotes: null,
  };
}

const coverage: DashboardCoverageDigest = {
  lists: [],
  selectedListId: "wl-core",
  exceptions: [
    {
      ticker: "NVDA",
      flags: ["move", "rvol"],
      change1dPercent: 4.2,
      relativeVolume: 2.4,
    },
  ],
  deskSectors: [
    {
      id: "sec-chips",
      name: "Chips",
      kind: "sector",
      navGroup: "official_sectors",
      vsSpy1dPercent: 2.1,
      avg1dPercent: 2.5,
      breadth: 80,
      unusualCount: 1,
      leaders: ["NVDA"],
      benchmarkSymbol: "XLK",
      symbolCount: 2,
      quotedCount: 2,
    },
  ],
  coverageSymbolSet: ["NVDA"],
  inBookTickers: [],
};

describe("buildAttentionItems", () => {
  it("includes a coverage-unusual candidate and stays at most 5", () => {
    const items = buildAttentionItems({
      drivers: [driver()],
      movers: [mover("AMD", 3.1)],
      sectors: [{ key: "XLK", label: "Tech", changePercent: 1.2, available: true }],
      spyChange: 0.4,
      watchlist: [
        {
          ticker: "CEG",
          name: "Constellation",
          last: 270,
          change1dPercent: 1.1,
          changeFromOpenPercent: 0.4,
          change1wPercent: 2,
          relativeVolume: 2.2,
          marketCap: 1,
          volume: 1,
          missing: [],
        },
      ],
      calendar: [
        {
          id: "cpi",
          title: "CPI",
          category: "economic",
          scheduledAt: "2026-08-14T18:30:00.000Z",
          timeZone: "America/Chicago",
          importance: "high",
          country: "USD",
          providerName: "test",
          providerTimestamp: "2026-08-14T18:00:00.000Z",
          retrievalTimestamp: "2026-08-14T18:00:00.000Z",
          sourceQuality: "secondary",
        },
      ],
      asOf: "2026-08-14T17:00:00.000Z",
      coverage,
    });

    expect(items.length).toBeLessThanOrEqual(5);
    expect(items.some((item) => item.kind === "event")).toBe(true);
    expect(items.some((item) => item.kind === "mover" && item.ticker === "AMD")).toBe(
      true,
    );
    expect(
      items.some((item) => item.kind === "coverage" && item.ticker === "NVDA"),
    ).toBe(true);
    expect(items.filter((item) => item.ticker === "AMD").length).toBe(1);
  });

  it("does not promote Friday movers or weekend RVOL when the session is closed", () => {
    const items = buildAttentionItems({
      drivers: [driver()],
      movers: [mover("UMAC", 25.12)],
      sectors: [{ key: "XLK", label: "Tech", changePercent: 1.2, available: true }],
      spyChange: 0.4,
      watchlist: [
        {
          ticker: "IWM",
          name: "Russell 2000",
          last: 220,
          change1dPercent: 0.2,
          changeFromOpenPercent: 0,
          change1wPercent: 1,
          relativeVolume: 0.1,
          marketCap: 1,
          volume: 1,
          missing: [],
        },
      ],
      calendar: [],
      asOf: "2026-08-15T23:46:00.000Z",
      coverage,
      marketSession: "closed",
    });
    expect(items.some((item) => item.kind === "mover")).toBe(false);
    expect(items.some((item) => item.kind === "rvol")).toBe(false);
    expect(items.some((item) => item.kind === "coverage")).toBe(false);
    expect(items.some((item) => item.ticker === "UMAC")).toBe(false);
    expect(items.some((item) => item.ticker === "IWM")).toBe(false);
  });
});
