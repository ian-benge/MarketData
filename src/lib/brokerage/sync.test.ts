import { describe, expect, it } from "vitest";
import { planSyncedBookChanges } from "./diff";
import type { NormalizedHolding, SyncedPositionRow } from "./types";

function holding(
  partial: Partial<NormalizedHolding> & Pick<NormalizedHolding, "externalId" | "ticker">,
): NormalizedHolding {
  return {
    assetType: "equity",
    side: "long",
    quantity: 10,
    multiplier: 1,
    entryPrice: 100,
    mark: 110,
    currency: "USD",
    ...partial,
  };
}

function lot(
  partial: Partial<SyncedPositionRow> & Pick<SyncedPositionRow, "id" | "externalId">,
): SyncedPositionRow {
  return {
    ticker: "AAPL",
    quantity: 10,
    entryPrice: 100,
    entryDate: "2026-07-01",
    status: "open",
    brokerageAccountId: "acct-1",
    ...partial,
  };
}

describe("planSyncedBookChanges", () => {
  it("inserts new holdings, updates known ones, and closes vanished lots", () => {
    const plan = planSyncedBookChanges(
      [
        lot({ id: "open-aapl", externalId: "aapl", ticker: "AAPL" }),
        lot({ id: "open-gone", externalId: "gone", ticker: "NFLX" }),
      ],
      [
        holding({ externalId: "aapl", ticker: "AAPL", quantity: 12 }),
        holding({ externalId: "msft", ticker: "MSFT" }),
      ],
      new Set(),
    );
    expect(plan.upserts.map((row) => row.externalId)).toEqual(["aapl", "msft"]);
    expect(plan.closes.map((row) => row.id)).toEqual(["open-gone"]);
    expect(plan.skipped).toEqual([]);
  });

  it("does not import a ticker that already exists as a manual lot on the book", () => {
    const plan = planSyncedBookChanges(
      [],
      [holding({ externalId: "aapl", ticker: "AAPL", side: "long" })],
      new Set(["AAPL:long"]),
    );
    expect(plan.upserts).toEqual([]);
    expect(plan.skipped.map((row) => row.ticker)).toEqual(["AAPL"]);
    expect(plan.closes).toEqual([]);
  });
});
