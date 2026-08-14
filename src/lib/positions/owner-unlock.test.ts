import { describe, expect, it } from "vitest";
import { UNASSIGNED_OWNER_ID } from "./owners";
import {
  applyOwnerUnlockFlags,
  grantOwnerUnlock,
  ownerViewRequiresUnlock,
  readOwnerUnlock,
  signOwnerUnlock,
} from "./owner-unlock";

const SECRET = "test-owner-unlock-secret";

describe("ownerViewRequiresUnlock", () => {
  it("never locks the viewer's own book", () => {
    expect(
      ownerViewRequiresUnlock("user-1", "user-1", new Set()),
    ).toBe(false);
  });

  it("locks another teammate until their id is granted", () => {
    expect(
      ownerViewRequiresUnlock("user-1", "user-2", new Set()),
    ).toBe(true);
    expect(
      ownerViewRequiresUnlock("user-1", "user-2", new Set(["user-2"])),
    ).toBe(false);
  });

  it("locks the unassigned book", () => {
    expect(
      ownerViewRequiresUnlock("user-1", UNASSIGNED_OWNER_ID, new Set()),
    ).toBe(true);
  });
});

describe("applyOwnerUnlockFlags", () => {
  it("hides open counts on locked teammates", () => {
    const flagged = applyOwnerUnlockFlags(
      [
        {
          id: "user-1",
          displayName: "You",
          email: "you@example.com",
          role: "member",
          openCount: 3,
          isViewer: true,
        },
        {
          id: "user-2",
          displayName: "Teammate",
          email: "other@example.com",
          role: "member",
          openCount: 8,
          isViewer: false,
        },
      ],
      "user-1",
      new Set(),
    );
    expect(flagged[0]).toMatchObject({ needsUnlock: false, openCount: 3 });
    expect(flagged[1]).toMatchObject({ needsUnlock: true, openCount: 0 });
  });
});

describe("owner unlock cookie", () => {
  it("round-trips a grant for the same viewer", () => {
    const token = grantOwnerUnlock(undefined, SECRET, "viewer", "owner-a", 1_000);
    expect(readOwnerUnlock(token, SECRET, "viewer", 1_001)).toEqual(
      new Set(["owner-a"]),
    );
  });

  it("rejects a token for a different viewer or a bad signature", () => {
    const token = grantOwnerUnlock(undefined, SECRET, "viewer", "owner-a", 1_000);
    expect(readOwnerUnlock(token, SECRET, "other", 1_001).size).toBe(0);
    expect(
      readOwnerUnlock(token.slice(0, -2) + "xx", SECRET, "viewer", 1_001).size,
    ).toBe(0);
  });

  it("drops expired grants", () => {
    const token = signOwnerUnlock(
      { v: "viewer", g: { "owner-a": 500 } },
      SECRET,
    );
    expect(readOwnerUnlock(token, SECRET, "viewer", 1_000).size).toBe(0);
  });
});
