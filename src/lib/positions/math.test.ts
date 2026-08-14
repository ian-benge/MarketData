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
    fees: overrides.fees ?? 0,
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
    expect(summary.pnlBeforeFees).toBeCloseTo(1_129);
    expect(summary.totalPnl).toBeCloseTo(1_129);
    expect(summary.closedCostBasis).toBeCloseTo(11_750);
    expect(summary.realizedReturnPercent).toBeCloseTo(4.297, 2);
    expect(summary.closedHitRate).toBe(100);
    expect(summary.winners.map((row) => row.ticker)).toContain("QQQ");
    expect(summary.portfolioValue).toBeCloseTo(5_624);
    expect(summary.cash).toBeNull();

    const withAccount = applyWeights([closed, open], 20_000);
    expect(withAccount[1]?.weight).toBeCloseTo(28.12, 1);
    const funded = summarizePositions(withAccount, "2026-08-13T15:00:00.000Z", 20_000);
    expect(funded.accountValue).toBe(20_000);
    expect(funded.investedValue).toBeCloseTo(5_624);
    expect(funded.cash).toBeCloseTo(14_376);
    expect(funded.portfolioValue).toBe(20_000);
    expect(funded.intradayBuyingPower).toBeNull();
    expect(funded.overnightBuyingPower).toBeNull();
    expect(funded.optionBuyingPower).toBeNull();
    expect(funded.dayPercent).toBeCloseTo(((562.4 - 560.1) * 10) / 20_000 * 100, 4);
  });

  it("sets cash equal to NAV when there are no open longs", () => {
    const closed = enrichPosition(
      position({
        ticker: "MSFT260202C00430000",
        assetType: "option",
        side: "short",
        quantity: 1,
        multiplier: 100,
        entryPrice: 1.06,
        status: "closed",
        closePrice: 1.32,
        closeDate: "2026-02-02",
        fees: 1.32,
      }),
      undefined,
      undefined,
      "2026-08-13T15:00:00.000Z",
    );
    const summary = summarizePositions([closed], "2026-08-13T15:00:00.000Z", 1.28);
    expect(summary.openCount).toBe(0);
    expect(summary.longExposure).toBeNull();
    expect(summary.cash).toBeCloseTo(1.28);
    expect(summary.portfolioValue).toBe(1.28);
    expect(summary.intradayBuyingPower).toBeNull();
  });

  it("does not inflate cash by short market value", () => {
    const short = enrichPosition(
      position({ ticker: "TLT", side: "short", quantity: 10, entryPrice: 100 }),
      quote(90, 95),
      undefined,
      "2026-08-13T15:00:00.000Z",
    );
    const summary = summarizePositions([short], "2026-08-13T15:00:00.000Z", 20_000);
    expect(summary.shortExposure).toBeCloseTo(900);
    expect(summary.longExposure).toBeNull();
    expect(summary.cash).toBe(20_000);
  });

  it("nets brokerage fees out of realized and total P&L", () => {
    const closed = enrichPosition(
      position({
        ticker: "QQQ",
        side: "long",
        quantity: 25,
        entryPrice: 470,
        status: "closed",
        closePrice: 490.2,
        closeDate: "2026-08-05",
        fees: 5,
      }),
      quote(492.15, 488.9),
      undefined,
      "2026-08-13T15:00:00.000Z",
    );
    expect(closed.grossRealizedPnl).toBeCloseTo(505);
    expect(closed.fees).toBe(5);
    expect(closed.realizedPnl).toBeCloseTo(500);
    expect(closed.totalPnl).toBeCloseTo(500);

    const option = enrichPosition(
      position({
        ticker: "AAPL250117C00150000",
        assetType: "option",
        side: "long",
        quantity: 2,
        multiplier: 100,
        entryPrice: 3.25,
        status: "closed",
        closePrice: 4.1,
        closeDate: "2026-08-05",
        fees: 1.3,
      }),
      undefined,
      undefined,
      "2026-08-13T15:00:00.000Z",
    );
    expect(option.grossRealizedPnl).toBeCloseTo(170);
    expect(option.realizedPnl).toBeCloseTo(168.7);

    const summary = summarizePositions([closed, option], "2026-08-13T15:00:00.000Z", null, 2);
    expect(summary.grossRealizedPnl).toBeCloseTo(675);
    expect(summary.pnlBeforeFees).toBeCloseTo(675);
    expect(summary.fees).toBeCloseTo(8.3);
    expect(summary.realizedPnl).toBeCloseTo(668.7);
    expect(summary.totalPnl).toBeCloseTo(666.7);
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

  it("builds a cumulative book series from fill cashflows, not equity bars", () => {
    const closed = position({
      ticker: "MSFT260202C00430000",
      assetType: "option",
      side: "short",
      quantity: 1,
      multiplier: 100,
      entryPrice: 1.06,
      entryDate: "2026-02-02",
      status: "closed",
      closePrice: 1.32,
      closeDate: "2026-02-02",
      fees: 1.32,
    });
    const later = position({
      id: "pos-later",
      ticker: "NVDA260203P00100000",
      assetType: "option",
      side: "long",
      quantity: 1,
      multiplier: 100,
      entryPrice: 2,
      entryDate: "2026-02-03",
      status: "closed",
      closePrice: 1.5,
      closeDate: "2026-02-03",
      fees: 1,
    });
    const series = buildPortfolioSeries([closed, later], new Map());
    expect(series.map((point) => point.date)).toEqual([
      "2026-02-02",
      "2026-02-03",
    ]);
    const first = signedPricePnl(1.32, 1.06, 1, 100, "short")! - 1.32;
    const second = signedPricePnl(1.5, 2, 1, 100, "long")! - 1;
    expect(series[0]?.dayPnl).toBeCloseTo(first);
    expect(series[1]?.dayPnl).toBeCloseTo(second);
    expect(series.at(-1)?.cumulativePnl).toBeCloseTo(first + second);
  });

  it("adds marked open lots onto the as-of point", () => {
    const open = position({ ticker: "AAPL", side: "long", quantity: 10, entryPrice: 100 });
    const quotes = new Map([
      [
        "AAPL",
        {
          ticker: "AAPL",
          last: 110,
          priorClose: 108,
          open: 108,
          changeAbsolute: 2,
          changePercent: 1.85,
          currency: "USD",
          stale: false,
        },
      ],
    ]);
    const series = buildPortfolioSeries([open], new Map(), {
      quotes,
      asOf: "2026-08-13T15:00:00.000Z",
    });
    expect(series.at(-1)?.date).toBe("2026-08-13");
    expect(series.at(-1)?.dayPnl).toBe(100);
    expect(series.at(-1)?.cumulativePnl).toBe(100);
  });

  it("marks opens and closes on the fill dates", () => {
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
    const series = buildPortfolioSeries([row], new Map());
    expect(series[0]?.date).toBe("2026-08-12");
    expect(series[0]?.events).toEqual([
      expect.objectContaining({ kind: "opened", ticker: "QQQ" }),
    ]);
    expect(series[1]?.events).toEqual([
      expect.objectContaining({ kind: "closed", ticker: "QQQ" }),
    ]);
    expect(series[1]?.openCount).toBe(0);
    expect(series[1]?.dayPnl).toBe(100);
  });

  it("includes a close that sits before any equity-bar window", () => {
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
    const series = buildPortfolioSeries([row], new Map());
    expect(series.some((point) => point.date === "2026-08-05")).toBe(true);
    expect(series.find((point) => point.date === "2026-08-05")?.dayPnl).toBe(100);
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
