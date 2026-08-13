import { describe, expect, it } from "vitest";
import {
  applyWeights,
  attachRelatedRealized,
  buildPortfolioSeries,
  buildPositionActivity,
  enrichPosition,
  signedPricePnl,
  signedReturnPercent,
  summarizePositions,
  wasOpenOn,
} from "./math";
import type { DailyClose, PositionQuote, PositionRecord } from "./types";

function position(
  overrides: Partial<PositionRecord> & Pick<PositionRecord, "ticker" | "side">,
): PositionRecord {
  return {
    id: overrides.id ?? `pos-${overrides.ticker}`,
    firmId: "firm-1",
    ticker: overrides.ticker,
    assetType: overrides.assetType ?? "equity",
    side: overrides.side,
    quantity: overrides.quantity ?? 100,
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
    createdBy: null,
    bookId: null,
    createdAt: "2026-07-01T14:00:00.000Z",
    updatedAt: "2026-07-01T14:00:00.000Z",
  };
}

const quote = (last: number, priorClose: number): PositionQuote => ({
  ticker: "X",
  last,
  priorClose,
  open: priorClose,
  changeAbsolute: last - priorClose,
  changePercent: ((last - priorClose) / priorClose) * 100,
  currency: "USD",
  stale: false,
});

describe("position math", () => {
  it("does not coerce missing marks to zero", () => {
    const row = enrichPosition(
      position({ ticker: "NVDA", side: "long" }),
      undefined,
      undefined,
      "2026-08-13T15:00:00.000Z",
    );
    expect(row.last).toBeNull();
    expect(row.marketValue).toBeNull();
    expect(row.unrealizedPnl).toBeNull();
    expect(row.dayPnl).toBeNull();
    expect(row.costBasis).toBe(10_000);
    expect(row.missing).toContain("last");
  });

  it("marks a long as profitable when price rises", () => {
    const row = enrichPosition(
      position({ ticker: "NVDA", side: "long", quantity: 100, entryPrice: 100 }),
      quote(110, 108),
      undefined,
      "2026-08-13T15:00:00.000Z",
    );
    expect(row.marketValue).toBe(11_000);
    expect(row.unrealizedPnl).toBe(1_000);
    expect(row.returnPercent).toBeCloseTo(10);
    expect(row.dayPnl).toBe(200);
  });

  it("marks a short as profitable when price falls", () => {
    expect(signedPricePnl(90, 100, 100, 1, "short")).toBe(1_000);
    expect(signedReturnPercent(90, 100, "short")).toBeCloseTo(10);
    const row = enrichPosition(
      position({ ticker: "TLT", side: "short", quantity: 100, entryPrice: 100 }),
      quote(90, 95),
      undefined,
      "2026-08-13T15:00:00.000Z",
    );
    expect(row.unrealizedPnl).toBe(1_000);
    expect(row.dayPnl).toBe(500);
    expect(row.signedMarketValue).toBe(-9_000);
  });

  it("uses entry price for lookbacks that predate the position", () => {
    const closes: DailyClose[] = [
      { date: "2026-06-01", close: 80 },
      { date: "2026-07-15", close: 105 },
      { date: "2026-08-12", close: 108 },
      { date: "2026-08-13", close: 110 },
    ];
    const row = enrichPosition(
      position({
        ticker: "NVDA",
        side: "long",
        entryDate: "2026-08-10",
        entryPrice: 100,
      }),
      quote(110, 108),
      closes,
      "2026-08-13T15:00:00.000Z",
    );
    expect(row.change1m.price).toBe(100);
    expect(row.sinceEntry.pnl).toBe(1_000);
  });

  it("computes realized P&L for closed lots and excludes them from exposure", () => {
    const closed = enrichPosition(
      position({
        ticker: "QQQ",
        side: "long",
        quantity: 25,
        entryPrice: 470,
        status: "closed",
        closePrice: 490.2,
        closeDate: "2026-08-05",
      }),
      quote(492.15, 488.9),
      undefined,
      "2026-08-13T15:00:00.000Z",
    );
    expect(closed.marketValue).toBeNull();
    expect(closed.realizedPnl).toBeCloseTo(505);
    expect(closed.dayPnl).toBeNull();

    const open = enrichPosition(
      position({ ticker: "SPY", side: "long", quantity: 10, entryPrice: 500 }),
      quote(562.4, 560.1),
      undefined,
      "2026-08-13T15:00:00.000Z",
    );
    const weighted = applyWeights([closed, open]);
    expect(weighted[1]?.weight).toBe(100);
    const summary = summarizePositions(weighted, "2026-08-13T15:00:00.000Z");
    expect(summary.openCount).toBe(1);
    expect(summary.closedCount).toBe(1);
    expect(summary.grossExposure).toBeCloseTo(5_624);
    expect(summary.realizedPnl).toBeCloseTo(505);
    expect(summary.unrealizedPnl).toBeCloseTo(624);
    expect(summary.totalPnl).toBeCloseTo(1_129);
    expect(summary.closedCostBasis).toBeCloseTo(11_750);
    expect(summary.realizedReturnPercent).toBeCloseTo(4.297, 2);
    expect(summary.closedHitRate).toBe(100);
    expect(summary.winners.map((row) => row.ticker)).toContain("SPY");
    expect(summary.portfolioValue).toBeCloseTo(5_624);
    expect(summary.cash).toBeNull();

    const withAccount = applyWeights([closed, open], 20_000);
    expect(withAccount[1]?.weight).toBeCloseTo(28.12, 1);
    const funded = summarizePositions(withAccount, "2026-08-13T15:00:00.000Z", 20_000);
    expect(funded.accountValue).toBe(20_000);
    expect(funded.investedValue).toBeCloseTo(5_624);
    expect(funded.cash).toBeCloseTo(14_376);
    expect(funded.portfolioValue).toBe(20_000);
    expect(funded.intradayBuyingPower).toBe(80_000);
    expect(funded.overnightBuyingPower).toBe(40_000);
    expect(funded.optionBuyingPower).toBeCloseTo(14_376);
    expect(funded.dayPercent).toBeCloseTo(((562.4 - 560.1) * 10) / 20_000 * 100, 4);
  });

  it("attaches realized P&L from closed lots onto the remaining open name", () => {
    const open = enrichPosition(
      position({ ticker: "NVDA", side: "long", quantity: 100, entryPrice: 100 }),
      quote(110, 108),
      undefined,
      "2026-08-13T15:00:00.000Z",
    );
    const closed = enrichPosition(
      position({
        ticker: "NVDA",
        side: "long",
        quantity: 40,
        entryPrice: 100,
        status: "closed",
        closePrice: 108,
        closeDate: "2026-08-01",
      }),
      quote(110, 108),
      undefined,
      "2026-08-13T15:00:00.000Z",
    );
    const [openRow, closedRow] = attachRelatedRealized([open, closed]);
    expect(openRow?.relatedRealizedPnl).toBe(320);
    expect(openRow?.relatedRealizedPercent).toBeCloseTo(8);
    expect(closedRow?.relatedRealizedPnl).toBe(320);
    expect(attachRelatedRealized([open])[0]?.relatedRealizedPnl).toBeNull();
  });

  it("lists entries and exits newest first without filling missing P&L as zero", () => {
    const open = enrichPosition(
      position({
        id: "pos-nvda-open",
        ticker: "NVDA",
        side: "long",
        quantity: 100,
        entryPrice: 100,
        entryDate: "2026-06-12",
      }),
      quote(110, 108),
      undefined,
      "2026-08-13T15:00:00.000Z",
    );
    const closed = enrichPosition(
      position({
        id: "pos-nvda-trim",
        ticker: "NVDA",
        side: "long",
        quantity: 40,
        entryPrice: 100,
        entryDate: "2026-06-12",
        status: "closed",
        closePrice: 108,
        closeDate: "2026-07-30",
      }),
      quote(110, 108),
      undefined,
      "2026-08-13T15:00:00.000Z",
    );
    const events = buildPositionActivity([open, closed]);
    expect(events.map((event) => `${event.kind}:${event.date}`)).toEqual([
      "exit:2026-07-30",
      "entry:2026-06-12",
      "entry:2026-06-12",
    ]);
    expect(events[0]?.pnl).toBe(320);
    expect(events[1]?.pnl).toBeNull();
    expect(buildPositionActivity([])).toEqual([]);
  });

  it("builds a cumulative book series without filling missing days as zero trades", () => {
    const long = position({ ticker: "NVDA", side: "long", quantity: 10, entryPrice: 100 });
    const closes = new Map<string, DailyClose[]>([
      [
        "NVDA",
        [
          { date: "2026-08-11", close: 100 },
          { date: "2026-08-12", close: 110 },
          { date: "2026-08-13", close: 105 },
        ],
      ],
    ]);
    const series = buildPortfolioSeries([long], closes);
    expect(series.map((point) => point.dayPnl)).toEqual([0, 100, -50]);
    expect(series.at(-1)?.cumulativePnl).toBe(50);
    expect(series[0]?.carried.map((event) => event.ticker)).toEqual(["NVDA"]);
    expect(series[0]?.openCount).toBe(1);
    expect(series[1]?.leader).toEqual({ ticker: "NVDA", pnl: 100 });
  });

  it("marks opens and closes on the first session on or after the lot date", () => {
    const row = position({
      ticker: "QQQ",
      side: "long",
      quantity: 10,
      entryPrice: 100,
      entryDate: "2026-08-12",
      status: "closed",
      closeDate: "2026-08-13",
      closePrice: 110,
    });
    const series = buildPortfolioSeries(
      [row],
      new Map([
        [
          "QQQ",
          [
            { date: "2026-08-11", close: 100 },
            { date: "2026-08-12", close: 108 },
            { date: "2026-08-13", close: 110 },
          ],
        ],
      ]),
    );
    expect(series[1]?.events).toEqual([
      expect.objectContaining({ kind: "opened", ticker: "QQQ" }),
    ]);
    expect(series[2]?.events).toEqual([
      expect.objectContaining({ kind: "closed", ticker: "QQQ" }),
    ]);
    expect(series[2]?.openCount).toBe(0);
    expect(series[1]?.leader?.ticker).toBe("QQQ");
  });

  it("does not pin lots that closed before the plotted window onto the first bar", () => {
    const row = position({
      ticker: "QQQ",
      side: "long",
      quantity: 10,
      entryPrice: 100,
      entryDate: "2026-05-06",
      status: "closed",
      closeDate: "2026-08-05",
      closePrice: 110,
    });
    const series = buildPortfolioSeries(
      [row],
      new Map([
        [
          "QQQ",
          [
            { date: "2026-08-11", close: 100 },
            { date: "2026-08-12", close: 108 },
            { date: "2026-08-13", close: 110 },
          ],
        ],
      ]),
    );
    expect(series.every((point) => point.events.length === 0)).toBe(true);
    expect(series[0]?.carried).toEqual([]);
    expect(series.every((point) => point.openCount === 0)).toBe(true);
  });

  it("carries lots opened before the window and marks a close inside it", () => {
    const row = position({
      ticker: "QQQ",
      side: "long",
      quantity: 10,
      entryPrice: 100,
      entryDate: "2026-05-06",
      status: "closed",
      closeDate: "2026-08-12",
      closePrice: 110,
    });
    const series = buildPortfolioSeries(
      [row],
      new Map([
        [
          "QQQ",
          [
            { date: "2026-08-11", close: 108 },
            { date: "2026-08-12", close: 110 },
            { date: "2026-08-13", close: 111 },
          ],
        ],
      ]),
    );
    expect(series[0]?.carried.map((event) => event.ticker)).toEqual(["QQQ"]);
    expect(series[1]?.events).toEqual([
      expect.objectContaining({ kind: "closed", ticker: "QQQ" }),
    ]);
    expect(series[2]?.openCount).toBe(0);
  });

  it("does not treat a position as open before entry or after close", () => {
    const row = position({
      ticker: "MSFT",
      side: "long",
      entryDate: "2026-07-01",
      status: "closed",
      closeDate: "2026-08-05",
    });
    expect(wasOpenOn(row, "2026-06-30")).toBe(false);
    expect(wasOpenOn(row, "2026-07-01")).toBe(true);
    expect(wasOpenOn(row, "2026-08-04")).toBe(true);
    expect(wasOpenOn(row, "2026-08-05")).toBe(false);
  });
});
