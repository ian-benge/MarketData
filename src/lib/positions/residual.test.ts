import { describe, expect, it } from "vitest";
import { isResidualBookLot } from "./residual";

describe("isResidualBookLot", () => {
  it("treats a sub-dollar leftover as residual", () => {
    expect(
      isResidualBookLot({
        marketValue: 0.32,
        dayPnl: 0.01,
        unrealizedPnl: 0.02,
      }),
    ).toBe(true);
  });

  it("treats an unmarked leftover from entry notional as residual", () => {
    expect(
      isResidualBookLot({
        marketValue: null,
        quantity: 1,
        multiplier: 1,
        entryPrice: 0.3,
      }),
    ).toBe(true);
  });

  it("keeps a material book name", () => {
    expect(
      isResidualBookLot({
        marketValue: 50_000,
        dayPnl: 800,
        unrealizedPnl: 1_200,
      }),
    ).toBe(false);
  });
});
