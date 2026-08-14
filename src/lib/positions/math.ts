import { percentChange } from "@/lib/domain/market-math";
import { POSITION_ASSET_TYPES, type PositionAssetType } from "./types";
import type {
  DailyClose,
  EnrichedPosition,
  NamedContributor,
  PeriodMetrics,
  PortfolioEvent,
  PortfolioPoint,
  PortfolioSummary,
  PositionActivityEvent,
  PositionQuote,
  PositionRecord,
  PositionSide,
} from "./types";

export function defaultMultiplier(assetType: PositionAssetType): number {
  return assetType === "option" ? 100 : 1;
}

export function sideSign(side: PositionSide): 1 | -1 {
  return side === "short" ? -1 : 1;
}

export function notional(quantity: number, multiplier: number): number | null {
  if (!Number.isFinite(quantity) || !Number.isFinite(multiplier)) return null;
  if (quantity <= 0 || multiplier <= 0) return null;
  return quantity * multiplier;
}

function finite(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return value;
}

export function signedPricePnl(
  current: number | null | undefined,
  previous: number | null | undefined,
  quantity: number,
  multiplier: number,
  side: PositionSide,
): number | null {
  const units = notional(quantity, multiplier);
  const from = finite(previous);
  const to = finite(current);
  if (units == null || from == null || to == null) return null;
  return (to - from) * units * sideSign(side);
}

export function signedReturnPercent(
  current: number | null | undefined,
  previous: number | null | undefined,
  side: PositionSide,
): number | null {
  const move = percentChange(finite(current), finite(previous));
  if (move == null) return null;
  return move * sideSign(side);
}

export function positionFees(position: Pick<PositionRecord, "fees">): number {
  const value = finite(position.fees);
  return value != null && value > 0 ? value : 0;
}

function dateOnly(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
  return match?.[1] ?? null;
}

export function wasOpenOn(position: PositionRecord, date: string): boolean {
  const entry = dateOnly(position.entryDate);
  if (!entry || date < entry) return false;
  if (position.status === "open") return true;
  const close = dateOnly(position.closeDate ?? position.closedAt);
  if (!close) return false;
  return date < close;
}

export function holdingDays(
  position: PositionRecord,
  asOfDate: string,
): number | null {
  const entry = dateOnly(position.entryDate);
  const end =
    position.status === "closed"
      ? dateOnly(position.closeDate ?? position.closedAt)
      : dateOnly(asOfDate);
  if (!entry || !end) return null;
  const startMs = Date.parse(`${entry}T00:00:00Z`);
  const endMs = Date.parse(`${end}T00:00:00Z`);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) {
    return null;
  }
  return Math.floor((endMs - startMs) / 86_400_000);
}

export function sortedCloses(closes: DailyClose[] | undefined): DailyClose[] {
  if (!closes?.length) return [];
  return [...closes]
    .filter((bar) => Number.isFinite(bar.close) && /^\d{4}-\d{2}-\d{2}/.test(bar.date))
    .map((bar) => ({ date: bar.date.slice(0, 10), close: bar.close }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function closeOnOrBefore(
  closes: DailyClose[] | undefined,
  date: string,
): DailyClose | null {
  const sorted = sortedCloses(closes);
  for (let index = sorted.length - 1; index >= 0; index -= 1) {
    const bar = sorted[index]!;
    if (bar.date <= date) return bar;
  }
  return null;
}

export function lookbackClose(
  closes: DailyClose[] | undefined,
  sessionsAgo: number,
): DailyClose | null {
  const sorted = sortedCloses(closes);
  if (sessionsAgo < 1) return sorted.at(-1) ?? null;
  return sorted.at(-(sessionsAgo + 1)) ?? null;
}

function periodFromPrices(
  current: number | null,
  start: number | null,
  quantity: number,
  multiplier: number,
  side: PositionSide,
): PeriodMetrics {
  return {
    price: start,
    pnl: signedPricePnl(current, start, quantity, multiplier, side),
    percent: signedReturnPercent(current, start, side),
  };
}

function startPriceForLookback(
  position: PositionRecord,
  closes: DailyClose[] | undefined,
  sessionsAgo: number,
  fallback: number | null,
): number | null {
  const bar = lookbackClose(closes, sessionsAgo);
  const entry = dateOnly(position.entryDate);
  if (!bar || (entry && bar.date < entry)) {
    return finite(position.entryPrice) ?? fallback;
  }
  return bar.close;
}

export function positionSparkline(
  position: PositionRecord,
  closes: DailyClose[] | undefined,
  limit = 20,
): number[] {
  const sorted = sortedCloses(closes);
  if (sorted.length < 2) return [];
  const window = sorted.slice(-limit);
  let cumulative = 0;
  const points: number[] = [];
  for (let index = 0; index < window.length; index += 1) {
    const bar = window[index]!;
    if (!wasOpenOn(position, bar.date)) continue;
    const previous =
      index === 0
        ? finite(position.entryPrice)
        : wasOpenOn(position, window[index - 1]!.date)
          ? window[index - 1]!.close
          : finite(position.entryPrice);
    const pnl = signedPricePnl(
      bar.close,
      previous,
      position.quantity,
      position.multiplier,
      position.side,
    );
    if (pnl == null) continue;
    cumulative += pnl;
    points.push(cumulative);
  }
  return points;
}

function missingFields(row: EnrichedPosition): string[] {
  const missing: string[] = [];
  if (row.status === "open" && row.last == null) missing.push("last");
  if (row.status === "open" && row.dayPnl == null) missing.push("dayPnl");
  if (row.change1w.pnl == null) missing.push("1w");
  if (row.change1m.pnl == null) missing.push("1m");
  return missing;
}

export function enrichPosition(
  position: PositionRecord,
  quote: PositionQuote | undefined,
  closes: DailyClose[] | undefined,
  asOf: string,
): EnrichedPosition {
  const asOfDate = dateOnly(asOf) ?? dateOnly(position.updatedAt) ?? position.entryDate;
  const units = notional(position.quantity, position.multiplier) ?? 0;
  const entry = finite(position.entryPrice) ?? 0;
  const costBasis = entry * units;
  const last = finite(quote?.last);
  const priorClose = finite(quote?.priorClose);
  const closePrice = finite(position.closePrice);
  const mark = position.status === "closed" ? closePrice : last;
  const marketValue =
    position.status === "open" && last != null ? last * units : null;
  const signedMarketValue =
    marketValue == null ? null : marketValue * sideSign(position.side);
  const unrealizedPnl =
    position.status === "open"
      ? signedPricePnl(last, entry, position.quantity, position.multiplier, position.side)
      : null;
  const fees = positionFees(position);
  const grossRealizedPnl =
    position.status === "closed"
      ? signedPricePnl(
          closePrice,
          entry,
          position.quantity,
          position.multiplier,
          position.side,
        )
      : null;
  const realizedPnl =
    grossRealizedPnl == null ? null : grossRealizedPnl - fees;
  const totalPnl = position.status === "closed" ? realizedPnl : unrealizedPnl;
  const returnPercent = signedReturnPercent(mark, entry, position.side);
  const closedToday =
    position.status === "closed" &&
    dateOnly(position.closeDate ?? position.closedAt) === asOfDate;
  const dayEnd = closedToday ? closePrice : last;
  const dayPnl =
    position.status === "closed" && !closedToday
      ? null
      : signedPricePnl(
          dayEnd,
          priorClose,
          position.quantity,
          position.multiplier,
          position.side,
        );
  const dayPercent =
    position.status === "closed" && !closedToday
      ? null
      : signedReturnPercent(dayEnd, priorClose, position.side);

  const change1d = periodFromPrices(
    mark,
    priorClose ?? startPriceForLookback(position, closes, 1, entry),
    position.quantity,
    position.multiplier,
    position.side,
  );
  const change1w = periodFromPrices(
    mark,
    startPriceForLookback(position, closes, 5, entry),
    position.quantity,
    position.multiplier,
    position.side,
  );
  const change1m = periodFromPrices(
    mark,
    startPriceForLookback(position, closes, 21, entry),
    position.quantity,
    position.multiplier,
    position.side,
  );
  const sinceEntry = periodFromPrices(
    mark,
    entry,
    position.quantity,
    position.multiplier,
    position.side,
  );

  const row: EnrichedPosition = {
    ...position,
    last,
    priorClose,
    mark,
    currency: quote?.currency ?? position.currency,
    costBasis,
    marketValue,
    signedMarketValue,
    weight: null,
    unrealizedPnl,
    realizedPnl,
    totalPnl,
    returnPercent,
    dayPnl,
    dayPercent,
    change1d,
    change1w,
    change1m,
    sinceEntry,
    holdingDays: holdingDays(position, asOfDate),
    quoteStale: quote?.stale === true,
    missing: [],
    sparkline: positionSparkline(position, closes),
    relatedRealizedPnl: null,
    relatedRealizedPercent: null,
    fees,
    grossRealizedPnl,
  };
  row.missing = missingFields(row);
  return row;
}

function sum(values: Array<number | null | undefined>): number | null {
  let total = 0;
  let seen = false;
  for (const value of values) {
    if (value == null || !Number.isFinite(value)) continue;
    total += value;
    seen = true;
  }
  return seen ? total : null;
}

function mean(values: number[]): number | null {
  if (!values.length) return null;
  return values.reduce((acc, value) => acc + value, 0) / values.length;
}

function allocation(
  rows: EnrichedPosition[],
  keyFor: (row: EnrichedPosition) => string,
  labelFor: (key: string) => string,
  gross: number | null,
) {
  const buckets = new Map<string, number>();
  for (const row of rows) {
    if (row.status !== "open" || row.marketValue == null) continue;
    const key = keyFor(row) || "unspecified";
    buckets.set(key, (buckets.get(key) ?? 0) + row.marketValue);
  }
  return [...buckets.entries()]
    .map(([key, value]) => ({
      key,
      label: labelFor(key),
      value,
      weight: gross && gross > 0 ? (value / gross) * 100 : null,
    }))
    .sort((a, b) => b.value - a.value);
}

function contributors(
  rows: EnrichedPosition[],
  direction: "winners" | "losers",
): NamedContributor[] {
  const ranked = rows
    .filter((row) => row.totalPnl != null)
    .sort((a, b) =>
      direction === "winners"
        ? (b.totalPnl ?? 0) - (a.totalPnl ?? 0)
        : (a.totalPnl ?? 0) - (b.totalPnl ?? 0),
    )
    .filter((row) =>
      direction === "winners" ? (row.totalPnl ?? 0) > 0 : (row.totalPnl ?? 0) < 0,
    )
    .slice(0, 3);
  return ranked.map((row) => ({
    id: row.id,
    ticker: row.ticker,
    side: row.side,
    pnl: row.totalPnl ?? 0,
    percent: row.returnPercent,
  }));
}

const ASSET_LABELS: Record<PositionAssetType, string> = {
  equity: "Equity",
  etf: "ETF",
  option: "Option",
  future: "Future",
  crypto: "Crypto",
  other: "Other",
};

export function summarizePositions(
  rows: EnrichedPosition[],
  asOf: string,
  accountValue: number | null = null,
  extraFees = 0,
): PortfolioSummary {
  const open = rows.filter((row) => row.status === "open");
  const closed = rows.filter((row) => row.status === "closed");
  const longs = open.filter((row) => row.side === "long");
  const shorts = open.filter((row) => row.side === "short");
  const longExposure = sum(longs.map((row) => row.marketValue));
  const shortExposure = sum(shorts.map((row) => row.marketValue));
  const grossExposure =
    longExposure == null && shortExposure == null
      ? null
      : (longExposure ?? 0) + (shortExposure ?? 0);
  const netExposure =
    longExposure == null && shortExposure == null
      ? null
      : (longExposure ?? 0) - (shortExposure ?? 0);
  const costBasis = sum(open.map((row) => row.costBasis));
  const closedCostBasis = sum(closed.map((row) => row.costBasis));
  const unrealizedPnl = sum(open.map((row) => row.unrealizedPnl));
  const grossRealizedPnl = sum(closed.map((row) => row.grossRealizedPnl));
  const lotFees = closed.reduce((acc, row) => acc + positionFees(row), 0);
  const otherFees = extraFees > 0 ? extraFees : 0;
  const fees = lotFees + otherFees;
  const realizedPnl =
    grossRealizedPnl == null ? null : grossRealizedPnl - lotFees;
  const pnlBeforeFees = sum([unrealizedPnl, grossRealizedPnl]);
  const totalPnl = sum([unrealizedPnl, realizedPnl, otherFees ? -otherFees : null]);
  const dayPnl = sum(open.map((row) => row.dayPnl));
  const quotedCount = open.filter((row) => row.last != null).length;
  const weights = open
    .map((row) => row.weight)
    .filter((value): value is number => value != null);
  const pnls = open
    .map((row) => row.unrealizedPnl)
    .filter((value): value is number => value != null);
  const winners = pnls.filter((value) => value > 0);
  const losers = pnls.filter((value) => value < 0);
  const closedPnls = closed
    .map((row) => row.realizedPnl)
    .filter((value): value is number => value != null);
  const closedWinners = closedPnls.filter((value) => value > 0);
  const asOfDate = dateOnly(asOf);
  const investedValue = longExposure;
  const normalizedAccount =
    accountValue != null && Number.isFinite(accountValue) && accountValue >= 0
      ? accountValue
      : null;
  const cash =
    normalizedAccount != null && investedValue != null
      ? normalizedAccount - investedValue
      : null;
  const portfolioValue = normalizedAccount ?? investedValue;
  const intradayBuyingPower =
    normalizedAccount != null ? normalizedAccount * 4 : null;
  const overnightBuyingPower =
    normalizedAccount != null ? normalizedAccount * 2 : null;
  const optionBuyingPower = cash;
  const dayBase =
    normalizedAccount != null
      ? normalizedAccount
      : grossExposure && grossExposure > 0
        ? grossExposure
        : null;

  return {
    openCount: open.length,
    closedCount: closed.length,
    longCount: longs.length,
    shortCount: shorts.length,
    quotedCount,
    grossExposure,
    netExposure,
    longExposure,
    shortExposure,
    netExposurePercent:
      grossExposure && grossExposure > 0 && netExposure != null
        ? (netExposure / grossExposure) * 100
        : null,
    longShortRatio:
      shortExposure && shortExposure > 0 && longExposure != null
        ? longExposure / shortExposure
        : null,
    accountValue: normalizedAccount,
    cash,
    investedValue,
    portfolioValue,
    intradayBuyingPower,
    overnightBuyingPower,
    optionBuyingPower,
    costBasis,
    closedCostBasis,
    unrealizedPnl,
    realizedPnl,
    realizedReturnPercent:
      closedCostBasis && closedCostBasis > 0 && realizedPnl != null
        ? (realizedPnl / closedCostBasis) * 100
        : null,
    closedHitRate: closedPnls.length
      ? (closedWinners.length / closedPnls.length) * 100
      : null,
    closedAverageHoldingDays: mean(
      closed
        .map((row) => holdingDays(row, asOfDate ?? row.closeDate ?? row.entryDate))
        .filter((value): value is number => value != null),
    ),
    totalPnl,
    pnlBeforeFees,
    fees: fees > 0 ? fees : closed.length ? 0 : extraFees > 0 ? extraFees : null,
    grossRealizedPnl,
    bookReturnPercent:
      costBasis && costBasis > 0 && unrealizedPnl != null
        ? (unrealizedPnl / costBasis) * 100
        : null,
    dayPnl,
    dayPercent:
      dayBase && dayBase > 0 && dayPnl != null ? (dayPnl / dayBase) * 100 : null,
    change1wPnl: sum(open.map((row) => row.change1w.pnl)),
    change1mPnl: sum(open.map((row) => row.change1m.pnl)),
    largestWeight: weights.length ? Math.max(...weights) : null,
    herfindahl: weights.length
      ? weights.reduce((acc, weight) => acc + (weight / 100) ** 2, 0)
      : null,
    hitRate: pnls.length ? (winners.length / pnls.length) * 100 : null,
    averageWinner: mean(winners),
    averageLoser: mean(losers),
    averageHoldingDays: mean(
      open
        .map((row) => holdingDays(row, dateOnly(asOf) ?? row.entryDate))
        .filter((value): value is number => value != null),
    ),
    winners: contributors(open, "winners"),
    losers: contributors(open, "losers"),
    bySide: allocation(
      open,
      (row) => row.side,
      (key) => (key === "short" ? "Short" : "Long"),
      grossExposure,
    ),
    byAssetType: allocation(
      open,
      (row) => row.assetType,
      (key) => ASSET_LABELS[key as PositionAssetType] ?? key,
      grossExposure,
    ),
    byStrategy: allocation(
      open,
      (row) => row.strategy?.trim() || "unspecified",
      (key) => (key === "unspecified" ? "Unspecified" : key),
      grossExposure,
    ),
  };
}

function nameKey(row: { ticker: string; side: string }) {
  return `${row.ticker.toUpperCase()}:${row.side}`;
}

export function attachRelatedRealized(
  rows: EnrichedPosition[],
): EnrichedPosition[] {
  const pnlByName = new Map<string, number>();
  const costByName = new Map<string, number>();
  for (const row of rows) {
    if (row.status !== "closed") continue;
    const key = nameKey(row);
    if (row.realizedPnl != null) {
      pnlByName.set(key, (pnlByName.get(key) ?? 0) + row.realizedPnl);
    }
    costByName.set(key, (costByName.get(key) ?? 0) + row.costBasis);
  }
  return rows.map((row) => {
    if (row.status !== "open") {
      return {
        ...row,
        relatedRealizedPnl: row.realizedPnl,
        relatedRealizedPercent: row.returnPercent,
      };
    }
    const key = nameKey(row);
    const pnl = pnlByName.get(key);
    if (pnl == null) {
      return { ...row, relatedRealizedPnl: null, relatedRealizedPercent: null };
    }
    const cost = costByName.get(key);
    return {
      ...row,
      relatedRealizedPnl: pnl,
      relatedRealizedPercent: cost && cost > 0 ? (pnl / cost) * 100 : null,
    };
  });
}

export function buildPositionActivity(
  rows: EnrichedPosition[],
): PositionActivityEvent[] {
  const events: PositionActivityEvent[] = [];
  for (const row of rows) {
    const entryDate = dateOnly(row.entryDate);
    if (entryDate) {
      events.push({
        id: `${row.id}:entry`,
        positionId: row.id,
        kind: "entry",
        date: entryDate,
        ticker: row.ticker,
        side: row.side,
        quantity: row.quantity,
        multiplier: row.multiplier,
        price: row.entryPrice,
        strategy: row.strategy,
        pnl: null,
        returnPercent: null,
        holdingDays: null,
      });
    }
    if (row.status !== "closed") continue;
    const exitDate = dateOnly(row.closeDate ?? row.closedAt);
    if (!exitDate) continue;
    events.push({
      id: `${row.id}:exit`,
      positionId: row.id,
      kind: "exit",
      date: exitDate,
      ticker: row.ticker,
      side: row.side,
      quantity: row.quantity,
      multiplier: row.multiplier,
      price: row.closePrice,
      strategy: row.strategy,
      pnl: row.realizedPnl,
      returnPercent: row.returnPercent,
      holdingDays: row.holdingDays,
    });
  }
  events.sort((a, b) => {
    const byDate = b.date.localeCompare(a.date);
    if (byDate !== 0) return byDate;
    if (a.kind !== b.kind) return a.kind === "exit" ? -1 : 1;
    const byTicker = a.ticker.localeCompare(b.ticker);
    if (byTicker !== 0) return byTicker;
    return a.positionId.localeCompare(b.positionId);
  });
  return events;
}

export function applyWeights(
  rows: EnrichedPosition[],
  accountValue: number | null = null,
): EnrichedPosition[] {
  const gross = sum(
    rows
      .filter((row) => row.status === "open")
      .map((row) => row.marketValue),
  );
  const base =
    accountValue != null && Number.isFinite(accountValue) && accountValue >= 0
      ? accountValue
      : gross;
  return rows.map((row) => ({
    ...row,
    weight:
      row.status === "open" && row.marketValue != null && base && base > 0
        ? (row.marketValue / base) * 100
        : null,
  }));
}

function firstDateOnOrAfter(ordered: string[], date: string): string | null {
  return ordered.find((value) => value >= date) ?? null;
}

function eventFor(
  position: PositionRecord,
  kind: PortfolioEvent["kind"],
): PortfolioEvent {
  return {
    kind,
    id: position.id,
    ticker: position.ticker,
    side: position.side,
  };
}

export function buildPortfolioSeries(
  positions: PositionRecord[],
  closesByTicker: Map<string, DailyClose[]>,
  limit = 252,
): PortfolioPoint[] {
  const dates = new Set<string>();
  for (const closes of closesByTicker.values()) {
    for (const bar of sortedCloses(closes)) dates.add(bar.date);
  }
  const ordered = [...dates].sort((a, b) => a.localeCompare(b)).slice(-limit);
  const firstDate = ordered[0] ?? null;
  const eventsByDate = new Map<string, PortfolioEvent[]>();
  const carried: PortfolioEvent[] = [];

  function pushEvent(date: string | null, event: PortfolioEvent) {
    if (!date) return;
    const current = eventsByDate.get(date) ?? [];
    current.push(event);
    eventsByDate.set(date, current);
  }

  for (const position of positions) {
    const entry = dateOnly(position.entryDate);
    const close =
      position.status === "closed"
        ? dateOnly(position.closeDate ?? position.closedAt)
        : null;
    if (close && firstDate && close < firstDate) continue;
    if (entry && firstDate && entry < firstDate) {
      carried.push(eventFor(position, "opened"));
    } else if (entry) {
      pushEvent(firstDateOnOrAfter(ordered, entry), eventFor(position, "opened"));
    }
    if (close) {
      pushEvent(firstDateOnOrAfter(ordered, close), eventFor(position, "closed"));
    }
  }

  let cumulative = 0;
  const points: PortfolioPoint[] = [];
  for (let index = 0; index < ordered.length; index += 1) {
    const date = ordered[index]!;
    const previousDate = index > 0 ? ordered[index - 1]! : null;
    let dayPnl: number | null = null;
    let openCount = 0;
    let leader: PortfolioPoint["leader"] = null;
    for (const position of positions) {
      if (!wasOpenOn(position, date)) continue;
      openCount += 1;
      const closes = closesByTicker.get(position.ticker.toUpperCase());
      const current = closeOnOrBefore(closes, date);
      if (!current) continue;
      const previous = previousDate && wasOpenOn(position, previousDate)
        ? closeOnOrBefore(closes, previousDate)?.close
        : position.entryPrice;
      const pnl = signedPricePnl(
        current.close,
        previous,
        position.quantity,
        position.multiplier,
        position.side,
      );
      if (pnl == null) continue;
      dayPnl = (dayPnl ?? 0) + pnl;
      if (!leader || Math.abs(pnl) > Math.abs(leader.pnl)) {
        leader = { ticker: position.ticker, pnl };
      }
    }
    if (dayPnl != null) cumulative += dayPnl;
    points.push({
      date,
      dayPnl,
      cumulativePnl: dayPnl == null && points.length === 0 ? null : cumulative,
      openCount,
      events: eventsByDate.get(date) ?? [],
      carried: index === 0 ? carried : [],
      leader,
    });
  }
  return points;
}

export function emptySummary(): PortfolioSummary {
  return {
    openCount: 0,
    closedCount: 0,
    longCount: 0,
    shortCount: 0,
    quotedCount: 0,
    grossExposure: null,
    netExposure: null,
    longExposure: null,
    shortExposure: null,
    netExposurePercent: null,
    longShortRatio: null,
    accountValue: null,
    cash: null,
    investedValue: null,
    portfolioValue: null,
    intradayBuyingPower: null,
    overnightBuyingPower: null,
    optionBuyingPower: null,
    costBasis: null,
    closedCostBasis: null,
    unrealizedPnl: null,
    realizedPnl: null,
    realizedReturnPercent: null,
    closedHitRate: null,
    closedAverageHoldingDays: null,
    totalPnl: null,
    pnlBeforeFees: null,
    fees: null,
    grossRealizedPnl: null,
    bookReturnPercent: null,
    dayPnl: null,
    dayPercent: null,
    change1wPnl: null,
    change1mPnl: null,
    largestWeight: null,
    herfindahl: null,
    hitRate: null,
    averageWinner: null,
    averageLoser: null,
    averageHoldingDays: null,
    winners: [],
    losers: [],
    bySide: [],
    byAssetType: [],
    byStrategy: [],
  };
}

export function isAssetType(value: string): value is PositionAssetType {
  return (POSITION_ASSET_TYPES as readonly string[]).includes(value);
}
