import { describe, expect, it } from "vitest";
import { mergeCalendarEvents } from "@/lib/market-data/earnings/merge";
import type { CalendarSourceEvent } from "@/lib/market-data/earnings/types";

function event(
  overrides: Partial<CalendarSourceEvent> &
    Pick<CalendarSourceEvent, "provider" | "canonicalSymbol" | "reportDate">,
): CalendarSourceEvent {
  return {
    providerTicker: overrides.canonicalSymbol,
    companyName: null,
    session: "unknown",
    fiscalPeriod: "Q2 2026",
    epsEstimate: null,
    epsActual: null,
    revenueEstimate: null,
    revenueActual: null,
    fetchedAt: "2026-08-11T15:00:00.000Z",
    ...overrides,
  };
}

describe("mergeCalendarEvents", () => {
  it("keeps a Finnhub-only event", () => {
    const { events, stats } = mergeCalendarEvents(
      [event({ provider: "finnhub", canonicalSymbol: "NVDA", reportDate: "2026-08-12", session: "amc" })],
      [],
    );
    expect(events).toHaveLength(1);
    expect(events[0]?.sources).toEqual(["finnhub"]);
    expect(stats).toMatchObject({ unionCount: 1, finnhubOnly: 1, alphaVantageOnly: 0 });
  });

  it("keeps an Alpha Vantage-only event", () => {
    const { events, stats } = mergeCalendarEvents(
      [],
      [event({ provider: "alphaVantage", canonicalSymbol: "CAVA", reportDate: "2026-08-12" })],
    );
    expect(events).toHaveLength(1);
    expect(events[0]?.sources).toEqual(["alphaVantage"]);
    expect(stats.alphaVantageOnly).toBe(1);
  });

  it("merges matching symbol + fiscal period into one record", () => {
    const { events, stats } = mergeCalendarEvents(
      [
        event({
          provider: "finnhub",
          canonicalSymbol: "MSFT",
          reportDate: "2026-08-13",
          session: "amc",
          epsEstimate: 2.95,
        }),
      ],
      [
        event({
          provider: "alphaVantage",
          canonicalSymbol: "MSFT",
          reportDate: "2026-08-13",
          companyName: "Microsoft Corporation",
          epsEstimate: 2.9,
        }),
      ],
    );
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      sources: ["finnhub", "alphaVantage"],
      session: "amc",
      epsEstimate: 2.95,
      companyName: "Microsoft Corporation",
      conflicted: false,
      confidence: "high",
    });
    expect(stats.matchedByBoth).toBe(1);
  });

  it("preserves conflicting dates and flags the row", () => {
    const { events } = mergeCalendarEvents(
      [event({ provider: "finnhub", canonicalSymbol: "WMT", reportDate: "2026-08-14", session: "bmo" })],
      [event({ provider: "alphaVantage", canonicalSymbol: "WMT", reportDate: "2026-08-15" })],
    );
    expect(events).toHaveLength(1);
    expect(events[0]?.reportDate).toBe("2026-08-14");
    expect(events[0]?.alternativeReportDate).toBe("2026-08-15");
    expect(events[0]?.conflicted).toBe(true);
    expect(events[0]?.observations).toHaveLength(2);
    expect(events[0]?.confidence).toBe("low");
  });

  it("merges the same mega-cap print when dates are a few days apart", () => {
    const { events, stats } = mergeCalendarEvents(
      [
        event({
          provider: "finnhub",
          canonicalSymbol: "AAPL",
          reportDate: "2026-08-18",
          fiscalPeriod: "Q3 2026",
        }),
      ],
      [
        event({
          provider: "alphaVantage",
          canonicalSymbol: "AAPL",
          reportDate: "2026-08-23",
          fiscalPeriod: "Q2 2026",
        }),
      ],
    );
    expect(events).toHaveLength(1);
    expect(stats.matchedByBoth).toBe(1);
    expect(events[0]?.reportDate).toBe("2026-08-18");
  });

  it("does not collapse distinct quarters for the same symbol", () => {
    const { events } = mergeCalendarEvents(
      [event({ provider: "finnhub", canonicalSymbol: "AAPL", reportDate: "2026-08-12", fiscalPeriod: "Q3 2026" })],
      [event({ provider: "alphaVantage", canonicalSymbol: "AAPL", reportDate: "2026-11-01", fiscalPeriod: "Q4 2026" })],
    );
    expect(events).toHaveLength(2);
  });

  it("merges same-day prints even when fiscal-period labels disagree", () => {
    const { events, stats } = mergeCalendarEvents(
      [
        event({
          provider: "finnhub",
          canonicalSymbol: "SMCI",
          reportDate: "2026-08-11",
          session: "amc",
          fiscalPeriod: "Q4 2026",
          epsEstimate: 0.98,
          epsActual: 1.7,
          revenueEstimate: 11_800_000_000,
        }),
      ],
      [
        event({
          provider: "alphaVantage",
          canonicalSymbol: "SMCI",
          reportDate: "2026-08-11",
          fiscalPeriod: "Q2 2026",
          epsEstimate: 0.56,
          companyName: "SUPER MICRO COMPUTER INC",
        }),
      ],
    );
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      sources: ["finnhub", "alphaVantage"],
      reportDate: "2026-08-11",
      fiscalPeriod: "Q4 2026",
      epsEstimate: 0.98,
      epsActual: 1.7,
      companyName: "SUPER MICRO COMPUTER INC",
      conflicted: false,
    });
    expect(stats.matchedByBoth).toBe(1);
  });
});
