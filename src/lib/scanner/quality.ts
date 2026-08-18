import type { AlertQualityReport, QualitySample } from "./types";

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1]! + sorted[mid]!) / 2;
  }
  return sorted[mid]!;
}

function pct(entry: number, price: number): number {
  return ((price - entry) / entry) * 100;
}

/**
 * Research metrics for historical alerts. These are diagnostic — not a
 * profitability claim, and the UI must not present them as expected P&L.
 */
export function evaluateAlertQuality(
  samples: QualitySample[],
  options: { horizonMinutes?: number; falsePositivePct?: number } = {},
): AlertQualityReport {
  const horizon = options.horizonMinutes ?? 30;
  const fadePct = options.falsePositivePct ?? 2;
  const forward: number[] = [];
  const mfe: number[] = [];
  const mae: number[] = [];
  const latency: number[] = [];
  let continued = 0;
  let faded = 0;
  let usable = 0;

  for (const sample of samples) {
    if (!Number.isFinite(sample.entry) || sample.entry === 0) continue;
    const fired = Date.parse(sample.firedAt);
    const horizonMs = fired + horizon * 60_000;
    const path = sample.forward.filter((point) => {
      const ts = Date.parse(point.at);
      return Number.isFinite(ts) && ts >= fired && ts <= horizonMs + 60_000;
    });
    if (!path.length) continue;
    usable += 1;
    const last = path[path.length - 1]!.price;
    const fwd = pct(sample.entry, last);
    forward.push(fwd);
    const highs = path.map((point) => pct(sample.entry, point.price));
    mfe.push(Math.max(...highs));
    mae.push(Math.min(...highs));
    if (fwd > 0) continued += 1;
    if (fwd <= -fadePct) faded += 1;
    const first = Date.parse(path[0]!.at);
    if (Number.isFinite(first)) latency.push(first - fired);
  }

  return {
    sampleSize: usable,
    continuationRate: usable ? continued / usable : null,
    medianForwardReturnPct: median(forward),
    medianMfePct: median(mfe),
    medianMaePct: median(mae),
    medianLatencyMs: median(latency),
    falsePositiveRate: usable ? faded / usable : null,
    note: "Diagnostic alert quality over the selected horizon. Not a profitability claim.",
  };
}
