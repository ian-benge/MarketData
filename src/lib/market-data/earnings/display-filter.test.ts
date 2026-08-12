import { describe, expect, it } from "vitest";
import {
  applyEarningsDisplayFilters,
  findEarningsSearchMatches,
  pickBestEarningsSearchMatch,
} from "@/lib/market-data/earnings/display-filter";
import type { EarningsCalendarEvent } from "@/lib/market-data/earnings/types";

function event(
  overrides: Partial<EarningsCalendarEvent> & Pick<EarningsCalendarEvent, "ticker">,
): EarningsCalendarEvent {
  return {
    id: overrides.ticker,
    companyName: overrides.ticker,
    reportDate: "2026-08-12",
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

const week = {
  weekStart: "2026-08-10",
  weekEnd: "2026-08-14",
  session: "all" as const,
  query: "",
};

describe("earnings display size filters", () => {
  it("defaults to any market cap / ADV and keeps unknown size visible", () => {
    const events = [
      event({ ticker: "MSFT", marketCap: 3_700_000_000_000, avgVolume: 20_000_000 }),
      event({ ticker: "NEW", marketCap: null, avgVolume: null, lastPrice: null }),
      event({ ticker: "TINY", marketCap: 2_000_000_000, avgVolume: 5_000_000 }),
    ];
    const all = applyEarningsDisplayFilters(events, {
      ...week,
      marketCap: "any",
      avgVolume: "any",
    });
    expect(all.visible.map((item) => item.ticker)).toEqual(["MSFT", "NEW", "TINY"]);
    expect(all.hiddenByFilters).toBe(0);
  });

  it("filters by market-cap threshold without inventing zero for unknowns", () => {
    const events = [
      event({ ticker: "MSFT", marketCap: 3_700_000_000_000, avgVolume: 20_000_000 }),
      event({ ticker: "NEW", marketCap: null, avgVolume: 2_000_000 }),
      event({ ticker: "TINY", marketCap: 2_000_000_000, avgVolume: 5_000_000 }),
    ];
    const filtered = applyEarningsDisplayFilters(events, {
      ...week,
      marketCap: "10b",
      avgVolume: "any",
    });
    expect(filtered.visible.map((item) => item.ticker)).toEqual(["MSFT"]);
    expect(filtered.hiddenByMarketCap).toBe(2);
    expect(filtered.hiddenUnknownSize).toBe(1);
  });

  it("filters by average volume threshold independently", () => {
    const events = [
      event({ ticker: "MSFT", marketCap: 3_700_000_000_000, avgVolume: 20_000_000 }),
      event({ ticker: "MID", marketCap: 15_000_000_000, avgVolume: 400_000 }),
      event({ ticker: "NEW", marketCap: 20_000_000_000, avgVolume: null }),
    ];
    const filtered = applyEarningsDisplayFilters(events, {
      ...week,
      marketCap: "any",
      avgVolume: "1m",
    });
    expect(filtered.visible.map((item) => item.ticker)).toEqual(["MSFT"]);
    expect(filtered.hiddenByAvgVolume).toBe(2);
    expect(filtered.hiddenUnknownSize).toBe(1);
  });

  it("applies market-cap and ADV thresholds together", () => {
    const events = [
      event({ ticker: "MSFT", marketCap: 3_700_000_000_000, avgVolume: 20_000_000 }),
      event({ ticker: "CAP_OK", marketCap: 20_000_000_000, avgVolume: 200_000 }),
      event({ ticker: "VOL_OK", marketCap: 2_000_000_000, avgVolume: 8_000_000 }),
    ];
    const filtered = applyEarningsDisplayFilters(events, {
      ...week,
      marketCap: "10b",
      avgVolume: "1m",
    });
    expect(filtered.visible.map((item) => item.ticker)).toEqual(["MSFT"]);
    expect(filtered.hiddenByFilters).toBe(2);
  });
});

describe("earnings search across the calendar window", () => {
  it("finds a ticker outside the currently selected week", () => {
    const events = [
      event({ ticker: "AMD", reportDate: "2026-05-20", marketCap: 200_000_000_000, avgVolume: 40_000_000 }),
      event({ ticker: "MSFT", reportDate: "2026-08-12" }),
    ];
    const weekOnly = applyEarningsDisplayFilters(events, {
      ...week,
      query: "AMD",
      marketCap: "any",
      avgVolume: "any",
    });
    expect(weekOnly.visible).toEqual([]);

    const matches = findEarningsSearchMatches(events, {
      session: "all",
      query: "AMD",
      marketCap: "any",
      avgVolume: "any",
    });
    expect(matches.map((item) => item.ticker)).toEqual(["AMD"]);
    expect(
      pickBestEarningsSearchMatch(
        events,
        { session: "all", query: "AMD", marketCap: "any", avgVolume: "any" },
        "2026-08-11",
      )?.reportDate,
    ).toBe("2026-05-20");
  });

  it("prefers an exact ticker match over a company-name substring", () => {
    const events = [
      event({
        ticker: "TEAM",
        companyName: "Atlassian AMD Partner Co",
        reportDate: "2026-08-12",
      }),
      event({ ticker: "AMD", companyName: "Advanced Micro Devices", reportDate: "2026-08-18" }),
    ];
    expect(
      pickBestEarningsSearchMatch(
        events,
        { session: "all", query: "AMD", marketCap: "any", avgVolume: "any" },
        "2026-08-11",
      )?.ticker,
    ).toBe("AMD");
  });
});
