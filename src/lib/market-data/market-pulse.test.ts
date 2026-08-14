import { describe, expect, it } from "vitest";
import type { NormalizedQuote } from "@/lib/providers/types";
import { calculateMarketPulse, MARKET_PULSE_CONFIG, PULSE_INPUT_SYMBOLS } from "./market-pulse";

const NOW = "2026-08-11T15:00:00.000Z";

function quote(ticker: string, changePercent: number | null, options: Partial<NormalizedQuote> = {}): NormalizedQuote {
  return {
    instrumentId: `test:${ticker}`,
    ticker,
    last: 100,
    changePercent,
    marketSession: "regular",
    providerName: "test-feed",
    providerTimestamp: NOW,
    retrievalTimestamp: NOW,
    delayStatus: "realtime",
    sourceQuality: "primary",
    currency: "USD",
    ...options,
  };
}

function calculate(quotes: NormalizedQuote[], extra = {}) {
  return calculateMarketPulse({
    quotes,
    asOf: NOW,
    marketSession: "regular",
    latencyClass: "realtime",
    feedCoverage: "sip",
    now: new Date(NOW),
    ...extra,
  });
}

describe("calculateMarketPulse", () => {
  it("moves the score in the expected risk-on direction", () => {
    const result = calculate([
      quote("SPY", 1.5), quote("QQQ", 2), quote("VIXY", -5), quote("TLT", 1.5),
      quote("UUP", -1), quote("HYG", 1.25), quote("USO", -3), quote("SMH", 2),
    ]);
    expect(result.score).toBeGreaterThanOrEqual(MARKET_PULSE_CONFIG.regimes.constructiveMax);
    expect(result.regime).toBe("Risk-On");
    expect(result.drivers.find((driver) => driver.id === "volatility")?.contribution).toBeGreaterThan(0);
  });

  it("moves the score in the expected risk-off direction", () => {
    const result = calculate([
      quote("SPY", -1.5), quote("QQQ", -2), quote("VIXY", 5), quote("TLT", -1.5),
      quote("UUP", 1), quote("HYG", -1.25), quote("USO", 3), quote("SMH", -2),
    ]);
    expect(result.score).toBeLessThan(MARKET_PULSE_CONFIG.regimes.riskOffMax);
    expect(result.regime).toBe("Risk-Off");
  });

  it("withholds the score below minimum coverage and discloses missing data", () => {
    const result = calculate([quote("SPY", 1)]);
    expect(result.score).toBeNull();
    expect(result.regime).toBe("Insufficient Cross-Asset Data");
    expect(result.dataQualityLabel).toContain("partial cross-asset coverage");
  });

  it("classifies balanced signals as mixed", () => {
    const result = calculate([
      quote("SPY", 0.1), quote("QQQ", -0.1), quote("VIXY", 0), quote("TLT", 0.1), quote("UUP", 0),
    ]);
    expect(result.score).not.toBeNull();
    expect(result.regime).toBe("Mixed / Rotational");
  });

  it("excludes observations from a different session", () => {
    const result = calculate([
      quote("SPY", 1),
      quote("QQQ", 1, { marketSession: "premarket" }),
      quote("VIXY", -2),
      quote("TLT", 0.5),
    ]);
    expect(result.excludedSessionCount).toBe(1);
    expect(result.drivers.find((driver) => driver.id === "beta")?.rawValue).toBeNull();
  });

  it("keeps closed-tagged RTH snapshots when the desk session is regular", () => {
    const result = calculate([
      quote("SPY", 1, { marketSession: "closed" }),
      quote("QQQ", 1, { marketSession: "closed" }),
      quote("VIXY", -2, { marketSession: "closed" }),
      quote("TLT", 0.5, { marketSession: "closed" }),
    ]);
    expect(result.excludedSessionCount).toBe(0);
    expect(result.drivers.find((driver) => driver.id === "equity")?.rawValue).toBe(1);
    expect(result.score).not.toBeNull();
  });

  it("distinguishes fresh, aging, stale, delayed, and mock states", () => {
    expect(calculate([quote("SPY", 0), quote("QQQ", 0), quote("VIXY", 0)]).freshness).toBe("Fresh");
    expect(calculate([quote("SPY", 0)], { now: new Date("2026-08-11T15:01:00.000Z") }).freshness).toBe("Aging");
    expect(calculate([quote("SPY", 0)], { now: new Date("2026-08-11T15:04:00.000Z") }).freshness).toBe("Stale");
    expect(calculate([quote("SPY", 0)], { latencyClass: "delayed_15m" }).freshness).toBe("Delayed");
    const mock = calculate([quote("SPY", 0)], { latencyClass: "mock" });
    expect(mock.freshness).toBe("Delayed");
    expect(mock.dataQualityLabel).toContain("Mock data");
  });

  it("uses threshold boundaries deterministically", () => {
    const neutral = calculate([
      quote("SPY", 0), quote("QQQ", 0), quote("VIXY", 0), quote("TLT", 0), quote("UUP", 0),
    ]);
    expect(neutral.score).toBe(50);
    expect(neutral.regime).toBe("Mixed / Rotational");
  });

  it("uses the same frozen input symbols as pulse history", async () => {
    const { PULSE_HISTORY_SYMBOLS } = await import("./pulse-history");
    expect([...PULSE_INPUT_SYMBOLS]).toEqual([...PULSE_HISTORY_SYMBOLS]);
  });

  it("does not score the full tape as configured proxy breadth", () => {
    const result = calculate([
      quote("SPY", 1),
      quote("QQQ", 1),
      quote("VIXY", -2),
      quote("TLT", 0.5),
      quote("UUP", 0),
      quote("HYG", 0.4),
      quote("USO", 0.2),
      quote("SMH", 1),
      quote("NVDA", 8),
      quote("AMD", 7),
      quote("XLK", 3),
    ]);
    const breadth = result.drivers.find((driver) => driver.id === "breadth");
    expect(breadth?.symbols).not.toContain("NVDA");
    expect(breadth?.symbols).not.toContain("AMD");
    expect(result.comparableCount).toBe(8);
    expect([...(breadth?.symbols ?? [])].sort()).toEqual([...PULSE_INPUT_SYMBOLS].sort());
  });
});
