import { describe, expect, it } from "vitest";
import {
  brokerageBookTitle,
  maskAccountNumber,
  normalizeSnapTradePositions,
  sanitizeTicker,
} from "./normalize";

describe("sanitizeTicker", () => {
  it("keeps equity and crypto symbols the blotter already accepts", () => {
    expect(sanitizeTicker("nvda")).toBe("NVDA");
    expect(sanitizeTicker("BTC-USD")).toBe("BTC-USD");
  });

  it("strips OCC option padding and maps futures roots", () => {
    expect(sanitizeTicker("AAPL  250117C00150000")).toBe("AAPL250117C00150000");
    expect(sanitizeTicker("/ES")).toBe("ES=F");
  });

  it("rejects symbols that cannot fit the blotter", () => {
    expect(sanitizeTicker("$$$")).toBeNull();
    expect(sanitizeTicker("")).toBeNull();
  });
});

describe("normalizeSnapTradePositions", () => {
  it("maps the unified positions payload into blotter lots", () => {
    const result = normalizeSnapTradePositions([
      {
        instrument: {
          kind: "stock",
          id: "inst-aapl",
          symbol: "AAPL",
          raw_symbol: "AAPL",
        },
        units: "12.5",
        price: "190.2",
        cost_basis: "148.1",
        currency: "USD",
      },
      {
        instrument: {
          kind: "option",
          id: "inst-opt",
          symbol: "AAPL  250117C00150000",
          multiplier: "100",
        },
        units: "-2",
        price: "4.10",
        cost_basis: "3.25",
      },
    ]);

    expect(result.holdings).toEqual([
      {
        externalId: "inst-aapl",
        ticker: "AAPL",
        assetType: "equity",
        side: "long",
        quantity: 12.5,
        multiplier: 1,
        entryPrice: 148.1,
        mark: 190.2,
        currency: "USD",
      },
      {
        externalId: "inst-opt",
        ticker: "AAPL250117C00150000",
        assetType: "option",
        side: "short",
        quantity: 2,
        multiplier: 100,
        entryPrice: 3.25,
        mark: 4.1,
        currency: "USD",
      },
    ]);
    expect(result.skipped).toEqual([]);
  });

  it("accepts the legacy symbol wrapper and skips cash / empty lots", () => {
    const result = normalizeSnapTradePositions([
      {
        symbol: {
          id: "legacy-spy",
          symbol: { symbol: "SPY", raw_symbol: "SPY", type: { code: "et" } },
        },
        units: 8,
        average_purchase_price: 420,
        price: 510,
      },
      { instrument: { kind: "etf", id: "cash", symbol: "SPAXX" }, units: "100", cash_equivalent: true, cost_basis: "1" },
      { instrument: { kind: "stock", id: "zero", symbol: "TSLA" }, units: "0", cost_basis: "10" },
    ]);

    expect(result.holdings).toHaveLength(1);
    expect(result.holdings[0]).toMatchObject({
      ticker: "SPY",
      assetType: "etf",
      externalId: "legacy-spy",
      entryPrice: 420,
    });
    expect(result.skipped.map((row) => row.reason)).toEqual([
      "Skipped cash-equivalent holding.",
      "Holding has no quantity.",
    ]);
  });

  it("dedupes by instrument identity", () => {
    const result = normalizeSnapTradePositions([
      {
        instrument: { kind: "stock", id: "same", symbol: "MSFT" },
        units: "1",
        cost_basis: "10",
      },
      {
        instrument: { kind: "stock", id: "same", symbol: "MSFT" },
        units: "2",
        cost_basis: "11",
      },
    ]);
    expect(result.holdings).toHaveLength(1);
    expect(result.skipped[0]?.reason).toBe("Duplicate holding identity.");
  });
});

describe("brokerage book labels", () => {
  it("masks account numbers and keeps titles inside the book limit", () => {
    expect(maskAccountNumber("12345678")).toBe("…5678");
    expect(brokerageBookTitle("Charles Schwab", "Individual", "…5678")).toBe(
      "Charles Schwab · Individual",
    );
    expect(brokerageBookTitle("Robinhood", null, "…1111")).toBe(
      "Robinhood · …1111",
    );
  });
});
