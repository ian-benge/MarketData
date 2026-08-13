import { describe, expect, it } from "vitest";
import { applyCloseToBook, PositionCloseError } from "./close";
import type { PositionRecord } from "./types";

function position(
  overrides: Partial<PositionRecord> & Pick<PositionRecord, "ticker">,
): PositionRecord {
  return {
    id: overrides.id ?? `pos-${overrides.ticker}`,
    firmId: "firm-1",
    ticker: overrides.ticker,
    assetType: overrides.assetType ?? "equity",
    side: overrides.side ?? "long",
    quantity: overrides.quantity ?? 70,
    multiplier: overrides.multiplier ?? 1,
    entryPrice: overrides.entryPrice ?? 100,
    entryDate: overrides.entryDate ?? "2026-07-01",
    currency: "USD",
    strategy: overrides.strategy ?? "core",
    notes: overrides.notes ?? null,
    status: overrides.status ?? "open",
    closePrice: overrides.closePrice ?? null,
    closeDate: overrides.closeDate ?? null,
    closedAt: overrides.closedAt ?? null,
    createdBy: "demo-member",
    bookId: null,
    createdAt: "2026-07-01T14:00:00.000Z",
    updatedAt: "2026-07-01T14:00:00.000Z",
  };
}

describe("applyCloseToBook", () => {
  it("fully closes when quantity is omitted or matches the open lot", () => {
    const open = position({ ticker: "ZM", quantity: 40 });
    const full = applyCloseToBook([open], open.id, {
      closePrice: 106.48,
      closeDate: "2026-08-13",
      closedAt: "2026-08-13T19:00:00.000Z",
    });
    expect(full.mode).toBe("full");
    expect(full.remaining).toBeNull();
    expect(full.closed.status).toBe("closed");
    expect(full.closed.quantity).toBe(40);
    expect(full.closed.closePrice).toBe(106.48);
    expect(full.book).toHaveLength(1);

    const matched = applyCloseToBook([open], open.id, {
      closePrice: 106.48,
      closeDate: "2026-08-13",
      quantity: 40,
      closedAt: "2026-08-13T19:00:00.000Z",
    });
    expect(matched.mode).toBe("full");
  });

  it("splits a partial close into a remaining sleeve and a closed lot", () => {
    const open = position({ id: "pos-zm-core", ticker: "ZM", quantity: 40 });
    const result = applyCloseToBook([open], open.id, {
      closePrice: 106.48,
      closeDate: "2026-08-13",
      quantity: 10,
      closedLotId: "pos-zm-trim",
      closedAt: "2026-08-13T19:00:00.000Z",
    });
    expect(result.mode).toBe("partial");
    expect(result.remaining?.id).toBe("pos-zm-core");
    expect(result.remaining?.quantity).toBe(30);
    expect(result.remaining?.status).toBe("open");
    expect(result.remaining?.closePrice).toBeNull();
    expect(result.closed.id).toBe("pos-zm-trim");
    expect(result.closed.quantity).toBe(10);
    expect(result.closed.status).toBe("closed");
    expect(result.closed.entryPrice).toBe(100);
    expect(result.closed.closePrice).toBe(106.48);
    expect(result.book.map((row) => row.id)).toEqual([
      "pos-zm-core",
      "pos-zm-trim",
    ]);
  });

  it("rejects oversized, missing, and already-closed lots", () => {
    const open = position({ ticker: "ZM", quantity: 40 });
    expect(() =>
      applyCloseToBook([open], open.id, {
        closePrice: 106.48,
        closeDate: "2026-08-13",
        quantity: 41,
      }),
    ).toThrow(PositionCloseError);
    expect(() =>
      applyCloseToBook([open], "missing", {
        closePrice: 106.48,
        closeDate: "2026-08-13",
      }),
    ).toThrow(/not found/i);
    expect(() =>
      applyCloseToBook(
        [position({ ticker: "ZM", status: "closed", closePrice: 110, closeDate: "2026-08-01" })],
        "pos-ZM",
        { closePrice: 106.48, closeDate: "2026-08-13" },
      ),
    ).toThrow(/already closed/i);
  });
});
