export type ParsedOccOption = {
  underlying: string;
  expiry: string;
  expiryYear: number;
  expiryMonth: number;
  expiryDay: number;
  right: "C" | "P";
  strike: number;
  raw: string;
};

const OCC_COMPACT = /^([A-Z]{1,6})(\d{6})([CP])(\d{8})$/;
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

function compactOcc(ticker: string): string {
  return ticker.trim().toUpperCase().replace(/\s+/g, "");
}

function yymmddToParts(value: string): {
  expiry: string;
  year: number;
  month: number;
  day: number;
} | null {
  const year = Number(value.slice(0, 2));
  const month = Number(value.slice(2, 4));
  const day = Number(value.slice(4, 6));
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null;
  }
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const fullYear = year >= 70 ? 1900 + year : 2000 + year;
  const expiry = `${String(fullYear).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return { expiry, year: fullYear, month, day };
}

export function parseOccOptionSymbol(ticker: string): ParsedOccOption | null {
  const raw = ticker.trim();
  if (!raw) return null;
  const compact = compactOcc(raw);
  const match = OCC_COMPACT.exec(compact);
  if (!match) return null;
  const underlying = match[1]!;
  const parts = yymmddToParts(match[2]!);
  const right = match[3] as "C" | "P";
  const strikeRaw = Number(match[4]);
  if (!parts || !Number.isFinite(strikeRaw)) return null;
  return {
    underlying,
    expiry: parts.expiry,
    expiryYear: parts.year,
    expiryMonth: parts.month,
    expiryDay: parts.day,
    right,
    strike: strikeRaw / 1000,
    raw,
  };
}

export function formatOccStrike(strike: number): string {
  if (!Number.isFinite(strike)) return "";
  if (Number.isInteger(strike)) return String(strike);
  return strike.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
}

/** Desk blotter label, e.g. `MSFT  2 Feb 26  430 C`. */
export function formatOccOptionSymbol(parsed: ParsedOccOption): string {
  const month = MONTHS[parsed.expiryMonth - 1] ?? "";
  const yy = String(parsed.expiryYear).slice(-2);
  return `${parsed.underlying}  ${parsed.expiryDay} ${month} ${yy}  ${formatOccStrike(parsed.strike)} ${parsed.right}`;
}

export function displayPositionTicker(ticker: string): string {
  const parsed = parseOccOptionSymbol(ticker);
  return parsed ? formatOccOptionSymbol(parsed) : ticker;
}

export function optionIdentityKey(ticker: string): string | null {
  const parsed = parseOccOptionSymbol(ticker);
  if (!parsed) return null;
  return `${parsed.underlying}|${parsed.expiry}|${parsed.strike}|${parsed.right}`;
}
