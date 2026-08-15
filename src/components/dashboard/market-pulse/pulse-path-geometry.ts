/** SVG path helpers for Pulse Path. Keep fills under the printed series only. */

export function pulseLinePath(xs: number[], ys: number[]): string {
  if (!xs.length || xs.length !== ys.length) return "";
  return xs
    .map((x, index) => {
      const y = ys[index]!;
      return `${index === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

/**
 * Close the area at the first/last printed x, against the 50-score baseline.
 * Never stretch to the chart's right edge — that paints a wedge across empty
 * future session time (and weekend/premarket live overlays).
 */
export function pulseAreaPath(
  xs: number[],
  ys: number[],
  baselineY: number,
): string {
  if (xs.length < 2 || xs.length !== ys.length) return "";
  const line = pulseLinePath(xs, ys);
  const firstX = xs[0]!.toFixed(2);
  const lastX = xs.at(-1)!.toFixed(2);
  return `${line} L${lastX} ${baselineY.toFixed(2)} L${firstX} ${baselineY.toFixed(2)} Z`;
}

export function shouldOverlayLivePulse(input: {
  range: string;
  liveAt: string;
  lastAt: string | null;
  tradingDateKey: (iso: string) => string;
}): boolean {
  if (!input.lastAt) return true;
  if (input.range !== "1D") return true;
  return input.tradingDateKey(input.liveAt) === input.tradingDateKey(input.lastAt);
}
