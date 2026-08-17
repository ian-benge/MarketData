import { describe, expect, it, vi } from "vitest";
import { toYahooSymbol } from "@/lib/market-data/earnings/symbols";
import {
  chunkList,
  diagnoseYahooSymbols,
  isRetryableYahooStatus,
  mapYahooChunks,
  retryDelayMs,
  YAHOO_QUOTE_CHUNK_SIZE,
} from "@/lib/market-data/earnings/yahoo-batch";

describe("yahoo batch helper", () => {
  it("chunks a large watchlist without dropping symbols", () => {
    const symbols = Array.from({ length: 83 }, (_, index) => `T${index + 1}`);
    const chunks = chunkList(symbols, YAHOO_QUOTE_CHUNK_SIZE);
    expect(chunks).toHaveLength(5);
    expect(chunks.flat()).toEqual(symbols);
    expect(chunks[0]).toHaveLength(20);
    expect(chunks.at(-1)).toHaveLength(3);
  });

  it("retries 429 then keeps sibling chunks", async () => {
    const attempts = new Map<string, number>();
    const { values, failures } = await mapYahooChunks({
      chunks: [
        ["AAPL", "MSFT"],
        ["NBIS", "LUNR"],
      ],
      concurrency: 2,
      sleep: async () => undefined,
      load: async (chunk) => {
        const key = chunk[0]!;
        const next = (attempts.get(key) ?? 0) + 1;
        attempts.set(key, next);
        if (key === "NBIS" && next === 1) {
          return {
            ok: false,
            status: 429,
            message: "rate limited",
            retryable: true,
          };
        }
        if (key === "AAPL") return { ok: true, value: "ok-aapl" };
        return { ok: true, value: "ok-nbis" };
      },
    });
    expect(values.sort()).toEqual(["ok-aapl", "ok-nbis"]);
    expect(failures).toEqual([]);
    expect(attempts.get("NBIS")).toBe(2);
  });

  it("isolates a terminal chunk failure so the rest of the batch survives", async () => {
    const { values, failures } = await mapYahooChunks({
      chunks: [["SPY"], ["ZZZZZ"]],
      sleep: async () => undefined,
      load: async (chunk) => {
        if (chunk.includes("ZZZZZ")) {
          return {
            ok: false,
            status: 400,
            message: "bad symbol batch",
            retryable: false,
          };
        }
        return { ok: true, value: ["SPY"] };
      },
    });
    expect(values).toEqual([["SPY"]]);
    expect(failures).toHaveLength(1);
    expect(failures[0]?.symbols).toEqual(["ZZZZZ"]);
  });

  it("splits oversized payloads instead of failing the whole chunk", async () => {
    const { values, failures } = await mapYahooChunks({
      chunks: [["AA", "BB"]],
      sleep: async () => undefined,
      load: async (chunk) => {
        if (chunk.length > 1) {
          return {
            ok: false,
            status: null,
            message: "Response exceeds size limit (2000001 > 2000000 bytes)",
            retryable: true,
            split: true,
          };
        }
        return { ok: true, value: chunk[0] };
      },
    });
    expect(failures).toEqual([]);
    expect(values.sort()).toEqual(["AA", "BB"]);
  });

  it("classifies unknown symbols separately from provider errors", () => {
    const diagnostics = diagnoseYahooSymbols({
      requested: ["AAPL", "BRK.B", "ZZZZZ", "NBIS"],
      received: ["AAPL", "BRK-B"],
      failures: [
        {
          symbols: ["NBIS"],
          status: 429,
          message: "Quote provider rate-limited this batch.",
          attempts: 3,
        },
      ],
      yahooSymbolFor: toYahooSymbol,
    });
    expect(diagnostics.find((row) => row.ticker === "AAPL")?.status).toBe("ok");
    expect(diagnostics.find((row) => row.ticker === "BRK.B")?.status).toBe("ok");
    expect(diagnostics.find((row) => row.ticker === "ZZZZZ")?.status).toBe(
      "unknown_symbol",
    );
    expect(diagnostics.find((row) => row.ticker === "NBIS")?.status).toBe(
      "provider_error",
    );
  });

  it("treats 429 and 5xx as retryable", () => {
    expect(isRetryableYahooStatus(429)).toBe(true);
    expect(isRetryableYahooStatus(503)).toBe(true);
    expect(isRetryableYahooStatus(404)).toBe(false);
    expect(retryDelayMs(1, "2")).toBe(2000);
  });
});

describe("toYahooSymbol", () => {
  it("converts share-class and prefix forms without dropping the ticker", () => {
    expect(toYahooSymbol("BRK.B")).toBe("BRK-B");
    expect(toYahooSymbol("BF/B")).toBe("BF-B");
    expect(toYahooSymbol("NASDAQ:MSFT")).toBe("MSFT");
    expect(toYahooSymbol("BTC-USD")).toBe("BTC-USD");
  });
});
