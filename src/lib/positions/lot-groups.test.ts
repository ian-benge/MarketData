import { describe, expect, it } from "vitest";
import { enrichPosition } from "./math";
import { groupLotsForBlotter } from "./lot-groups";
import type { PositionRecord } from "./types";

function fill(
  id: string,
  closePrice: number,
  fees: number,
): PositionRecord {
  return {
    id,
    firmId: "firm-1",
    ticker: "MSFT260202C00430000",
    assetType: "option",
    side: "short",
    quantity: 1,
    multiplier: 100,
    entryPrice: 1.06,
    entryDate: "2026-02-02",
    currency: "USD",
    strategy: null,
    notes: null,
    status: "closed",
    closePrice,
    closeDate: "2026-02-02",
    closedAt: "2026-02-02T21:00:00.000Z",
    createdBy: "user-1",
    bookId: "book-1",
    source: "snaptrade",
    fees,
    createdAt: "2026-02-02T14:00:00.000Z",
    updatedAt: "2026-02-02T21:00:00.000Z",
  };
}

describe("groupLotsForBlotter", () => {
  it("groups same-day OCC fills without dropping the underlying rows", () => {
    const rows = [
      enrichPosition(fill("a", 1.32, 1.32333333), undefined, undefined, "2026-02-02T22:00:00.000Z"),
      enrichPosition(fill("b", 1.29, 1.32333333), undefined, undefined, "2026-02-02T22:00:00.000Z"),
      enrichPosition(fill("c", 1.35, 1.32333333), undefined, undefined, "2026-02-02T22:00:00.000Z"),
    ];
    const grouped = groupLotsForBlotter(rows);
    expect(grouped).toHaveLength(1);
    expect(grouped[0]?.fills).toHaveLength(3);
    expect(grouped[0]?.row.quantity).toBe(3);
    expect(grouped[0]?.row.closePrice).toBeCloseTo((1.32 + 1.29 + 1.35) / 3);
    expect(grouped[0]?.fills.map((row) => row.id)).toEqual(["a", "b", "c"]);
  });

  it("does not merge different strikes or days", () => {
    const other: PositionRecord = {
      ...fill("d", 1.1, 1),
      ticker: "MSFT260202C00440000",
      id: "d",
    };
    const rows = [
      enrichPosition(fill("a", 1.32, 1), undefined, undefined, "2026-02-02T22:00:00.000Z"),
      enrichPosition(other, undefined, undefined, "2026-02-02T22:00:00.000Z"),
    ];
    expect(groupLotsForBlotter(rows)).toHaveLength(2);
  });
});
