import {
  absoluteChange,
  percentChange,
} from "@/lib/domain/market-math";
import type { ExtendedMarketSession } from "@/lib/market-data/schemas";

/**
 * Session-aware price baselines.
 * Never coerce null/undefined to 0 — missing inputs yield null outputs.
 */

export type SessionBaselinesInput = {
  session: ExtendedMarketSession;
  /** Current last / indicative price for the active session. */
  last: number | null | undefined;
  /** Official prior regular-session close. */
  priorRegularClose: number | null | undefined;
  /** Official regular-session close for the current day (after-hours baseline). */
  officialClose: number | null | undefined;
  /** Regular-session last (or close) when computing AH vs regular. */
  regularSessionLast?: number | null | undefined;
};

export type SessionBaselines = {
  session: ExtendedMarketSession;
  /** Change vs prior regular close (premkt / regular / AH “day” change). */
  vsPriorRegularCloseAbsolute: number | null;
  vsPriorRegularClosePercent: number | null;
  /** After-hours change from today's official close; null outside afterhours. */
  afterHoursAbsolute: number | null;
  afterHoursPercent: number | null;
  /** Gap % from prior close to today's open/first print when available. */
  gapPercent: number | null;
  /** Which price was used as the “current” leg for vs-prior calculations. */
  baselineMethod:
    | "prior_regular_close"
    | "after_hours_from_official_close"
    | "unavailable";
};

export function computeGapPercent(
  openOrFirst: number | null | undefined,
  priorRegularClose: number | null | undefined,
): number | null {
  return percentChange(openOrFirst, priorRegularClose);
}

/**
 * Premarket / regular: change vs prior regular close.
 * After-hours: both day change vs prior regular close and AH change from official close.
 * Overnight / closed: still report vs prior close when a last is present; AH fields null.
 */
export function computeSessionBaselines(
  input: SessionBaselinesInput,
): SessionBaselines {
  const {
    session,
    last,
    priorRegularClose,
    officialClose,
    regularSessionLast,
  } = input;

  const vsPriorAbs = absoluteChange(last, priorRegularClose);
  const vsPriorPct = percentChange(last, priorRegularClose);

  if (session === "afterhours") {
    const ahAbs = absoluteChange(last, officialClose);
    const ahPct = percentChange(last, officialClose);
    // Day change may use regular session last when provided, else current last.
    const dayRef =
      regularSessionLast != null && Number.isFinite(regularSessionLast)
        ? regularSessionLast
        : last;
    return {
      session,
      vsPriorRegularCloseAbsolute: absoluteChange(dayRef, priorRegularClose),
      vsPriorRegularClosePercent: percentChange(dayRef, priorRegularClose),
      afterHoursAbsolute: ahAbs,
      afterHoursPercent: ahPct,
      gapPercent: null,
      baselineMethod: "after_hours_from_official_close",
    };
  }

  if (session === "premarket" || session === "regular") {
    return {
      session,
      vsPriorRegularCloseAbsolute: vsPriorAbs,
      vsPriorRegularClosePercent: vsPriorPct,
      afterHoursAbsolute: null,
      afterHoursPercent: null,
      gapPercent: null,
      baselineMethod:
        vsPriorAbs == null ? "unavailable" : "prior_regular_close",
    };
  }

  // overnight / closed
  return {
    session,
    vsPriorRegularCloseAbsolute: vsPriorAbs,
    vsPriorRegularClosePercent: vsPriorPct,
    afterHoursAbsolute: null,
    afterHoursPercent: null,
    gapPercent: null,
    baselineMethod: vsPriorAbs == null ? "unavailable" : "prior_regular_close",
  };
}

export function withGap(
  baselines: SessionBaselines,
  openOrFirst: number | null | undefined,
  priorRegularClose: number | null | undefined,
): SessionBaselines {
  return {
    ...baselines,
    gapPercent: computeGapPercent(openOrFirst, priorRegularClose),
  };
}
