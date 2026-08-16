import { describe, expect, it } from "vitest";
import {
  looksLikeListedTicker,
  toAlphaVantageSymbol,
  toCanonicalSymbol,
  toFinnhubSymbol,
  toYahooSymbol,
} from "@/lib/market-data/earnings/symbols";

describe("earnings symbol conversion", () => {
  it("maps dotted and hyphenated share-class tickers to a canonical form", () => {
    expect(toCanonicalSymbol("brk.b")).toBe("BRK.B");
    expect(toCanonicalSymbol("BRK-B")).toBe("BRK.B");
    expect(toCanonicalSymbol("BF/B")).toBe("BF.B");
    expect(toCanonicalSymbol("bf.b")).toBe("BF.B");
  });

  it("maps share-class symbols to Yahoo hyphen form without mutating canonical", () => {
    expect(toYahooSymbol("BRK.B")).toBe("BRK-B");
    expect(toYahooSymbol("BF.B")).toBe("BF-B");
    expect(toYahooSymbol("AAPL")).toBe("AAPL");
    expect(toFinnhubSymbol("BRK-B")).toBe("BRK.B");
    expect(toAlphaVantageSymbol("BF-B")).toBe("BF.B");
  });

  it("strips exchange prefixes before canonicalizing", () => {
    expect(toCanonicalSymbol("US:AAPL")).toBe("AAPL");
    expect(toCanonicalSymbol("NASDAQ:BRK-B")).toBe("BRK.B");
  });

  it("does not invent a blank ticker when conversion input is empty", () => {
    expect(toCanonicalSymbol("   ")).toBeNull();
    expect(toYahooSymbol("AAPL")).toBe("AAPL");
    expect(looksLikeListedTicker("AAPL")).toBe(true);
    expect(looksLikeListedTicker("BRK.B")).toBe(true);
    expect(looksLikeListedTicker("")).toBe(false);
  });
});
