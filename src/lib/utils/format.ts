export const MARKET_TIME_ZONE = "America/Chicago";

const PRICE_0_DECIMAL = new Set(["BTC-USD", "ETH-USD"]);
const PRICE_3_DECIMAL = new Set(["UUP"]);

function asDate(value: string | Date): Date {
  return value instanceof Date ? value : new Date(value);
}

export function formatMarketDateTime(
  value: string | Date | null | undefined,
  options: { seconds?: boolean; date?: boolean } = {},
): string {
  if (!value) return "—";
  const date = asDate(value);
  if (Number.isNaN(date.getTime())) return "—";

  const formatted = new Intl.DateTimeFormat("en-US", {
    timeZone: MARKET_TIME_ZONE,
    month: options.date === false ? undefined : "short",
    day: options.date === false ? undefined : "numeric",
    year: options.date === false ? undefined : "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: options.seconds ? "2-digit" : undefined,
    hour12: true,
  })
    .format(date)
    .replace(/\bAM\b/, "a.m.")
    .replace(/\bPM\b/, "p.m.");

  return `${formatted} CT`;
}

export function formatMarketTime(
  value: string | Date | null | undefined,
  seconds = false,
): string {
  return formatMarketDateTime(value, { seconds, date: false });
}

export function formatPrice(
  value: number | null | undefined,
  ticker?: string,
): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const digits = ticker && PRICE_0_DECIMAL.has(ticker)
    ? 0
    : ticker && PRICE_3_DECIMAL.has(ticker)
      ? 3
      : Math.abs(value) < 1
        ? 4
        : 2;
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

export function formatSignedPercent(
  value: number | null | undefined,
  digits = 2,
): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${Math.abs(value).toFixed(digits)}%`;
}

export function formatSignedNumber(
  value: number | null | undefined,
  digits = 2,
): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${Math.abs(value).toFixed(digits)}`;
}

export function formatCurrency(
  value: number | null | undefined,
  options: { compact?: boolean; digits?: number } = {},
): string {
  if (value == null || !Number.isFinite(value)) return "—";
  if (options.compact && Math.abs(value) >= 10_000) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(value);
  }
  const digits = options.digits ?? 2;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

export function formatSignedCurrency(
  value: number | null | undefined,
  options: { compact?: boolean } = {},
): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  const formatted = formatCurrency(Math.abs(value), options);
  if (formatted === "—") return "—";
  return `${sign}${formatted}`;
}

export function formatCompactCurrency(value: number | null | undefined): string {
  return formatCurrency(value, { compact: true });
}

export function formatQuantity(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const digits = Number.isInteger(value) ? 0 : Math.abs(value) < 1 ? 4 : 2;
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

export function formatRelativeVolume(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value.toFixed(2)}x`;
}

export function formatVolume(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: value >= 1_000_000 ? 1 : 0,
  }).format(value);
}

export function marketTone(
  value: number | null | undefined,
): "positive" | "negative" | "neutral" {
  if (value == null || !Number.isFinite(value) || value === 0) return "neutral";
  return value > 0 ? "positive" : "negative";
}
