import { describe, expect, it } from "vitest";
import { blendScannerPrint, mergeMinuteBars } from "@/lib/scanner/print";
import { featureInputFromSnapshot } from "@/lib/scanner/ingest";
import { readScannerClock } from "@/lib/scanner/session";
import type { YahooEquityQuote } from "@/lib/market-data/earnings/types";
import type { NormalizedSnapshotObservation } from "@/lib/market-data/schemas";

function yahoo(overrides: Partial<YahooEquityQuote> = {}): YahooEquityQuote {
  return {
    symbol: "ABCD",
    name: "Alpha",
    price: 8.4,
    marketCap: 100,
    avgVolume: 1_000_000,
    quoteType: "EQUITY",
    previousClose: 6.5,
    volume: 2_000_000,
    preMarketPrice: 7.8,
    preMarketChangePercent: 20,
    preMarketVolume: 4_000_000,
    marketState: "PRE",
    ...overrides,
  };
}

describe("blendScannerPrint", () => {
  it("uses Yahoo premarket last when IEX is still at prior close", () => {
    const blended = blendScannerPrint({
      session: "premarket",
      last: 6.5,
      high: 6.5,
      volume: 0,
      priorClose: 6.5,
      yahoo: yahoo(),
      primaryLatency: "realtime",
    });
    expect(blended.last).toBe(7.8);
    expect(blended.volume).toBe(4_000_000);
    expect(blended.usedYahooLast).toBe(true);
    expect(blended.latencyClass).toBe("delayed_15m");
    expect(blended.notes[0]).toMatch(/Premarket last from Yahoo/i);
  });

  it("keeps IEX last in premarket when IEX actually printed away from the close", () => {
    const blended = blendScannerPrint({
      session: "premarket",
      last: 7.2,
      high: 7.3,
      volume: 80_000,
      priorClose: 6.5,
      yahoo: yahoo(),
      primaryLatency: "realtime",
    });
    expect(blended.last).toBe(7.2);
    expect(blended.usedYahooLast).toBe(false);
    expect(blended.latencyClass).toBe("realtime");
  });

  it("uses Yahoo after-hours last when IEX is idle", () => {
    const blended = blendScannerPrint({
      session: "afterhours",
      last: 10,
      high: 10,
      volume: null,
      priorClose: 10,
      yahoo: yahoo({
        marketState: "POST",
        postMarketPrice: 10.4,
        preMarketPrice: null,
        price: 10.4,
      }),
      primaryLatency: "realtime",
    });
    expect(blended.last).toBe(10.4);
    expect(blended.usedYahooLast).toBe(true);
  });

  it("normalizes absent Yahoo volume to null", () => {
    const blended = blendScannerPrint({
      session: "regular",
      last: 10,
      high: 10.2,
      volume: null,
      priorClose: 10,
      yahoo: yahoo({
        volume: undefined,
        preMarketVolume: undefined,
        price: 10.1,
        previousClose: 10,
        marketState: "REGULAR",
        preMarketPrice: null,
      }),
      primaryLatency: "realtime",
    });
    expect(blended.volume).toBeNull();
  });

  it("prefers Alpaca 1m bars when merging Yahoo includePrePost extras", () => {
    const merged = mergeMinuteBars(
      [
        {
          start: "2026-08-17T12:00:00.000Z",
          open: 7.1,
          high: 7.2,
          low: 7.0,
          close: 7.15,
          volume: 10_000,
        },
      ],
      [
        {
          start: "2026-08-17T12:00:00.000Z",
          open: 7.0,
          high: 7.05,
          low: 6.9,
          close: 7.0,
          volume: 4_000,
        },
        {
          start: "2026-08-17T12:01:00.000Z",
          open: 7.15,
          high: 7.4,
          low: 7.1,
          close: 7.3,
          volume: 8_000,
        },
      ],
    );
    expect(merged).toHaveLength(2);
    expect(merged[0]?.close).toBe(7.15);
    expect(merged[0]?.volume).toBe(10_000);
    expect(merged[1]?.close).toBe(7.3);
  });
});

describe("featureInputFromSnapshot premarket overlay", () => {
  it("does not keep an idle IEX last during premarket when Yahoo has a pre print", () => {
    const clock = readScannerClock(new Date("2026-08-17T12:00:00.000Z"));
    expect(clock.session).toBe("premarket");
    const ts = clock.now.toISOString();
    const snapshot: NormalizedSnapshotObservation = {
      instrumentId: "alpaca:ABCD",
      ticker: "ABCD",
      last: 6.5,
      priorClose: 6.5,
      high: 6.5,
      volume: 0,
      marketSession: "premarket",
      providerName: "alpaca",
      providerTimestamp: ts,
      retrievalTimestamp: ts,
      feedCoverage: "iex",
      latencyClass: "realtime",
      licenseScopeId: "alpaca:single_user_development",
      permittedSurfaces: ["server_calculations"],
      valueKind: "normalized",
    };
    const input = featureInputFromSnapshot({
      snapshot,
      yahoo: yahoo(),
      clock,
      coverageNotes: "IEX print — not SIP/full-market.",
    });
    expect(input.last).toBe(7.8);
    expect(input.volume).toBe(4_000_000);
    expect(input.latencyClass).toBe("delayed_15m");
    expect(input.coverageNotes).toMatch(/Premarket last from Yahoo/i);
  });
});
