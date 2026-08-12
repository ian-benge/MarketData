import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EntitlementError } from "@/lib/market-data/schemas";
import { MassiveMarketDataProvider } from "@/lib/providers/massive/market-data";

const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), "fixtures");

function loadFixture(name: string): unknown {
  return JSON.parse(readFileSync(join(fixtureDir, name), "utf8"));
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("MassiveMarketDataProvider", () => {
  it("fromEnv returns null without key", () => {
    expect(
      MassiveMarketDataProvider.fromEnv({
        MASSIVE_API_KEY: undefined,
        MASSIVE_API_BASE_URL: "https://api.massive.com",
        MARKET_DATA_LICENSE_SCOPE: "single_user_development",
        MARKET_DATA_LICENSE_ACKNOWLEDGED: false,
      } as never),
    ).toBeNull();
  });

  it("fetches snapshots with mocked fetch", async () => {
    const snapshots = loadFixture("snapshots.json");
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      expect(url).toContain("/v2/snapshot/locale/us/markets/stocks/tickers");
      expect(url).toContain("apiKey=test-key");
      return new Response(JSON.stringify(snapshots), { status: 200 });
    });
    const provider = new MassiveMarketDataProvider({
      apiKey: "test-key",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const batch = await provider.fetchSnapshots({
      symbols: ["AAPL"],
      surface: "dashboard_display",
    });
    expect(batch.snapshots).toHaveLength(1);
    expect(batch.providerName).toBe("massive");
  });

  it("maps entitlement errors for 401/403", async () => {
    const fetch401 = vi.fn(async () => new Response("nope", { status: 401 }));
    const p401 = new MassiveMarketDataProvider({
      apiKey: "k",
      fetchImpl: fetch401 as unknown as typeof fetch,
    });
    await expect(
      p401.fetchSnapshots({ symbols: ["AAPL"], surface: "dashboard_display" }),
    ).rejects.toMatchObject({ code: "http_401" } satisfies Partial<EntitlementError>);

    const fetch403 = vi.fn(
      async () =>
        new Response(JSON.stringify({ message: "plan upgrade required" }), {
          status: 403,
        }),
    );
    const p403 = new MassiveMarketDataProvider({
      apiKey: "k",
      fetchImpl: fetch403 as unknown as typeof fetch,
    });
    await expect(
      p403.fetchSnapshots({ symbols: ["AAPL"], surface: "dashboard_display" }),
    ).rejects.toMatchObject({ code: "plan_limit" });
  });

  it("loads bars, status, reference, dividends via fixtures", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/v2/aggs/")) {
        return new Response(JSON.stringify(loadFixture("aggs.json")), {
          status: 200,
        });
      }
      if (url.includes("/v1/marketstatus/now")) {
        return new Response(JSON.stringify(loadFixture("market-status.json")), {
          status: 200,
        });
      }
      if (url.includes("/v3/reference/tickers/AAPL")) {
        return new Response(JSON.stringify(loadFixture("ticker-details.json")), {
          status: 200,
        });
      }
      if (url.includes("/stocks/v1/dividends")) {
        return new Response(JSON.stringify(loadFixture("dividends.json")), {
          status: 200,
        });
      }
      if (url.includes("/stocks/v1/splits")) {
        return new Response(JSON.stringify({ status: "OK", results: [] }), {
          status: 200,
        });
      }
      return new Response("missing", { status: 404 });
    });

    const provider = new MassiveMarketDataProvider({
      apiKey: "k",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const bars = await provider.fetchBars({
      symbol: "AAPL",
      interval: "1m",
      surface: "dashboard_display",
    });
    expect(bars.bars).toHaveLength(2);

    const status = await provider.fetchMarketStatus(new Date());
    expect(status.session).toBe("afterhours");

    const instruments = await provider.resolveInstruments({
      tickers: ["AAPL"],
      surface: "server_calculations",
    });
    expect(instruments.instruments[0]!.ticker).toBe("AAPL");

    const actions = await provider.getCorporateActions({
      ticker: "AAPL",
      types: ["dividend", "split"],
      surface: "server_calculations",
    });
    expect(actions.actions.some((a) => a.actionType === "dividend")).toBe(true);
  });
});
