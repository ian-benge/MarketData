import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  feedCoverageFromAlpacaFeed,
  normalizeAlpacaBar,
  normalizeAlpacaSnapshot,
  snapshotToQuote,
} from "@/lib/providers/alpaca/normalize";

const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), "fixtures");

function loadFixture(name: string): unknown {
  return JSON.parse(readFileSync(join(fixtureDir, name), "utf8"));
}

const ctx = {
  feed: "iex" as const,
  licenseScopeId: "alpaca:single_user_development",
  permittedSurfaces: ["dashboard_display" as const],
  retrievalTimestamp: "2026-08-10T20:00:00.000Z",
  marketSession: "regular" as const,
};

describe("alpaca normalize", () => {
  it("maps IEX snapshot fixture without claiming SIP/full_market", () => {
    const raw = loadFixture("snapshots.json") as Record<string, unknown>;
    const snap = normalizeAlpacaSnapshot("aapl", raw.AAPL, ctx);
    expect(snap).not.toBeNull();
    expect(snap!.ticker).toBe("AAPL");
    expect(snap!.last).toBe(227.35);
    expect(snap!.priorClose).toBe(225.8);
    expect(snap!.feedCoverage).toBe("iex");
    expect(snap!.latencyClass).toBe("realtime");
    expect(snap!.coverageNotes).toMatch(/IEX/);
    expect(snap!.coverageNotes).toMatch(/not SIP/i);
    expect(snap!.feedCoverage).not.toBe("sip");
    expect(snap!.feedCoverage).not.toBe("full_market");
    expect(feedCoverageFromAlpacaFeed("iex")).toBe("iex");
    expect(feedCoverageFromAlpacaFeed("sip")).toBe("sip");
  });

  it("normalizes SIP feed coverage only when configured as sip", () => {
    const raw = loadFixture("snapshots.json") as Record<string, unknown>;
    const snap = normalizeAlpacaSnapshot("AAPL", raw.AAPL, {
      ...ctx,
      feed: "sip",
    });
    expect(snap!.feedCoverage).toBe("sip");
    expect(snap!.coverageNotes).toMatch(/SIP/);
  });

  it("maps bars fixture", () => {
    const raw = loadFixture("bars.json") as { bars: unknown[] };
    const bar = normalizeAlpacaBar("AAPL", raw.bars[0], "1m", ctx);
    expect(bar.interval).toBe("1m");
    expect(bar.open).toBe(226.0);
    expect(bar.close).toBe(226.2);
    expect(bar.feedCoverage).toBe("iex");
  });

  it("snapshotToQuote preserves provenance", () => {
    const raw = loadFixture("snapshots.json") as Record<string, unknown>;
    const snap = normalizeAlpacaSnapshot("MSFT", raw.MSFT, ctx)!;
    const quote = snapshotToQuote(snap);
    expect(quote.last).toBe(410.2);
    expect(quote.feedCoverage).toBe("iex");
    expect(quote.providerName).toBe("alpaca");
  });
});
