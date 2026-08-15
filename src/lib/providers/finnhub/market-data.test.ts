import { afterEach, describe, expect, it, vi } from "vitest";
import {
  FinnhubMarketDataProvider,
  normalizeFinnhubQuote,
} from "@/lib/providers/finnhub/market-data";
import {
  FinnhubNewsProvider,
  normalizeFinnhubNewsItem,
} from "@/lib/providers/finnhub/news";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("normalizeFinnhubQuote", () => {
  it("maps Finnhub quote fields into NormalizedQuote", () => {
    const quote = normalizeFinnhubQuote(
      "aapl",
      {
        c: 227.3,
        d: 1.5,
        dp: 0.66,
        h: 228.1,
        l: 225.0,
        o: 225.8,
        pc: 225.8,
        t: 1_723_320_000,
      },
      "2026-08-10T12:00:00.000Z",
    );

    expect(quote.ticker).toBe("AAPL");
    expect(quote.instrumentId).toBe("finnhub:AAPL");
    expect(quote.last).toBe(227.3);
    expect(quote.priorClose).toBe(225.8);
    expect(quote.changeAbsolute).toBe(1.5);
    expect(quote.changePercent).toBe(0.66);
    expect(quote.providerName).toBe("finnhub");
    expect(quote.delayStatus).toBe("delayed");
    expect(quote.sourceQuality).toBe("secondary");
    expect(quote.providerTimestamp).toBe(
      new Date(1_723_320_000 * 1000).toISOString(),
    );
  });

  it("derives change from last and prior close when d/dp absent", () => {
    const quote = normalizeFinnhubQuote("MSFT", {
      c: 110,
      pc: 100,
      t: 0,
    });
    expect(quote.changeAbsolute).toBe(10);
    expect(quote.changePercent).toBe(10);
  });
});

describe("normalizeFinnhubNewsItem", () => {
  it("normalizes company news payloads", () => {
    const item = normalizeFinnhubNewsItem(
      {
        id: 42,
        headline: "Apple supplier update",
        summary: "Supply chain note",
        url: "https://example.com/story?utm_source=x",
        source: "Wire",
        datetime: 1_723_320_000,
        related: "AAPL,AVGO",
      },
      "2026-08-10T12:00:00.000Z",
    );

    expect(item).not.toBeNull();
    expect(item!.title).toBe("Apple supplier update");
    expect(item!.tickers).toEqual(["AAPL", "AVGO"]);
    expect(item!.providerName).toBe("finnhub");
    expect(item!.canonicalUrl).toContain("example.com/story");
    expect(item!.canonicalUrl).not.toContain("utm_source");
  });
});

describe("FinnhubMarketDataProvider", () => {
  it("fetches and normalizes quotes via mocked fetch", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      expect(url).toContain("/quote");
      expect(url).toContain("symbol=NVDA");
      expect(url).toContain("token=test-key");
      return new Response(
        JSON.stringify({
          c: 131.4,
          d: 2.5,
          dp: 1.94,
          h: 132,
          l: 129,
          o: 130,
          pc: 128.9,
          t: 1_723_320_000,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });

    const provider = new FinnhubMarketDataProvider({
      apiKey: "test-key",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const quotes = await provider.getQuotes(["nvda"]);
    expect(quotes).toHaveLength(1);
    expect(quotes[0]!.ticker).toBe("NVDA");
    expect(quotes[0]!.last).toBe(131.4);
    expect(fetchImpl).toHaveBeenCalledOnce();
  });
});

describe("FinnhubNewsProvider", () => {
  it("searches general news via mocked fetch", async () => {
    const fetchImpl = vi.fn(async () => {
      return new Response(
        JSON.stringify([
          {
            id: 1,
            headline: "Markets steady",
            summary: "Quiet tape",
            url: "https://example.com/markets",
            source: "Demo",
            datetime: 1_723_320_000,
            related: "SPY",
          },
        ]),
        { status: 200 },
      );
    });

    const provider = new FinnhubNewsProvider({
      apiKey: "test-key",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const items = await provider.search({ limit: 10 });
    expect(items).toHaveLength(1);
    expect(items[0]!.title).toBe("Markets steady");
    expect(fetchImpl).toHaveBeenCalled();
    const calledUrl = String(fetchImpl.mock.calls.at(0)?.at(0) ?? "");
    expect(calledUrl).toContain("/news");
  });

  it("tags company-news with the requested ticker even when related is empty", async () => {
    const fetchImpl = vi.fn(async () => {
      return new Response(
        JSON.stringify([
          {
            id: 9,
            headline: "Iris Energy announces additional power capacity",
            summary: "IR offtake.",
            url: "https://example.com/iren",
            source: "Company",
            datetime: 1_723_320_000,
            related: "",
          },
        ]),
        { status: 200 },
      );
    });
    const provider = new FinnhubNewsProvider({
      apiKey: "test-key",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const items = await provider.search({ tickers: ["IREN"], limit: 10 });
    expect(items).toHaveLength(1);
    expect(items[0]!.tickers).toContain("IREN");
    expect(items[0]!.url).toBe("https://example.com/iren");
    expect(String(fetchImpl.mock.calls.at(0)?.at(0) ?? "")).toContain("/company-news");
  });
});
