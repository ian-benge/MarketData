import { describe, expect, it } from "vitest";
import { rankOverviewEarningsRisk } from "@/lib/market-data/earnings/overview-risk";
import type { EarningsCalendarEvent } from "@/lib/market-data/earnings/types";

function event(
  overrides: Partial<EarningsCalendarEvent> & Pick<EarningsCalendarEvent, "ticker" | "reportDate">,
): EarningsCalendarEvent {
  return {
    id: overrides.ticker,
    companyName: overrides.ticker,
    session: "amc",
    fiscalPeriod: "Q2 2026",
    epsEstimate: 1,
    epsActual: null,
    epsSurprise: null,
    revenueEstimate: null,
    revenueActual: null,
    lastPrice: 10,
    marketCap: 20_000_000_000,
    avgVolume: 2_000_000,
    impliedMove: null,
    coverageNotes: "",
    sources: ["finnhub"],
    providerTickers: { finnhub: overrides.ticker },
    alternativeReportDate: null,
    conflicted: false,
    confidence: "medium",
    quoteStatus: "succeeded",
    optionsStatus: "skipped_budget",
    ...overrides,
  };
}

describe("rankOverviewEarningsRisk", () => {
  it("promotes in-book and coverage names reporting today", () => {
    const ranked = rankOverviewEarningsRisk({
      today: "2026-08-16",
      coverageTickers: ["MSFT"],
      inBookTickers: ["NVDA"],
      events: [
        event({ ticker: "ZZZ", reportDate: "2026-08-16", marketCap: 12_000_000_000 }),
        event({ ticker: "MSFT", reportDate: "2026-08-17", marketCap: 3e12 }),
        event({ ticker: "NVDA", reportDate: "2026-08-16", impliedMove: {
          percent: 3.2,
          dollars: 4,
          strike: 120,
          callMid: 2,
          putMid: 2,
          straddle: 4,
          expiry: "2026-08-21",
          spot: 130,
          source: "yahoo_options",
        } }),
      ],
    });
    expect(ranked[0]?.ticker).toBe("NVDA");
    expect(ranked.map((row) => row.ticker)).toContain("MSFT");
  });

  it("keeps a later high implied-move name even outside tomorrow", () => {
    const ranked = rankOverviewEarningsRisk({
      today: "2026-08-16",
      events: [
        event({
          ticker: "TSLA",
          reportDate: "2026-08-20",
          impliedMove: {
            percent: 8.4,
            dollars: 20,
            strike: 240,
            callMid: 10,
            putMid: 10,
            straddle: 20,
            expiry: "2026-08-21",
            spot: 240,
            source: "yahoo_options",
          },
        }),
      ],
    });
    expect(ranked[0]?.ticker).toBe("TSLA");
  });
});
