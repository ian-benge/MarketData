import { afterEach, describe, expect, it } from "vitest";
import type { Env } from "@/lib/env";
import {
  getEarningsHistorySnapshot,
  resetEarningsHistoryCache,
} from "@/lib/market-data/earnings/history-service";

function testEnv(overrides: Partial<Env> = {}): Env {
  return {
    NODE_ENV: "test",
    NEXT_PUBLIC_APP_URL: "http://localhost:3000",
    DEMO_MODE: false,
    ALLOW_MOCK_PROVIDERS: false,
    FINNHUB_API_KEY: "test-finnhub",
    ALPHA_VANTAGE_API_KEY: "test-av",
    ...overrides,
  } as Env;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

afterEach(() => {
  resetEarningsHistoryCache();
});

describe("getEarningsHistorySnapshot", () => {
  it("normalizes share-class symbols and merges Finnhub + AV with Yahoo reactions", async () => {
    const snapshot = await getEarningsHistorySnapshot(testEnv(), "brk-b", {
      useFixtures: false,
      companyName: "Berkshire Hathaway",
      finnhubFetch: async (input) => {
        const url = String(input);
        if (url.includes("/stock/earnings")) {
          return jsonResponse([
            { actual: 5.1, estimate: 4.9, period: "2026-03-31", quarter: 1, year: 2026, surprisePercent: 4.1 },
          ]);
        }
        return jsonResponse({
          earningsCalendar: [
            {
              symbol: "BRK.B",
              date: "2026-05-02",
              hour: "amc",
              quarter: 1,
              year: 2026,
              epsActual: 5.1,
              epsEstimate: 4.9,
              revenueActual: 89_000_000_000,
              revenueEstimate: 86_000_000_000,
            },
          ],
        });
      },
      alphaVantageFetch: async () =>
        jsonResponse({
          symbol: "BRK.B",
          quarterlyEarnings: [
            {
              fiscalDateEnding: "2026-03-31",
              reportedDate: "2026-05-02",
              reportedEPS: "5.10",
              estimatedEPS: "4.90",
              surprisePercentage: "4.08",
              reportTime: "post-market",
            },
          ],
        }),
      yahooCloses: async () => [
        { date: "2026-04-30", close: 100 },
        { date: "2026-05-01", close: 100 },
        { date: "2026-05-02", close: 101 },
        { date: "2026-05-05", close: 104 },
        { date: "2026-05-06", close: 105 },
        { date: "2026-05-07", close: 106 },
        { date: "2026-05-08", close: 107 },
        { date: "2026-05-09", close: 108 },
      ],
    });

    expect(snapshot.ticker).toBe("BRK.B");
    expect(snapshot.quarters).toHaveLength(1);
    expect(snapshot.quarters[0]).toMatchObject({
      fiscalPeriod: "Q1 2026",
      reportDate: "2026-05-02",
      session: "amc",
      epsActual: 5.1,
      revenueActual: 89_000_000_000,
      reactionNextPercent: 3,
    });
    expect(snapshot.sources.finnhub.ok).toBe(true);
    expect(snapshot.sources.alphaVantage.ok).toBe(true);
    expect(snapshot.sources.yahoo.ok).toBe(true);
  });

  it("keeps the last successful snapshot and marks it stale after an empty refresh", async () => {
    const env = testEnv();
    let stockLoads = 0;
    const depsFor = (now: Date) => ({
      now,
      useFixtures: false as const,
      finnhubFetch: async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/calendar/earnings")) {
          return jsonResponse({ earningsCalendar: [] });
        }
        stockLoads += 1;
        if (stockLoads === 1) {
          return jsonResponse([
            { actual: 1.5, estimate: 1.4, period: "2026-03-31", quarter: 1, year: 2026 },
          ]);
        }
        return jsonResponse([]);
      },
      alphaVantageFetch: async () => jsonResponse({ quarterlyEarnings: [] }),
      yahooCloses: async () => [],
    });

    const first = await getEarningsHistorySnapshot(
      env,
      "NVDA",
      depsFor(new Date("2026-08-11T12:00:00.000Z")),
    );
    expect(first.stale).toBe(false);
    expect(first.quarters).toHaveLength(1);

    const second = await getEarningsHistorySnapshot(
      env,
      "NVDA",
      depsFor(new Date("2026-08-12T01:00:00.000Z")),
    );
    expect(second.stale).toBe(true);
    expect(second.quarters).toHaveLength(1);
    expect(second.quarters[0]?.epsActual).toBe(1.5);
    expect(second.error).toMatch(/keeping last successful snapshot/i);
  });

  it("returns an invalid-ticker error without inventing quarters", async () => {
    const snapshot = await getEarningsHistorySnapshot(testEnv(), "   ", { useFixtures: false });
    expect(snapshot.quarters).toEqual([]);
    expect(snapshot.error).toBe("Invalid ticker.");
  });

  it("serves fixture history when requested", async () => {
    const snapshot = await getEarningsHistorySnapshot(testEnv(), "NVDA", {
      useFixtures: true,
      companyName: "NVIDIA",
    });
    expect(snapshot.usingFixtures).toBe(true);
    expect(snapshot.quarters.length).toBe(8);
    expect(snapshot.quarters.some((row) => row.epsActual == null)).toBe(true);
  });
});
