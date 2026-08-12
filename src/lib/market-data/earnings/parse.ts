import type { EarningsSession } from "@/lib/market-data/earnings/types";

export function toNullableNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function toNullableInt(value: unknown): number | null {
  const parsed = toNullableNumber(value);
  if (parsed == null) return null;
  const rounded = Math.trunc(parsed);
  return Number.isFinite(rounded) ? rounded : null;
}

export function fiscalPeriodFromQuarterYear(
  quarter: number | null,
  year: number | null,
): string | null {
  if (quarter == null || year == null) return null;
  if (quarter < 1 || quarter > 4 || year < 1990 || year > 2100) return null;
  return `Q${quarter} ${year}`;
}

export function fiscalPeriodFromEnding(isoDate: string | null): string | null {
  if (!isoDate) return null;
  const month = Number(isoDate.slice(5, 7));
  const year = Number(isoDate.slice(0, 4));
  if (!Number.isFinite(month) || !Number.isFinite(year)) return null;
  const quarter = Math.ceil(month / 3);
  return fiscalPeriodFromQuarterYear(quarter, year);
}

export function normalizeFiscalPeriod(
  value: string | null | undefined,
): string | null {
  if (!value) return null;
  const trimmed = value.trim().toUpperCase().replace(/\s+/g, " ");
  const match = /^Q([1-4])(?:\s+FY)?\s*(\d{4})$/.exec(trimmed);
  if (!match) return trimmed || null;
  return `Q${match[1]} ${match[2]}`;
}

export function surprisePercent(
  actual: number | null | undefined,
  estimate: number | null | undefined,
): number | null {
  if (actual == null || estimate == null || !Number.isFinite(actual) || !Number.isFinite(estimate)) {
    return null;
  }
  if (estimate === 0) return null;
  return Math.round(((actual - estimate) / Math.abs(estimate)) * 1000) / 10;
}

export function surpriseAmount(
  actual: number | null | undefined,
  estimate: number | null | undefined,
): number | null {
  if (actual == null || estimate == null || !Number.isFinite(actual) || !Number.isFinite(estimate)) {
    return null;
  }
  return Math.round((actual - estimate) * 10000) / 10000;
}

export function mapEarningsSession(raw: string | null | undefined): EarningsSession {
  const value = (raw ?? "").trim().toLowerCase();
  if (value === "bmo" || value === "pre-market" || value === "premarket") {
    return "bmo";
  }
  if (value === "amc" || value === "post-market" || value === "postmarket") {
    return "amc";
  }
  if (value === "dmh" || value === "during" || value === "rth") {
    return "during";
  }
  return "unknown";
}
