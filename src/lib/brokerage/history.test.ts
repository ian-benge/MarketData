import { describe, expect, it } from "vitest";
import {
  historyLookbackStart,
  isHistoryLookback,
} from "./history-lookback";
import {
  matchClosedLots,
  normalizeSnapTradeActivities,
  residualActivityFees,
  type NormalizedFill,
} from "./history";

function fill(
  partial: Partial<NormalizedFill> & Pick<NormalizedFill, "id" | "ticker" | "side">,
): NormalizedFill {
  return {
    assetType: "equity",
    quantity: 10,
    price: 100,
    date: "2025-06-01",
    closedAt: "2025-06-01T20:00:00.000Z",
    currency: "USD",
    multiplier: 1,
    fee: 0,
    ...partial,
  };
}

describe("normalizeSnapTradeActivities", () => {
  it("keeps BUY/SELL/REI fills and maps option tickers", () => {
    const result = normalizeSnapTradeActivities([
      {
        id: "buy-1",
        type: "BUY",
        units: "10",
        price: "12.5",
        trade_date: "2025-03-22T16:27:55.000Z",
        symbol: { raw_symbol: "AAPL", type: { code: "cs" } },
        currency: { code: "USD" },
      },
      {
        id: "rei-1",
        type: "REI",
        units: 1.2,
        amount: 180,
        trade_date: "2025-04-01",
        symbol: { raw_symbol: "VTI" },
      },
      {
        id: "opt-1",
        type: "SELL",
        option_type: "SELL_TO_CLOSE",
        units: -2,
        price: 4.1,
        trade_date: "2025-05-01T14:00:00.000Z",
        option_symbol: { ticker: "AAPL  250117C00150000" },
      },
      {
        id: "fee-1",
        type: "FEE",
        amount: -4.95,
        fee: 4.95,
        trade_date: "2025-06-01",
      },
      {
        id: "div-1",
        type: "DIVIDEND",
        units: 1,
        price: 0.5,
        trade_date: "2025-06-01",
        symbol: { raw_symbol: "AAPL" },
      },
    ]);

    expect(result.fills.map((row) => row.id)).toEqual(["buy-1", "rei-1", "opt-1"]);
    expect(result.fills[0]).toMatchObject({
      ticker: "AAPL",
      side: "buy",
      quantity: 10,
      price: 12.5,
      date: "2025-03-22",
      assetType: "equity",
    });
    expect(result.fills[1]).toMatchObject({
      ticker: "VTI",
      side: "buy",
      quantity: 1.2,
      price: 150,
    });
    expect(result.fills[2]).toMatchObject({
      ticker: "AAPL250117C00150000",
      side: "sell",
      assetType: "option",
      multiplier: 100,
      quantity: 2,
    });
    expect(result.skipped.some((row) => /DIVIDEND/.test(row.reason))).toBe(true);
    expect(result.activityFees).toBeCloseTo(4.95);
  });

  it("uses the calendar date from trade_date instead of Chicago conversion", () => {
    const result = normalizeSnapTradeActivities([
      {
        id: "buy-utc",
        type: "BUY",
        units: 1,
        price: 10,
        trade_date: "2025-03-22",
        symbol: { raw_symbol: "MSFT" },
      },
    ]);
    expect(result.fills[0]?.date).toBe("2025-03-22");
  });
});

describe("matchClosedLots", () => {
  it("FIFO-matches a long round trip, including partials", () => {
    const { lots, unmatched } = matchClosedLots([
      fill({ id: "b1", ticker: "AAPL", side: "buy", quantity: 20, price: 10, date: "2025-01-02" }),
      fill({
        id: "s1",
        ticker: "AAPL",
        side: "sell",
        quantity: 8,
        price: 12,
        date: "2025-02-01",
        closedAt: "2025-02-01T20:00:00.000Z",
      }),
      fill({
        id: "s2",
        ticker: "AAPL",
        side: "sell",
        quantity: 12,
        price: 13,
        date: "2025-03-01",
        closedAt: "2025-03-01T20:00:00.000Z",
      }),
    ]);
    expect(unmatched).toBe(0);
    expect(lots).toEqual([
      expect.objectContaining({
        externalId: "hist:b1:s1",
        ticker: "AAPL",
        side: "long",
        quantity: 8,
        entryPrice: 10,
        entryDate: "2025-01-02",
        closePrice: 12,
        closeDate: "2025-02-01",
      }),
      expect.objectContaining({
        externalId: "hist:b1:s2",
        ticker: "AAPL",
        side: "long",
        quantity: 12,
        entryPrice: 10,
        closePrice: 13,
        closeDate: "2025-03-01",
      }),
    ]);
  });

  it("covers shorts and leaves leftover inventory unmatched", () => {
    const { lots, unmatched } = matchClosedLots([
      fill({ id: "s1", ticker: "NVDA", side: "sell", quantity: 10, price: 50, date: "2025-01-01" }),
      fill({ id: "b1", ticker: "NVDA", side: "buy", quantity: 4, price: 40, date: "2025-02-01" }),
      fill({ id: "b2", ticker: "MSFT", side: "buy", quantity: 3, price: 20, date: "2025-03-01" }),
    ]);
    expect(lots).toEqual([
      expect.objectContaining({
        externalId: "hist:s1:b1",
        ticker: "NVDA",
        side: "short",
        quantity: 4,
        entryPrice: 50,
        closePrice: 40,
      }),
    ]);
    expect(unmatched).toBe(2);
  });

  it("FIFO-matches interleaved same-day partial fills into one lot per closed share", () => {
    const day = "2026-08-14";
    function at(
      timeUtc: string,
      extra: Partial<NormalizedFill> & Pick<NormalizedFill, "id" | "side">,
    ): NormalizedFill {
      return fill({
        ticker: "SURG",
        date: day,
        closedAt: `${day}T${timeUtc}.000Z`,
        quantity: extra.quantity ?? 1,
        fee: 0,
        ...extra,
      });
    }

    const { lots, unmatched } = matchClosedLots([
      at("11:47:22", { id: "b1", side: "buy", price: 0.3116 }),
      at("11:47:36", { id: "b2", side: "buy", price: 0.3236 }),
      at("11:47:51", { id: "b3", side: "buy", price: 0.3249 }),
      at("11:48:36", { id: "s1", side: "sell", price: 0.3541 }),
      at("11:49:23", { id: "s2", side: "sell", price: 0.362 }),
      at("11:56:41", { id: "s3", side: "sell", price: 0.39816 }),
      at("12:00:26", { id: "b4", side: "buy", price: 0.3719, quantity: 3 }),
      at("12:07:40", { id: "s4", side: "sell", price: 0.4644 }),
      at("12:08:42", { id: "s5", side: "sell", price: 0.444 }),
      at("14:24:31", { id: "s6", side: "sell", price: 0.3449 }),
    ]);

    expect(unmatched).toBe(0);
    expect(lots).toHaveLength(6);
    expect(lots.every((lot) => lot.quantity === 1)).toBe(true);
    expect(lots.map((lot) => lot.entryPrice)).toEqual([
      0.3116, 0.3236, 0.3249, 0.3719, 0.3719, 0.3719,
    ]);
    expect(lots.map((lot) => lot.closePrice)).toEqual([
      0.3541, 0.362, 0.39816, 0.4644, 0.444, 0.3449,
    ]);
    expect(lots.map((lot) => lot.externalId)).toEqual([
      "hist:b1:s1",
      "hist:b2:s2",
      "hist:b3:s3",
      "hist:b4:s4",
      "hist:b4:s5",
      "hist:b4:s6",
    ]);
  });

  it("does not invent open lots from unmatched leftover buys", () => {
    const { lots, unmatched } = matchClosedLots([
      fill({ id: "b1", ticker: "AAPL", side: "buy", quantity: 5, price: 10, date: "2025-01-01" }),
    ]);
    expect(lots).toEqual([]);
    expect(unmatched).toBe(1);
  });

  it("allocates fill fees onto FIFO-matched closed lots", () => {
    const { lots } = matchClosedLots([
      fill({
        id: "b1",
        ticker: "AAPL",
        side: "buy",
        quantity: 20,
        price: 10,
        fee: 10,
        date: "2025-01-02",
      }),
      fill({
        id: "s1",
        ticker: "AAPL",
        side: "sell",
        quantity: 8,
        price: 12,
        fee: 2,
        date: "2025-02-01",
      }),
    ]);
    expect(lots[0]?.fees).toBeCloseTo(6);
  });

  it("expires remaining inventory at zero and leaves cash fees unallocated", () => {
    const result = normalizeSnapTradeActivities([
      {
        id: "b1",
        type: "BUY",
        units: 2,
        price: 1.25,
        fee: 1.3,
        trade_date: "2026-01-02",
        option_symbol: { ticker: "AAPL  250117C00150000" },
      },
      {
        id: "tax-1",
        type: "TAX",
        amount: -2.5,
        trade_date: "2026-01-03",
      },
      {
        id: "exp-1",
        type: "OPTIONEXPIRATION",
        units: 2,
        price: 0,
        fee: 0.65,
        trade_date: "2026-01-17",
        option_symbol: { ticker: "AAPL  250117C00150000" },
      },
    ]);
    expect(result.activityFees).toBeCloseTo(4.45);
    const { lots, unmatched } = matchClosedLots(result.fills);
    expect(unmatched).toBe(0);
    expect(lots).toHaveLength(1);
    expect(lots[0]).toMatchObject({
      ticker: "AAPL250117C00150000",
      quantity: 2,
      closePrice: 0,
    });
    expect(lots[0]?.fees).toBeCloseTo(1.95);
    expect(residualActivityFees(result.activityFees, lots)).toBeCloseTo(2.5);
  });

  it("keeps unmatched fill commissions in the residual", () => {
    const fills = [
      fill({ id: "b1", ticker: "AAPL", side: "buy", quantity: 5, price: 10, fee: 3.25 }),
    ];
    const { lots, unmatched } = matchClosedLots(fills);
    expect(lots).toEqual([]);
    expect(unmatched).toBe(1);
    expect(residualActivityFees(3.25, lots)).toBeCloseTo(3.25);
  });
});

describe("historyLookbackStart", () => {
  const now = new Date("2026-08-14T18:00:00.000Z");

  it("maps 1d / 1w / 1m / all from Chicago calendar", () => {
    expect(historyLookbackStart("1d", now)).toBe("2026-08-13");
    expect(historyLookbackStart("1w", now)).toBe("2026-08-07");
    expect(historyLookbackStart("1m", now)).toBe("2026-07-14");
    expect(historyLookbackStart("all", now)).toBeNull();
  });

  it("accepts only the known lookbacks", () => {
    expect(isHistoryLookback("1d")).toBe(true);
    expect(isHistoryLookback("all")).toBe(true);
    expect(isHistoryLookback("2w")).toBe(false);
  });
});
