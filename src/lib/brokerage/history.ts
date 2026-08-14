import { defaultMultiplier } from "@/lib/positions/math";
import type { PositionAssetType, PositionSide } from "@/lib/positions/types";
import { sanitizeTicker } from "./normalize";
import type { HoldingSkip } from "./types";

export const HISTORY_EXTERNAL_PREFIX = "hist:";

export type NormalizedFill = {
  id: string;
  ticker: string;
  assetType: PositionAssetType;
  side: "buy" | "sell";
  quantity: number;
  price: number;
  date: string;
  closedAt: string;
  currency: string;
  multiplier: number;
  fee: number;
  /** Expire/assign/exercise — close whatever inventory is open, do not open a new lot. */
  closesInventory?: boolean;
};

export type ImportedClosedLot = {
  externalId: string;
  ticker: string;
  assetType: PositionAssetType;
  side: PositionSide;
  quantity: number;
  multiplier: number;
  entryPrice: number;
  entryDate: string;
  closePrice: number;
  closeDate: string;
  closedAt: string;
  currency: string;
  fees: number;
};

export type NormalizeActivitiesResult = {
  fills: NormalizedFill[];
  skipped: HoldingSkip[];
  /** Commissions and cash fees on every activity, including rows we do not turn into lots. */
  activityFees: number;
};

export type MatchClosedLotsResult = {
  lots: ImportedClosedLot[];
  unmatched: number;
};

const TRADE_TYPES = new Set(["BUY", "SELL", "REI"]);
const CLOSE_TYPES = new Set([
  "OPTIONEXPIRATION",
  "OPTIONASSIGNMENT",
  "OPTIONEXERCISE",
]);
const CASH_FEE_TYPES = new Set(["FEE", "TAX"]);

function absFee(value: number | null): number {
  if (value == null || !Number.isFinite(value) || value === 0) return 0;
  return Math.abs(value);
}

function activityFee(raw: Record<string, unknown>, type: string): number {
  const fee = absFee(asNumber(raw.fee));
  if (fee > 0) return fee;
  if (CASH_FEE_TYPES.has(type)) return absFee(asNumber(raw.amount));
  return 0;
}

export function residualActivityFees(
  activityFees: number,
  lots: Array<{ fees: number }>,
): number {
  const allocated = lots.reduce((sum, lot) => sum + lot.fees, 0);
  const residual = activityFees - allocated;
  return residual > 1e-8 ? residual : 0;
}

const QTY_EPS = 1e-8;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function blotterDate(value: string | null): string | null {
  if (!value) return null;
  const day = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null;
}

function closedAtIso(value: string | null, day: string): string {
  if (value && !Number.isNaN(Date.parse(value))) {
    return new Date(value).toISOString();
  }
  return `${day}T21:00:00.000Z`;
}

function mapAssetType(code: string | null, isOption: boolean): PositionAssetType {
  if (isOption) return "option";
  const kind = (code ?? "").toLowerCase();
  if (kind === "et" || kind === "etf" || kind === "cef") return "etf";
  if (kind === "op" || kind === "option") return "option";
  if (kind === "crypto") return "crypto";
  if (kind === "fut" || kind === "future") return "future";
  if (kind === "cs" || kind === "stock" || kind === "adr" || kind === "equity") {
    return "equity";
  }
  return "other";
}

function extractTicker(raw: Record<string, unknown>): string | null {
  const option = asRecord(raw.option_symbol);
  const optionTicker = asString(option?.ticker);
  if (optionTicker) return sanitizeTicker(optionTicker);

  const symbol = asRecord(raw.symbol);
  const nested = asRecord(symbol?.symbol) ?? symbol;
  const fromSymbol =
    asString(nested?.raw_symbol) ??
    asString(nested?.symbol) ??
    asString(raw.ticker);
  return fromSymbol ? sanitizeTicker(fromSymbol) : null;
}

function fillSide(type: string, optionType: string | null): "buy" | "sell" | null {
  const option = (optionType ?? "").toUpperCase();
  if (option.includes("SELL")) return "sell";
  if (option.includes("BUY")) return "buy";
  if (type === "SELL") return "sell";
  if (type === "BUY" || type === "REI") return "buy";
  return null;
}

export function normalizeSnapTradeActivities(
  rows: unknown[],
): NormalizeActivitiesResult {
  const fills: NormalizedFill[] = [];
  const skipped: HoldingSkip[] = [];
  const seen = new Set<string>();
  let activityFees = 0;

  for (const item of rows) {
    const raw = asRecord(item);
    if (!raw) {
      skipped.push({ reason: "Unrecognized activity payload." });
      continue;
    }

    const type = (asString(raw.type) ?? "").toUpperCase();
    activityFees += activityFee(raw, type);
    if (CASH_FEE_TYPES.has(type)) {
      continue;
    }

    const isCloseEvent = CLOSE_TYPES.has(type);
    if (!TRADE_TYPES.has(type) && !isCloseEvent) {
      skipped.push({ reason: `Skipped ${type || "unknown"} activity.` });
      continue;
    }

    const id = asString(raw.id);
    if (!id) {
      skipped.push({ reason: "Activity is missing an id." });
      continue;
    }
    if (seen.has(id)) {
      skipped.push({ reason: "Duplicate activity id." });
      continue;
    }
    seen.add(id);

    const ticker = extractTicker(raw);
    if (!ticker) {
      skipped.push({ reason: "Activity ticker could not be mapped into the blotter." });
      continue;
    }

    const units = asNumber(raw.units);
    if (units == null || units === 0) {
      skipped.push({ reason: "Activity has no quantity.", ticker });
      continue;
    }

    const amount = asNumber(raw.amount);
    const quoted = asNumber(raw.price);
    const price =
      quoted != null && quoted >= 0
        ? quoted
        : amount != null && units !== 0
          ? Math.abs(amount / units)
          : isCloseEvent
            ? 0
            : null;
    if (price == null || price < 0) {
      skipped.push({ reason: "Activity is missing a fill price.", ticker });
      continue;
    }

    const tradeDateRaw = asString(raw.trade_date) ?? asString(raw.settlement_date);
    const date = blotterDate(tradeDateRaw);
    if (!date) {
      skipped.push({ reason: "Activity is missing a trade date.", ticker });
      continue;
    }

    const option = asRecord(raw.option_symbol);
    const isOption = Boolean(asString(option?.ticker)) || isCloseEvent;
    const typeWrap = asRecord(asRecord(raw.symbol)?.type);
    const assetType = mapAssetType(asString(typeWrap?.code), isOption);
    const side =
      fillSide(type, asString(raw.option_type)) ??
      (units < 0 ? "sell" : isCloseEvent ? "sell" : null);
    if (!side) {
      skipped.push({ reason: "Activity side could not be determined.", ticker });
      continue;
    }

    const currency = (
      asString(asRecord(raw.currency)?.code) ??
      asString(raw.currency) ??
      "USD"
    ).slice(0, 8);

    fills.push({
      id,
      ticker,
      assetType,
      side,
      quantity: Math.abs(units),
      price,
      date,
      closedAt: closedAtIso(tradeDateRaw, date),
      currency: currency || "USD",
      multiplier: defaultMultiplier(assetType),
      fee: activityFee(raw, type),
      closesInventory: isCloseEvent,
    });
  }

  fills.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    if (a.closedAt !== b.closedAt) return a.closedAt.localeCompare(b.closedAt);
    return a.id.localeCompare(b.id);
  });

  return { fills, skipped, activityFees };
}

type OpenFill = {
  id: string;
  qty: number;
  price: number;
  date: string;
  closedAt: string;
  assetType: PositionAssetType;
  multiplier: number;
  currency: string;
  fee: number;
};

function takeClosedLot(
  open: OpenFill,
  close: NormalizedFill,
  quantity: number,
  side: PositionSide,
  usedIds: Set<string>,
  fees: number,
): ImportedClosedLot {
  let externalId = `${HISTORY_EXTERNAL_PREFIX}${open.id}:${close.id}`;
  let n = 0;
  while (usedIds.has(externalId)) {
    n += 1;
    externalId = `${HISTORY_EXTERNAL_PREFIX}${open.id}:${close.id}:${n}`;
  }
  usedIds.add(externalId);
  const entryFirst = open.date <= close.date;
  return {
    externalId,
    ticker: close.ticker,
    assetType: close.assetType,
    side,
    quantity,
    multiplier: close.multiplier,
    entryPrice: open.price,
    entryDate: entryFirst ? open.date : close.date,
    closePrice: close.price,
    closeDate: entryFirst ? close.date : open.date,
    closedAt: close.closedAt,
    currency: close.currency || open.currency,
    fees,
  };
}

function matchAgainstQueue(
  queue: OpenFill[],
  fill: NormalizedFill,
  side: PositionSide,
  lots: ImportedClosedLot[],
  usedIds: Set<string>,
): number {
  let remaining = fill.quantity;
  while (remaining > QTY_EPS && queue.length) {
    const open = queue[0];
    if (!open) break;
    const qty = Math.min(open.qty, remaining);
    const openFee = open.qty > 0 ? open.fee * (qty / open.qty) : 0;
    const closeFee = fill.quantity > 0 ? fill.fee * (qty / fill.quantity) : 0;
    lots.push(takeClosedLot(open, fill, qty, side, usedIds, openFee + closeFee));
    open.fee -= openFee;
    open.qty -= qty;
    remaining -= qty;
    if (open.qty <= QTY_EPS) queue.shift();
  }
  return remaining;
}

export function matchClosedLots(fills: NormalizedFill[]): MatchClosedLotsResult {
  const longs = new Map<string, OpenFill[]>();
  const shorts = new Map<string, OpenFill[]>();
  const lots: ImportedClosedLot[] = [];
  const usedIds = new Set<string>();

  function queue(map: Map<string, OpenFill[]>, ticker: string): OpenFill[] {
    const existing = map.get(ticker);
    if (existing) return existing;
    const next: OpenFill[] = [];
    map.set(ticker, next);
    return next;
  }

  for (const fill of fills) {
    const open: OpenFill = {
      id: fill.id,
      qty: fill.quantity,
      price: fill.price,
      date: fill.date,
      closedAt: fill.closedAt,
      assetType: fill.assetType,
      multiplier: fill.multiplier,
      currency: fill.currency,
      fee: fill.fee,
    };
    if (fill.closesInventory) {
      const leftoverLong = matchAgainstQueue(
        queue(longs, fill.ticker),
        fill,
        "long",
        lots,
        usedIds,
      );
      if (leftoverLong > QTY_EPS) {
        matchAgainstQueue(
          queue(shorts, fill.ticker),
          {
            ...fill,
            quantity: leftoverLong,
            fee:
              fill.quantity > 0 ? fill.fee * (leftoverLong / fill.quantity) : 0,
          },
          "short",
          lots,
          usedIds,
        );
      }
      continue;
    }
    if (fill.side === "buy") {
      const leftover = matchAgainstQueue(
        queue(shorts, fill.ticker),
        fill,
        "short",
        lots,
        usedIds,
      );
      if (leftover > QTY_EPS) {
        queue(longs, fill.ticker).push({
          ...open,
          qty: leftover,
          fee: fill.quantity > 0 ? fill.fee * (leftover / fill.quantity) : 0,
        });
      }
    } else {
      const leftover = matchAgainstQueue(
        queue(longs, fill.ticker),
        fill,
        "long",
        lots,
        usedIds,
      );
      if (leftover > QTY_EPS) {
        queue(shorts, fill.ticker).push({
          ...open,
          qty: leftover,
          fee: fill.quantity > 0 ? fill.fee * (leftover / fill.quantity) : 0,
        });
      }
    }
  }

  let unmatched = 0;
  for (const list of [...longs.values(), ...shorts.values()]) {
    for (const lot of list) {
      if (lot.qty > QTY_EPS) unmatched += 1;
    }
  }

  return { lots, unmatched };
}
