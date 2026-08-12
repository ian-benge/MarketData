import { describe, expect, it } from "vitest";
import {
  parseAlphaVantageEarningsHistory,
  parseFinnhubStockEarnings,
  parseFinnhubSymbolCalendar,
  parseYahooDailyCloses,
} from "@/lib/market-data/earnings/history-parse";
import { mergeHistoricalObservations } from "@/lib/market-data/earnings/history-merge";
import { attachPriceReactions } from "@/lib/market-data/earnings/history-reactions";

describe("historical earnings parsers", () => {
  it("parses Alpha Vantage quarterly EARNINGS including timing and surprise %", () => {
    const rows = parseAlphaVantageEarningsHistory({
      symbol: "IBM",
      quarterlyEarnings: [
        {
          fiscalDateEnding: "2026-06-30",
          reportedDate: "2026-07-22",
          reportedEPS: "2.93",
          estimatedEPS: "2.80",
          surprise: "0.13",
          surprisePercentage: "4.64",
          reportTime: "post-market",
        },
        {
          fiscalDateEnding: "2026-03-31",
          reportedDate: "2026-04-22",
          reportedEPS: "NONE",
          estimatedEPS: "1.81",
          surprisePercentage: "NONE",
          reportTime: "pre-market",
        },
      ],
    });
    expect(rows[0]).toMatchObject({
      provider: "alphaVantage",
      reportDate: "2026-07-22",
      fiscalPeriod: "Q2 2026",
      session: "amc",
      epsActual: 2.93,
      epsEstimate: 2.8,
      epsSurprisePercent: 4.64,
    });
    expect(rows[1]?.epsActual).toBeNull();
    expect(rows[1]?.session).toBe("bmo");
  });

  it("parses Finnhub stock/earnings and calendar rows without dropping partials", () => {
    const stock = parseFinnhubStockEarnings([
      { actual: 1.52, estimate: 1.42, period: "2026-03-31", quarter: 1, year: 2026, surprisePercent: 7.0 },
    ]);
    const calendar = parseFinnhubSymbolCalendar({
      earningsCalendar: [
        {
          symbol: "AAPL",
          date: "2026-05-01",
          hour: "amc",
          quarter: 2,
          year: 2026,
          epsActual: 1.4,
          epsEstimate: 1.35,
          revenueActual: 90_000_000_000,
          revenueEstimate: 88_000_000_000,
        },
      ],
    });
    expect(stock[0]?.fiscalPeriod).toBe("Q1 2026");
    expect(stock[0]?.reportDate).toBeNull();
    expect(calendar[0]).toMatchObject({
      session: "amc",
      revenueActual: 90_000_000_000,
    });
  });

  it("reads Yahoo daily closes and skips null bars", () => {
    const closes = parseYahooDailyCloses({
      chart: {
        result: [
          {
            timestamp: [1_700_000_000, 1_700_086_400],
            indicators: { quote: [{ close: [100, null] }] },
          },
        ],
      },
    });
    expect(closes).toHaveLength(1);
    expect(closes[0]?.close).toBe(100);
  });
});

describe("historical merge and reactions", () => {
  it("merges AV EPS with Finnhub revenue for the same quarter", () => {
    const merged = mergeHistoricalObservations([
      {
        provider: "alphaVantage",
        reportDate: "2026-05-28",
        fiscalPeriod: "Q1 2026",
        session: "amc",
        epsEstimate: 0.84,
        epsActual: 0.89,
        epsSurprisePercent: 6,
        revenueEstimate: null,
        revenueActual: null,
        revenueSurprisePercent: null,
      },
      {
        provider: "finnhub",
        reportDate: "2026-05-28",
        fiscalPeriod: "Q1 2026",
        session: "amc",
        epsEstimate: 0.83,
        epsActual: 0.89,
        epsSurprisePercent: 7.2,
        revenueEstimate: 39_100_000_000,
        revenueActual: 39_900_000_000,
        revenueSurprisePercent: 2,
      },
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({
      epsEstimate: 0.83,
      revenueActual: 39_900_000_000,
      sources: ["finnhub", "alphaVantage"],
    });
    expect(merged[0]?.missing).not.toContain("epsActual");
    expect(merged[0]?.missing).toEqual(
      expect.arrayContaining(["revenueGrowth", "reactionNext", "reactionFiveDay"]),
    );
  });

  it("keeps partial AV-only rows instead of inventing revenue", () => {
    const [row] = mergeHistoricalObservations([
      {
        provider: "alphaVantage",
        reportDate: "2026-07-22",
        fiscalPeriod: "Q2 2026",
        session: "amc",
        epsEstimate: 2.8,
        epsActual: 2.93,
        epsSurprisePercent: 4.6,
        revenueEstimate: null,
        revenueActual: null,
        revenueSurprisePercent: null,
      },
    ]);
    expect(row?.revenueActual).toBeNull();
    expect(row?.revenueEstimate).toBeNull();
    expect(row?.missing).toEqual(
      expect.arrayContaining(["revenueEstimate", "revenueActual", "revenueSurprisePercent"]),
    );
  });

  it("merges Finnhub stock/earnings with calendar by fiscal period", () => {
    const [row] = mergeHistoricalObservations([
      {
        provider: "finnhub",
        reportDate: null,
        fiscalPeriod: "Q1 2026",
        session: "unknown",
        epsEstimate: 0.84,
        epsActual: 0.89,
        epsSurprisePercent: 6,
        revenueEstimate: null,
        revenueActual: null,
        revenueSurprisePercent: null,
      },
      {
        provider: "finnhub",
        reportDate: "2026-05-28",
        fiscalPeriod: "Q1 2026",
        session: "amc",
        epsEstimate: 0.83,
        epsActual: 0.89,
        epsSurprisePercent: 7.2,
        revenueEstimate: 39_100_000_000,
        revenueActual: 39_900_000_000,
        revenueSurprisePercent: 2,
      },
    ]);
    expect(row).toMatchObject({
      reportDate: "2026-05-28",
      session: "amc",
      revenueActual: 39_900_000_000,
    });
  });

  it("computes BMO and AMC close-to-close reactions without inventing bars", () => {
    const bars = [
      { date: "2026-05-26", close: 100 },
      { date: "2026-05-27", close: 100 },
      { date: "2026-05-28", close: 104 },
      { date: "2026-05-29", close: 106 },
      { date: "2026-06-01", close: 107 },
      { date: "2026-06-02", close: 108 },
      { date: "2026-06-03", close: 110 },
      { date: "2026-06-04", close: 111 },
    ];
    const [amc] = attachPriceReactions(
      [
        {
          id: "a",
          fiscalPeriod: "Q1 2026",
          reportDate: "2026-05-27",
          session: "amc",
          epsEstimate: 1,
          epsActual: 1,
          epsSurprise: 0,
          epsSurprisePercent: 0,
          revenueEstimate: null,
          revenueActual: null,
          revenueSurprise: null,
          revenueSurprisePercent: null,
          revenueGrowthPercent: null,
          reactionNextPercent: null,
          reactionFiveDayPercent: null,
          sources: ["finnhub"],
          missing: ["reactionNext", "reactionFiveDay"],
        },
      ],
      bars,
    );
    expect(amc?.reactionNextPercent).toBe(4);
    expect(amc?.reactionFiveDayPercent).toBe(10);

    const [bmo] = attachPriceReactions(
      [
        {
          id: "b",
          fiscalPeriod: "Q1 2026",
          reportDate: "2026-05-28",
          session: "bmo",
          epsEstimate: 1,
          epsActual: 1,
          epsSurprise: 0,
          epsSurprisePercent: 0,
          revenueEstimate: null,
          revenueActual: null,
          revenueSurprise: null,
          revenueSurprisePercent: null,
          revenueGrowthPercent: null,
          reactionNextPercent: null,
          reactionFiveDayPercent: null,
          sources: ["finnhub"],
          missing: ["reactionNext", "reactionFiveDay"],
        },
      ],
      bars,
    );
    expect(bmo?.reactionNextPercent).toBe(4);
    expect(bmo?.reactionFiveDayPercent).toBe(10);
  });
});
