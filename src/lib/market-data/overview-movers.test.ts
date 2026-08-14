import { describe, expect, it } from "vitest";
import { joinMaterialMovers } from "@/lib/market-data/overview-movers";
import { buildAttentionItems } from "@/lib/market-data/overview-attention";
import type { NormalizedMover, NormalizedNewsItem } from "@/lib/providers/types";
import type { MarketPulseDriver } from "@/lib/market-data/market-pulse";

const NOW = "2026-08-10T14:30:00.000Z";

function mover(ticker: string, changePercent: number, last = 100): NormalizedMover {
  return {
    instrumentId: `mock:${ticker}`,
    ticker,
    name: ticker,
    last,
    changeAbsolute: last * (changePercent / 100),
    changePercent,
    volume: 80_000_000,
    direction: changePercent >= 0 ? "up" : "down",
    marketSession: "regular",
    providerName: "test",
    providerTimestamp: NOW,
    retrievalTimestamp: NOW,
    delayStatus: "delayed",
    currency: "USD",
    sourceQuality: "mock",
  };
}

const news: NormalizedNewsItem[] = [
  {
    id: "news-1",
    title: "Chipmakers advance as AI spending outlook firms",
    url: "https://example.com/chips",
    publishedAt: NOW,
    retrievedAt: NOW,
    tickers: ["NVDA", "AMD"],
    sourceClass: "wire",
    providerName: "mock-news",
    sourceQuality: "mock",
  },
];

describe("joinMaterialMovers", () => {
  it("joins headlines by ticker and marks reported vs unclear", () => {
    const joined = joinMaterialMovers(
      [mover("NVDA", 1.94, 131.4), mover("TLT", -0.74, 93.4)],
      news,
      "regular",
      "Tracked-universe movers only.",
    );
    expect(joined.map((item) => item.ticker)).toContain("NVDA");
    expect(joined.map((item) => item.ticker)).not.toContain("TLT");
    const nvda = joined.find((item) => item.ticker === "NVDA");
    expect(nvda?.causalStatus).toBe("reported");
    expect(nvda?.headlineTitle).toMatch(/Chipmakers/);
  });
});

describe("buildAttentionItems", () => {
  it("caps at five items and cites concrete prints", () => {
    const drivers: MarketPulseDriver[] = [
      {
        id: "semis",
        label: "Semiconductor leadership",
        symbols: ["SMH"],
        quote: {
          instrumentId: "mock:SMH",
          ticker: "SMH",
          last: 268,
          changePercent: 1.78,
          marketSession: "regular",
          providerName: "test",
          providerTimestamp: NOW,
          retrievalTimestamp: NOW,
          delayStatus: "delayed",
          sourceQuality: "mock",
          currency: "USD",
        },
        rawValue: 1.78,
        normalizedValue: 0.89,
        weight: 0.07,
        contribution: 3.1,
        metric: "SMH +1.78%",
        explanation: "",
        providerName: "test",
        providerTimestamp: NOW,
      },
    ];
    const items = buildAttentionItems({
      drivers,
      movers: joinMaterialMovers([mover("NVDA", 1.94, 131.4)], news, "regular"),
      sectors: [{ key: "XLK", label: "Technology", changePercent: 1, available: true }],
      spyChange: 0.41,
      watchlist: [
        {
          ticker: "NVDA",
          name: "NVIDIA",
          last: 131.4,
          change1dPercent: 1.94,
          changeFromOpenPercent: 1.2,
          change1wPercent: 3,
          relativeVolume: 2.4,
          marketCap: 3e12,
          volume: 210_000_000,
          missing: [],
        },
      ],
      calendar: [
        {
          id: "cal-1",
          title: "CPI (YoY)",
          category: "economic",
          country: "US",
          importance: "high",
          scheduledAt: "2026-08-12T12:30:00.000Z",
          timeZone: "America/Chicago",
          providerName: "mock-macro",
          providerTimestamp: NOW,
          retrievalTimestamp: NOW,
          sourceQuality: "mock",
        },
      ],
      asOf: NOW,
    });
    expect(items.length).toBeLessThanOrEqual(5);
    expect(items.some((item) => item.print.includes("SMH"))).toBe(true);
    expect(items.some((item) => item.print.includes("NVDA"))).toBe(true);
    expect(items.some((item) => item.print.includes("CPI"))).toBe(true);
  });
});
