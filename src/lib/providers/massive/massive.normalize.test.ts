import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  normalizeMassiveAggBar,
  normalizeMassiveDividend,
  normalizeMassiveInstrument,
  normalizeMassiveMarketStatus,
  normalizeMassiveSnapshot,
  resolveMassiveCoverage,
} from "@/lib/providers/massive/normalize";

const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), "fixtures");

function loadFixture(name: string): unknown {
  return JSON.parse(readFileSync(join(fixtureDir, name), "utf8"));
}

const ctx = {
  licenseScopeId: "massive:single_user_development",
  permittedSurfaces: ["dashboard_display" as const],
  retrievalTimestamp: "2026-08-10T20:00:00.000Z",
  marketSession: "regular" as const,
};

describe("massive normalize", () => {
  it("maps snapshot fixture with honest coverage", () => {
    const raw = loadFixture("snapshots.json") as {
      tickers: unknown[];
    };
    const snap = normalizeMassiveSnapshot(raw.tickers[0], ctx);
    expect(snap.ticker).toBe("AAPL");
    expect(snap.last).toBe(227.35);
    expect(snap.priorClose).toBe(225.8);
    expect(snap.providerName).toBe("massive");
    expect(snap.feedCoverage).toBe("full_market");
  });

  it("prefers FMV when configured and present", () => {
    const raw = loadFixture("snapshots.json") as {
      tickers: unknown[];
    };
    const snap = normalizeMassiveSnapshot(raw.tickers[0], {
      ...ctx,
      preferFmv: true,
      feedCoverage: "fmv",
    });
    expect(snap.last).toBe(227.33);
    expect(snap.feedCoverage).toBe("fmv");
    expect(resolveMassiveCoverage({ ...ctx, preferFmv: true }).feedCoverage).toBe(
      "fmv",
    );
  });

  it("maps aggs, market status, reference, dividends", () => {
    const aggs = loadFixture("aggs.json") as { results: unknown[] };
    const bar = normalizeMassiveAggBar("AAPL", aggs.results[0], "1m", ctx);
    expect(bar.close).toBe(226.2);
    expect(bar.interval).toBe("1m");

    const status = normalizeMassiveMarketStatus(
      loadFixture("market-status.json"),
      ctx,
    );
    expect(status.session).toBe("afterhours");
    expect(status.isOpen).toBe(false);

    const details = loadFixture("ticker-details.json") as {
      results: unknown;
    };
    const inst = normalizeMassiveInstrument(details.results, ctx);
    expect(inst.ticker).toBe("AAPL");
    expect(inst.name).toBe("Apple Inc.");

    const divs = loadFixture("dividends.json") as { results: unknown[] };
    const action = normalizeMassiveDividend(divs.results[0], ctx);
    expect(action.actionType).toBe("dividend");
    expect(action.cashAmount).toBe(0.26);
  });
});
