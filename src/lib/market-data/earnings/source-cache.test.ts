import { describe, expect, it } from "vitest";
import { sanitizeEarningsError } from "@/lib/market-data/earnings/diagnostics";
import { LastGoodCache } from "@/lib/market-data/earnings/source-cache";

describe("LastGoodCache", () => {
  it("preserves the last successful snapshot and marks it stale after a failed refresh", async () => {
    const cache = new LastGoodCache<string[]>(
      0,
      (rows) => rows.length,
      () => [],
    );
    const first = await cache.resolve({
      configured: true,
      notConfiguredError: "missing",
      load: async () => ["AAPL"],
    });
    expect(first).toMatchObject({ ok: true, stale: false, eventCount: 1 });

    const failed = await cache.resolve({
      configured: true,
      notConfiguredError: "missing",
      load: async () => {
        throw new Error("upstream down");
      },
    });
    expect(failed.data).toEqual(["AAPL"]);
    expect(failed.stale).toBe(true);
    expect(failed.ok).toBe(false);
    expect(failed.error).toMatch(/upstream down/);
  });

  it("does not let an unexpected empty payload erase the last good snapshot", async () => {
    const cache = new LastGoodCache<string[]>(
      0,
      (rows) => rows.length,
      () => [],
    );
    await cache.resolve({
      configured: true,
      notConfiguredError: "missing",
      load: async () => ["MSFT", "NVDA"],
    });
    const empty = await cache.resolve({
      configured: true,
      notConfiguredError: "missing",
      load: async () => [],
    });
    expect(empty.data).toEqual(["MSFT", "NVDA"]);
    expect(empty.stale).toBe(true);
    expect(empty.error).toMatch(/zero rows/i);
  });

  it("redacts provider keys from stored error messages", () => {
    expect(
      sanitizeEarningsError(
        "failed https://www.alphavantage.co/query?function=EARNINGS_CALENDAR&apikey=secret123",
      ),
    ).toContain("apikey=redacted");
    expect(
      sanitizeEarningsError(
        "failed https://www.alphavantage.co/query?function=EARNINGS_CALENDAR&apikey=secret123",
      ),
    ).not.toContain("secret123");
  });
});
