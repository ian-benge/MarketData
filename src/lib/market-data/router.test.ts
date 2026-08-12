import { describe, expect, it, vi } from "vitest";
import { EntitlementError } from "@/lib/market-data/schemas";
import { MarketDataRouter } from "@/lib/market-data/router";
import type { CapabilityKeyedProvider } from "@/lib/market-data/capabilities";
import type { Env } from "@/lib/env";

function makeEnv(overrides: Partial<Env> = {}): Env {
  return {
    NODE_ENV: "development",
    MARKET_DATA_LICENSE_SCOPE: "single_user_development",
    MARKET_DATA_LICENSE_ACKNOWLEDGED: false,
    MARKET_DATA_PRIMARY: "alpaca",
    MARKET_DATA_FALLBACK: "none",
    ...overrides,
  } as Env;
}

describe("MarketDataRouter", () => {
  it("rejects disallowed surfaces", async () => {
    const quotes = {
      getQuotes: vi.fn(),
    };
    const primary: CapabilityKeyedProvider = {
      id: "alpaca",
      capabilities: {
        quotes: true,
        bars: false,
        snapshots: false,
        movers: false,
        reference: false,
        corporateActions: false,
        marketClock: false,
      },
      quotes,
    };
    const router = new MarketDataRouter({
      env: makeEnv(),
      primary,
    });
    await expect(
      router.fetchQuotes({
        symbols: ["AAPL"],
        surface: "email_attachment",
      }),
    ).rejects.toBeInstanceOf(EntitlementError);
    expect(quotes.getQuotes).not.toHaveBeenCalled();
  });

  it("falls back while preserving fallback provenance", async () => {
    const primary: CapabilityKeyedProvider = {
      id: "alpaca",
      capabilities: {
        quotes: true,
        bars: false,
        snapshots: false,
        movers: false,
        reference: false,
        corporateActions: false,
        marketClock: false,
      },
      quotes: {
        getQuotes: async () => {
          throw new Error("primary down");
        },
      },
    };
    const fallback: CapabilityKeyedProvider = {
      id: "massive",
      capabilities: {
        quotes: true,
        bars: false,
        snapshots: false,
        movers: false,
        reference: false,
        corporateActions: false,
        marketClock: false,
      },
      quotes: {
        getQuotes: async () => ({
          providerName: "massive",
          retrievalTimestamp: "2026-08-10T20:00:00.000Z",
          feedCoverage: "fmv" as const,
          latencyClass: "realtime" as const,
          licenseScopeId: "massive:single_user_development",
          permittedSurfaces: ["dashboard_display" as const],
          quotes: [],
        }),
      },
    };
    const events: unknown[] = [];
    const router = new MarketDataRouter({
      env: makeEnv(),
      primary,
      fallback,
      onHealthEvent: (e) => events.push(e),
    });
    const batch = await router.fetchQuotes({
      symbols: ["AAPL"],
      surface: "dashboard_display",
    });
    expect(batch.providerName).toBe("massive");
    expect(batch.feedCoverage).toBe("fmv");
    expect(batch.feedCoverage).not.toBe("sip");
    expect(batch.usedFallback).toBe(true);
    expect(events).toHaveLength(1);
  });

  it("does not relabel IEX as SIP when primary fails", async () => {
    const primary: CapabilityKeyedProvider = {
      id: "alpaca-sip",
      capabilities: {
        quotes: true,
        bars: false,
        snapshots: false,
        movers: false,
        reference: false,
        corporateActions: false,
        marketClock: false,
      },
      quotes: {
        getQuotes: async () => {
          throw new EntitlementError("unauthorized_feed", "no sip");
        },
      },
    };
    const fallback: CapabilityKeyedProvider = {
      id: "alpaca-iex",
      capabilities: {
        quotes: true,
        bars: false,
        snapshots: false,
        movers: false,
        reference: false,
        corporateActions: false,
        marketClock: false,
      },
      quotes: {
        getQuotes: async () => ({
          providerName: "alpaca",
          retrievalTimestamp: "2026-08-10T20:00:00.000Z",
          feedCoverage: "iex" as const,
          latencyClass: "realtime" as const,
          licenseScopeId: "alpaca:single_user_development",
          permittedSurfaces: ["dashboard_display" as const],
          quotes: [],
        }),
      },
    };
    const router = new MarketDataRouter({
      env: makeEnv(),
      primary,
      fallback,
    });
    const batch = await router.fetchQuotes({
      symbols: ["AAPL"],
      surface: "dashboard_display",
    });
    expect(batch.feedCoverage).toBe("iex");
  });
});
