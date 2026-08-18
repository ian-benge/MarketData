import type { ScannerFeatureSnapshot } from "./types";

export type TickerHistoryFlags = {
  formerRunner: boolean;
  gapAndFade: boolean;
  offeringRisk: boolean;
  frequentHalt: boolean;
  haltCount90d: number;
  extremeMoveDays90d: number;
  maxIntradayMove90d: number | null;
};

export type HistoryDay = {
  sessionDate: string;
  changeFromClosePct: number | null;
  gapPercent: number | null;
  changeFromOpenPct: number | null;
  halted: boolean;
  offeringHeadline: boolean;
};

const FORMER_RUNNER_MOVE = 25;
const GAP_FADE_GAP = 8;
const GAP_FADE_GIVEBACK = -4;

/**
 * Historical character of a ticker from daily feature summaries.
 * Used so the scanner can know former runners, habitual gap-and-fade names,
 * offering risk, and frequent halt candidates without inventing a story.
 */
export function profileFromHistory(days: HistoryDay[]): TickerHistoryFlags {
  const window = days.slice(-90);
  let extreme = 0;
  let maxMove: number | null = null;
  let gapFadeHits = 0;
  let gapDays = 0;
  let haltCount = 0;
  let offeringDays = 0;

  for (const day of window) {
    const move = Math.abs(day.changeFromClosePct ?? 0);
    if (day.changeFromClosePct != null) {
      maxMove = maxMove == null ? move : Math.max(maxMove, move);
    }
    if (move >= FORMER_RUNNER_MOVE) extreme += 1;
    if ((day.gapPercent ?? 0) >= GAP_FADE_GAP) {
      gapDays += 1;
      if ((day.changeFromOpenPct ?? 0) <= GAP_FADE_GIVEBACK) gapFadeHits += 1;
    }
    if (day.halted) haltCount += 1;
    if (day.offeringHeadline) offeringDays += 1;
  }

  return {
    formerRunner: extreme >= 2 || (maxMove ?? 0) >= 40,
    gapAndFade: gapDays >= 3 && gapFadeHits / Math.max(gapDays, 1) >= 0.5,
    offeringRisk: offeringDays >= 2,
    frequentHalt: haltCount >= 2,
    haltCount90d: haltCount,
    extremeMoveDays90d: extreme,
    maxIntradayMove90d: maxMove,
  };
}

export function applyHistoryFlags(
  feature: ScannerFeatureSnapshot,
  flags: TickerHistoryFlags | null | undefined,
): ScannerFeatureSnapshot {
  if (!flags) return feature;
  return {
    ...feature,
    formerRunner: flags.formerRunner,
    gapAndFade: flags.gapAndFade,
    offeringRisk: flags.offeringRisk,
    frequentHalt: flags.frequentHalt,
  };
}
