import { describe, expect, it } from "vitest";
import { normalizeRoute, lookupPage, slugForRoute } from "./catalog";
import { decideShell, decideRead } from "../../.cursor/hooks/policy.mjs";

describe("page catalog", () => {
  it("normalizes routes and page files", () => {
    expect(normalizeRoute("settings")).toBe("/settings");
    expect(normalizeRoute("/scanner?system=desk")).toBe("/scanner?system=desk");
    expect(lookupPage("/dashboard")?.critical).toBe(true);
    expect(lookupPage("/denied")?.critical).toBe(false);
    expect(lookupPage("/settings")?.e2e).toEqual(["e2e/settings.spec.ts"]);
    expect(lookupPage("/settings")?.unit).toEqual(["src/components/settings"]);
    expect(slugForRoute("/watchlists")).toBe("watchlists");
  });
});

describe("project hook policy", () => {
  it("denies harness push and secret reads", () => {
    const previous = process.env.PAGE_HARNESS_ACTIVE;
    process.env.PAGE_HARNESS_ACTIVE = "1";
    try {
      expect(decideShell("git push origin HEAD").permission).toBe("deny");
      expect(decideRead("C:/Projects/MarketData/.env.local").permission).toBe("deny");
      expect(decideRead("C:/Projects/MarketData/.env.example").permission).toBe("allow");
    } finally {
      if (previous === undefined) delete process.env.PAGE_HARNESS_ACTIVE;
      else process.env.PAGE_HARNESS_ACTIVE = previous;
    }
  });
});
