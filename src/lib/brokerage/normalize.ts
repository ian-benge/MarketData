import { TICKER_PATTERN } from "@/lib/positions/schemas";
import { defaultMultiplier } from "@/lib/positions/math";
import type { PositionAssetType } from "@/lib/positions/types";
import type {
  HoldingSkip,
  NormalizedHolding,
  NormalizeHoldingsResult,
} from "./types";

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

function kindOf(raw: Record<string, unknown>): string {
  const instrument = asRecord(raw.instrument);
  const kind = asString(instrument?.kind) ?? asString(raw.kind);
  if (kind) return kind.toLowerCase();
  const nested = asRecord(asRecord(raw.symbol)?.symbol);
  const type = asRecord(nested?.type);
  const code = asString(type?.code)?.toLowerCase();
  if (code === "et" || code === "etf") return "etf";
  if (code === "op" || code === "option") return "option";
  if (code === "crypto") return "crypto";
  if (code === "fut" || code === "future") return "future";
  return "stock";
}

function mapAssetType(kind: string): PositionAssetType {
  if (kind === "etf" || kind === "cef") return "etf";
  if (kind === "option") return "option";
  if (kind === "future") return "future";
  if (kind === "crypto") return "crypto";
  if (kind === "stock" || kind === "adr") return "equity";
  return "other";
}

export function sanitizeTicker(raw: string): string | null {
  let next = raw.toUpperCase().replace(/\s+/g, "");
  if (next.startsWith("/")) {
    next = `${next.slice(1).replace(/[^A-Z0-9]/g, "")}=F`;
  }
  next = next.replace(/[^A-Z0-9.=^-]/g, "");
  if (next.length > 21) next = next.slice(0, 21);
  if (!TICKER_PATTERN.test(next)) return null;
  return next;
}

function extractTicker(raw: Record<string, unknown>): string | null {
  const instrument = asRecord(raw.instrument);
  const fromInstrument =
    asString(instrument?.raw_symbol) ?? asString(instrument?.symbol);
  if (fromInstrument) return sanitizeTicker(fromInstrument);

  const symbolWrap = asRecord(raw.symbol);
  const nested = asRecord(symbolWrap?.symbol);
  const fromLegacy =
    asString(nested?.raw_symbol) ??
    asString(nested?.symbol) ??
    asString(symbolWrap?.description);
  return fromLegacy ? sanitizeTicker(fromLegacy) : null;
}

function extractExternalId(
  raw: Record<string, unknown>,
  ticker: string,
  side: NormalizedHolding["side"],
): string {
  const instrument = asRecord(raw.instrument);
  const instrumentId = asString(instrument?.id);
  if (instrumentId) return instrumentId;
  const symbolWrap = asRecord(raw.symbol);
  const nested = asRecord(symbolWrap?.symbol);
  const legacyId = asString(nested?.id) ?? asString(symbolWrap?.id);
  if (legacyId) return legacyId;
  return `${ticker}:${side}`;
}

function extractMultiplier(
  raw: Record<string, unknown>,
  assetType: PositionAssetType,
): number {
  const instrument = asRecord(raw.instrument);
  const fromInstrument = asNumber(instrument?.multiplier);
  if (fromInstrument && fromInstrument > 0) return fromInstrument;
  return defaultMultiplier(assetType);
}

export function normalizeSnapTradePositions(
  rows: unknown[],
): NormalizeHoldingsResult {
  const holdings: NormalizedHolding[] = [];
  const skipped: HoldingSkip[] = [];
  const seen = new Set<string>();

  for (const item of rows) {
    const raw = asRecord(item);
    if (!raw) {
      skipped.push({ reason: "Unrecognized holding payload." });
      continue;
    }
    if (raw.cash_equivalent === true) {
      skipped.push({ reason: "Skipped cash-equivalent holding." });
      continue;
    }

    const ticker = extractTicker(raw);
    if (!ticker) {
      skipped.push({
        reason: "Holding ticker could not be mapped into the blotter.",
        ticker: asString(asRecord(raw.instrument)?.symbol) ?? undefined,
      });
      continue;
    }

    const units =
      asNumber(raw.units) ??
      asNumber(raw.quantity) ??
      asNumber(raw.open_units) ??
      asNumber(asRecord(raw.units)?.amount);
    if (units == null || units === 0) {
      skipped.push({ reason: "Holding has no quantity.", ticker });
      continue;
    }

    const side = units < 0 ? "short" : "long";
    const quantity = Math.abs(units);
    const kind = kindOf(raw);
    const assetType = mapAssetType(kind);
    const mark = asNumber(raw.price) ?? asNumber(raw.last_price);
    const entryPrice =
      asNumber(raw.cost_basis) ??
      asNumber(raw.average_purchase_price) ??
      asNumber(raw.average_price) ??
      mark;
    if (entryPrice == null || entryPrice <= 0) {
      skipped.push({ reason: "Holding is missing a cost basis.", ticker });
      continue;
    }

    const currency = (
      asString(raw.currency) ??
      asString(asRecord(raw.currency)?.code) ??
      "USD"
    ).slice(0, 8);
    const externalId = extractExternalId(raw, ticker, side);
    if (seen.has(externalId)) {
      skipped.push({ reason: "Duplicate holding identity.", ticker });
      continue;
    }
    seen.add(externalId);

    holdings.push({
      externalId,
      ticker,
      assetType,
      side,
      quantity,
      multiplier: extractMultiplier(raw, assetType),
      entryPrice,
      mark: mark != null && mark > 0 ? mark : null,
      currency: currency || "USD",
    });
  }

  return { holdings, skipped };
}

export function maskAccountNumber(value: string | null | undefined): string | null {
  if (!value) return null;
  const digits = value.replace(/\s+/g, "");
  if (digits.length < 4) return digits || null;
  return `…${digits.slice(-4)}`;
}

export function brokerageBookTitle(
  brokerageName: string,
  accountName: string | null | undefined,
  maskedNumber: string | null,
): string {
  const broker = brokerageName.trim() || "Brokerage";
  const account = (accountName ?? "").trim() || maskedNumber || "Account";
  const title = `${broker} · ${account}`.replace(/\s+/g, " ").trim();
  return title.slice(0, 80);
}
