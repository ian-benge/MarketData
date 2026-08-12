/**
 * Pure market arithmetic. Never coerce null/undefined to 0.
 */

export function percentChange(
  current: number | null | undefined,
  previous: number | null | undefined,
): number | null {
  if (current == null || previous == null) return null;
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return null;
  if (previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

export function absoluteChange(
  current: number | null | undefined,
  previous: number | null | undefined,
): number | null {
  if (current == null || previous == null) return null;
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return null;
  return current - previous;
}

export type FormatMoveOptions = {
  absoluteDecimals?: number;
  percentDecimals?: number;
  currencySymbol?: string;
};

/**
 * Formats absolute and percent moves for display, e.g. "+1.25 (+0.82%)".
 * Returns null when either component is null.
 */
export function formatMove(
  absolute: number | null | undefined,
  percent: number | null | undefined,
  options: FormatMoveOptions = {},
): string | null {
  if (absolute == null || percent == null) return null;
  if (!Number.isFinite(absolute) || !Number.isFinite(percent)) return null;

  const {
    absoluteDecimals = 2,
    percentDecimals = 2,
    currencySymbol = "",
  } = options;

  const absSign = absolute > 0 ? "+" : absolute < 0 ? "" : "";
  const pctSign = percent > 0 ? "+" : percent < 0 ? "" : "";
  const absFormatted = `${absSign}${currencySymbol}${absolute.toFixed(absoluteDecimals)}`;
  const pctFormatted = `${pctSign}${percent.toFixed(percentDecimals)}%`;
  return `${absFormatted} (${pctFormatted})`;
}
