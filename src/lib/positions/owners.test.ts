import { describe, expect, it } from "vitest";
import {
  UNASSIGNED_OWNER_ID,
  buildOwnerList,
  canEditPositionBook,
  ownerKey,
  resolveOwnerId,
} from "./owners";
import type { PositionRecord } from "./types";

function position(
  createdBy: string | null,
  status: "open" | "closed" = "open",
): PositionRecord {
  return {
    id: `pos-${createdBy ?? "none"}-${status}`,
    firmId: "firm-1",
    ticker: "NVDA",
    assetType: "equity",
    side: "long",
    quantity: 10,
    multiplier: 1,
    entryPrice: 100,
    entryDate: "2026-07-01",
    currency: "USD",
    strategy: null,
    notes: null,
    status,
    closePrice: status === "closed" ? 110 : null,
    closeDate: status === "closed" ? "2026-08-01" : null,
    closedAt: status === "closed" ? "2026-08-01T20:00:00.000Z" : null,
    createdBy,
    bookId: null,
    createdAt: "2026-07-01T14:00:00.000Z",
    updatedAt: "2026-07-01T14:00:00.000Z",
  };
}

describe("position owners", () => {
  it("puts the viewer first and counts only open lots", () => {
    const owners = buildOwnerList(
      [
        {
          id: "demo-admin",
          email: "admin@demo.local",
          displayName: "Demo Admin",
          role: "admin",
        },
        {
          id: "demo-member",
          email: "member@demo.local",
          displayName: "Demo Member",
          role: "member",
        },
      ],
      [
        position("demo-admin"),
        position("demo-admin"),
        position("demo-admin", "closed"),
        position("demo-member"),
        position(null),
      ],
      "demo-member",
    );

    expect(owners.map((owner) => owner.id)).toEqual([
      "demo-member",
      "demo-admin",
      UNASSIGNED_OWNER_ID,
    ]);
    expect(owners[0]?.openCount).toBe(1);
    expect(owners[1]?.openCount).toBe(2);
    expect(owners[2]?.openCount).toBe(1);
  });

  it("lets members edit only their own book", () => {
    expect(
      canEditPositionBook({ id: "demo-member", role: "member" }, "demo-member"),
    ).toBe(true);
    expect(
      canEditPositionBook({ id: "demo-member", role: "member" }, "demo-admin"),
    ).toBe(false);
    expect(
      canEditPositionBook({ id: "demo-admin", role: "admin" }, "demo-member"),
    ).toBe(true);
  });

  it("resolves a missing owner request to the viewer", () => {
    const owners = buildOwnerList(
      [
        {
          id: "demo-member",
          email: "member@demo.local",
          displayName: "Demo Member",
          role: "member",
        },
      ],
      [],
      "demo-member",
    );
    expect(resolveOwnerId("missing", "demo-member", owners)).toBe("demo-member");
    expect(ownerKey(null)).toBe(UNASSIGNED_OWNER_ID);
  });
});
