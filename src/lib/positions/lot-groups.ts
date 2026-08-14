import { optionIdentityKey, parseOccOptionSymbol } from "./option-symbol";
import type { EnrichedPosition } from "./types";

function dateOnly(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
  return match?.[1] ?? null;
}

export function fillGroupKey(row: EnrichedPosition): string {
  const day =
    dateOnly(
      row.status === "closed"
        ? (row.closeDate ?? row.closedAt)
        : row.entryDate,
    ) ?? "";
  const identity = optionIdentityKey(row.ticker);
  if (identity) return `${identity}|${row.side}|${day}`;
  return `${row.ticker.toUpperCase()}||${row.side}|${day}`;
}

function weightedPrice(
  rows: EnrichedPosition[],
  pick: (row: EnrichedPosition) => number | null,
): number | null {
  let notional = 0;
  let weight = 0;
  for (const row of rows) {
    const price = pick(row);
    if (price == null || !Number.isFinite(price)) continue;
    const qty = row.quantity * row.multiplier;
    if (!(qty > 0)) continue;
    notional += price * qty;
    weight += qty;
  }
  return weight > 0 ? notional / weight : null;
}

function sumNullable(values: Array<number | null | undefined>): number | null {
  let total = 0;
  let seen = false;
  for (const value of values) {
    if (value == null || !Number.isFinite(value)) continue;
    total += value;
    seen = true;
  }
  return seen ? total : null;
}

export type GroupedLot = {
  id: string;
  key: string;
  row: EnrichedPosition;
  fills: EnrichedPosition[];
};

export function groupLotsForBlotter(rows: EnrichedPosition[]): GroupedLot[] {
  const buckets = new Map<string, EnrichedPosition[]>();
  const order: string[] = [];
  for (const row of rows) {
    const key = fillGroupKey(row);
    const current = buckets.get(key);
    if (current) {
      current.push(row);
    } else {
      buckets.set(key, [row]);
      order.push(key);
    }
  }
  return order.map((key) => {
    const fills = buckets.get(key)!;
    if (fills.length === 1) {
      return { id: fills[0]!.id, key, row: fills[0]!, fills };
    }
    const first = fills[0]!;
    const quantity = fills.reduce((acc, row) => acc + row.quantity, 0);
    const fees = fills.reduce((acc, row) => acc + row.fees, 0);
    const realizedPnl = sumNullable(fills.map((row) => row.realizedPnl));
    const grossRealizedPnl = sumNullable(fills.map((row) => row.grossRealizedPnl));
    const costBasis = fills.reduce((acc, row) => acc + row.costBasis, 0);
    const entryPrice = weightedPrice(fills, (row) => row.entryPrice) ?? first.entryPrice;
    const closePrice = weightedPrice(fills, (row) => row.closePrice);
    const mark = first.status === "closed" ? closePrice : first.mark;
    const parsed = parseOccOptionSymbol(first.ticker);
    const sparkline =
      realizedPnl != null ? [0, realizedPnl] : first.sparkline;
    const row: EnrichedPosition = {
      ...first,
      id: `group:${key}`,
      quantity,
      entryPrice,
      closePrice,
      mark,
      last: first.status === "open" ? first.last : null,
      fees,
      costBasis,
      realizedPnl,
      grossRealizedPnl,
      totalPnl: first.status === "closed" ? realizedPnl : first.totalPnl,
      returnPercent:
        costBasis > 0 && realizedPnl != null ? (realizedPnl / costBasis) * 100 : first.returnPercent,
      sparkline,
      notes: parsed
        ? `${fills.length} fills · ${parsed.underlying}`
        : `${fills.length} fills`,
    };
    return { id: row.id, key, row, fills };
  });
}
