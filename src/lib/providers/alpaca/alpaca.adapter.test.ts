import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EntitlementError } from "@/lib/market-data/schemas";
import {
  AlpacaMarketDataProvider,
  alpacaStockSymbols,
} from "@/lib/providers/alpaca/market-data";

const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), "fixtures");

function loadFixture(name: string): unknown {
  return JSON.parse(readFileSync(join(fixtureDir, name), "utf8"));
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("alpacaStockSymbols", () => {
  it("drops crypto tickers that 400 the stocks snapshots API", () => {
    expect(alpacaStockSymbols(["SPY", "BTC-USD", "ibit", "BTC/USD"])).toEqual([
      "SPY",
      "IBIT",
    ]);
  });
});

describe("AlpacaMarketDataProvider", () => {
  it("omits crypto symbols from /v2/stocks/snapshots", async () => {
    const snapshots = loadFixture("snapshots.json");
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      expect(url).toContain("symbols=AAPL");
      expect(url).not.toContain("BTC");
      return new Response(JSON.stringify(snapshots), { status: 200 });
    });
    const provider = new AlpacaMarketDataProvider({
      keyId: "k",
      secretKey: "s",
      stockFeed: "iex",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await provider.fetchSnapshots({
      symbols: ["AAPL", "BTC-USD"],
      surface: "dashboard_display",
    });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("fetches snapshots via mocked fetch with IEX feed param", async () => {
    const snapshots = loadFixture("snapshots.json");
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      expect(url).toContain("/v2/stocks/snapshots");
      expect(url).toContain("feed=iex");
      expect(url).toContain("symbols=AAPL");
      return new Response(JSON.stringify(snapshots), { status: 200 });
    });

    const provider = new AlpacaMarketDataProvider({
      keyId: "test-key",
      secretKey: "test-secret",
      stockFeed: "iex",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const batch = await provider.fetchSnapshots({
      symbols: ["aapl"],
      surface: "dashboard_display",
    });
    expect(batch.snapshots).toHaveLength(1);
    expect(batch.feedCoverage).toBe("iex");
    expect(batch.snapshots[0]!.last).toBe(227.35);
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("bridges legacy getQuotes", async () => {
    const snapshots = loadFixture("snapshots.json");
    const fetchImpl = vi.fn(async () => {
      return new Response(JSON.stringify(snapshots), { status: 200 });
    });
    const provider = new AlpacaMarketDataProvider({
      keyId: "k",
      secretKey: "s",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const quotes = await provider.getQuotes(["AAPL", "MSFT"]);
    expect(quotes).toHaveLength(2);
    expect(quotes[0]!.providerName).toBe("alpaca");
    expect(quotes[0]!.delayStatus).toBe("realtime");
  });

  it("throws EntitlementError on SIP 403", async () => {
    const fetchImpl = vi.fn(async () => {
      return new Response(JSON.stringify({ message: "sip subscription required" }), {
        status: 403,
      });
    });
    const provider = new AlpacaMarketDataProvider({
      keyId: "k",
      secretKey: "s",
      stockFeed: "sip",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await expect(
      provider.fetchSnapshots({
        symbols: ["AAPL"],
        surface: "dashboard_display",
      }),
    ).rejects.toBeInstanceOf(EntitlementError);
  });

  it("loads bars and clock fixtures", async () => {
    const bars = loadFixture("bars.json");
    const clock = loadFixture("clock.json");
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/bars")) {
        return new Response(JSON.stringify(bars), { status: 200 });
      }
      if (url.includes("/v2/clock")) {
        return new Response(JSON.stringify(clock), { status: 200 });
      }
      return new Response("not found", { status: 404 });
    });
    const provider = new AlpacaMarketDataProvider({
      keyId: "k",
      secretKey: "s",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const barBatch = await provider.fetchBars({
      symbol: "AAPL",
      interval: "1m",
      surface: "dashboard_display",
    });
    expect(barBatch.bars).toHaveLength(2);
    const barUrl = String(fetchImpl.mock.calls.find(([input]) => String(input).includes("/bars"))?.[0]);
    expect(barUrl).toContain("start=");
    const status = await provider.fetchMarketStatus(new Date());
    expect(status.isOpen).toBe(false);
    expect(status.session).toBe("afterhours");
  });

  it("universe movers only", async () => {
    const snapshots = loadFixture("snapshots.json");
    const fetchImpl = vi.fn(async () => {
      return new Response(JSON.stringify(snapshots), { status: 200 });
    });
    const provider = new AlpacaMarketDataProvider({
      keyId: "k",
      secretKey: "s",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const movers = await provider.fetchMovers({
      universe: ["AAPL", "MSFT"],
      direction: "both",
      limit: 10,
      surface: "dashboard_display",
    });
    expect(movers.movers.length).toBeGreaterThan(0);
    expect(movers.movers[0]!.coverageNotes).toMatch(/universe/i);
  });
});
