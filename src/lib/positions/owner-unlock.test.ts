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
  it("keeps open counts on locked teammates", () => {
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
    expect(flagged[1]).toMatchObject({ needsUnlock: true, openCount: 8 });
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

  it("drops every grant after the desk epoch advances", () => {
    const token = grantOwnerUnlock(
      undefined,
      SECRET,
      "viewer",
      "owner-a",
      1_000,
      { firm: 0, owners: { "owner-a": 0 } },
    );
    expect(
      readOwnerUnlock(token, SECRET, "viewer", 1_001, {
        firm: 1,
        owners: { "owner-a": 0 },
      }).size,
    ).toBe(0);
  });

  it("drops only the owner whose book epoch advanced", () => {
    const first = grantOwnerUnlock(
      undefined,
      SECRET,
      "viewer",
      "owner-a",
      1_000,
      { firm: 0, owners: { "owner-a": 0, "owner-b": 0 } },
    );
    const token = grantOwnerUnlock(
      first,
      SECRET,
      "viewer",
      "owner-b",
      1_000,
      { firm: 0, owners: { "owner-a": 0, "owner-b": 0 } },
    );
    expect(
      readOwnerUnlock(token, SECRET, "viewer", 1_001, {
        firm: 0,
        owners: { "owner-a": 1, "owner-b": 0 },
      }),
    ).toEqual(new Set(["owner-b"]));
  });

  it("does not revive prior grants when unlocking after a desk reset", () => {
    const stale = grantOwnerUnlock(
      undefined,
      SECRET,
      "viewer",
      "owner-a",
      1_000,
      { firm: 0, owners: { "owner-a": 0, "owner-b": 0 } },
    );
    const next = grantOwnerUnlock(
      stale,
      SECRET,
      "viewer",
      "owner-b",
      1_000,
      { firm: 1, owners: { "owner-a": 0, "owner-b": 0 } },
    );
    expect(
      readOwnerUnlock(next, SECRET, "viewer", 1_001, {
        firm: 1,
        owners: { "owner-a": 0, "owner-b": 0 },
      }),
    ).toEqual(new Set(["owner-b"]));
  });
});
