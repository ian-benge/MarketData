import { clamp01 } from "./math";
import type {
  ScoreFactor,
  ScannerFeatureSnapshot,
  TransparentScore,
} from "./types";

function factor(
  id: string,
  label: string,
  weight: number,
  raw: number | null,
  note: string,
): ScoreFactor {
  const value = raw == null || !Number.isFinite(raw) ? 0 : clamp01(raw);
  return {
    id,
    label,
    value: raw == null || !Number.isFinite(raw) ? null : value,
    weight,
    contribution: value * weight,
    note,
  };
}

function scale(value: number | null, start: number, full: number): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  if (full === start) return value >= full ? 1 : 0;
  return clamp01((value - start) / (full - start));
}

function invert(value: number | null, start: number, full: number): number | null {
  const s = scale(value, start, full);
  return s == null ? null : 1 - s;
}

function total(factors: ScoreFactor[]): TransparentScore {
  const weightSum = factors.reduce((sum, item) => sum + item.weight, 0) || 1;
  const contribution = factors.reduce((sum, item) => sum + item.contribution, 0);
  return {
    total: Math.round((contribution / weightSum) * 1000) / 10,
    factors,
  };
}

export function opportunityScore(feature: ScannerFeatureSnapshot): TransparentScore {
  const accel = Math.abs(feature.velocity5mPct ?? feature.changeFromClosePct ?? 0);
  const rvol = feature.sessionRelativeVolume ?? feature.relativeVolume;
  const freshness =
    feature.newsFreshness === "0_2h"
      ? 1
      : feature.newsFreshness === "2_12h"
        ? 0.65
        : feature.newsFreshness === "12_24h"
          ? 0.3
          : 0;
  const materiality =
    feature.catalystKind === "confirmed_company"
      ? 1
      : feature.catalystKind === "likely_catalyst"
        ? 0.72
        : feature.catalystKind === "sector_sympathy"
          ? 0.55
          : feature.catalystKind === "macro"
            ? 0.48
            : feature.catalystKind === "technical"
              ? 0.4
              : 0.12;
  const sectorConfirm =
    feature.catalystKind === "sector_sympathy" || feature.themes.length > 1
      ? 0.8
      : feature.themes.length === 1
        ? 0.45
        : 0.15;
  const options = feature.unusualOptions ? 0.85 : feature.dataQuality.options ? 0.25 : 0;
  const qualityBits = Object.values(feature.dataQuality).filter(Boolean).length;
  const quality = qualityBits / 8;
  const watchlist = feature.inPosition ? 1 : feature.inWatchlist ? 0.7 : 0.15;

  return total([
    factor(
      "acceleration",
      "Price acceleration",
      16,
      scale(accel, 0.4, 6),
      accel ? `${accel.toFixed(2)}% recent velocity` : "Velocity unavailable",
    ),
    factor(
      "rvol",
      "Relative volume",
      14,
      scale(rvol, 1, 8),
      rvol != null ? `${rvol.toFixed(2)}×` : "Average volume missing",
    ),
    factor(
      "liquidity",
      "Dollar liquidity",
      10,
      scale(feature.dollarVolume, 250_000, 20_000_000),
      feature.dollarVolume != null
        ? `$${Math.round(feature.dollarVolume).toLocaleString()} session dollar volume`
        : "Dollar volume unavailable",
    ),
    factor(
      "catalyst_materiality",
      "Catalyst materiality",
      16,
      materiality,
      feature.explanation.headline,
    ),
    factor(
      "catalyst_freshness",
      "Catalyst freshness",
      10,
      freshness,
      feature.newsFreshness === "none"
        ? "No qualifying recent headline"
        : `Headline age bucket ${feature.newsFreshness}`,
    ),
    factor(
      "sector",
      "Sector confirmation",
      10,
      sectorConfirm,
      feature.themes.length
        ? `Themes: ${feature.themes.slice(0, 3).join(", ")}`
        : "No sector confirmation",
    ),
    factor(
      "options",
      "Options confirmation",
      6,
      options,
      feature.optionsNote ??
        (feature.dataQuality.options
          ? "Options data present without unusual activity"
          : "Options flow not entitled"),
    ),
    factor(
      "data_quality",
      "Data quality",
      8,
      quality,
      `${qualityBits}/8 feature families present`,
    ),
    factor(
      "coverage",
      "Watchlist / book",
      10,
      watchlist,
      feature.inPosition
        ? "Open position"
        : feature.inWatchlist
          ? feature.watchlistNames.join(", ") || "On coverage"
          : "Not on coverage",
    ),
  ]);
}

export function riskScore(feature: ScannerFeatureSnapshot): TransparentScore {
  const vol = Math.abs(feature.atr && feature.last ? (feature.atr / feature.last) * 100 : feature.velocity5mPct ?? 0);
  const unexplained = feature.catalystKind === "unexplained" ? 1 : feature.catalystKind === "technical" ? 0.45 : 0.12;
  const halt =
    feature.haltStatus === "halted"
      ? 1
      : feature.frequentHalt
        ? 0.75
        : feature.haltStatus === "resumed"
          ? 0.55
          : 0.08;
  const dilution = feature.offeringRisk ? 0.85 : feature.recentReverseSplit ? 0.55 : 0.12;
  const floatTight =
    feature.floatShares != null && feature.floatShares < 5_000_000
      ? 0.7
      : feature.floatShares != null && feature.floatShares < 20_000_000
        ? 0.4
        : 0.15;
  const failed =
    (feature.changeFromOpenPct ?? 0) < -3 && (feature.gapPercent ?? 0) > 4
      ? 0.8
      : feature.gapAndFade
        ? 0.65
        : 0.15;
  const gaps =
    1 -
    Object.values(feature.dataQuality).filter(Boolean).length / 8;

  return total([
    factor(
      "spread",
      "Spread / liquidity",
      12,
      scale(feature.spreadFraction, 0.004, 0.04),
      feature.spreadFraction != null
        ? `Spread ${(feature.spreadFraction * 100).toFixed(2)}% of mid`
        : "Bid/ask unavailable",
    ),
    factor(
      "volatility",
      "Volatility",
      10,
      scale(vol, 1, 12),
      vol ? `Recent range ${vol.toFixed(1)}%` : "ATR unavailable",
    ),
    factor(
      "dilution",
      "Dilution / offering risk",
      14,
      dilution,
      feature.offeringRisk
        ? "Habitual offering / financing risk"
        : feature.recentReverseSplit
          ? "Recent reverse split"
          : "No offering flag",
    ),
    factor(
      "float",
      "Float tightness",
      8,
      floatTight,
      feature.floatShares != null
        ? `${(feature.floatShares / 1_000_000).toFixed(1)}M float`
        : "Float unavailable",
    ),
    factor(
      "short",
      "Short interest",
      8,
      scale(feature.shortInterestPct, 8, 35),
      feature.shortInterestPct != null
        ? `${feature.shortInterestPct.toFixed(1)}% of float`
        : "Short interest unavailable",
    ),
    factor(
      "halt",
      "Halt risk",
      14,
      halt,
      feature.haltStatus === "halted"
        ? feature.haltReason ?? "Currently halted"
        : feature.frequentHalt
          ? "Frequent halt candidate"
          : "No halt flag",
    ),
    factor(
      "unexplained",
      "Unexplained move",
      12,
      unexplained,
      feature.catalystKind === "unexplained"
        ? "No verified catalyst"
        : CATALYST_NOTE[feature.catalystKind],
    ),
    factor(
      "data_gaps",
      "Missing data",
      12,
      gaps,
      feature.coverageNotes ?? "Feature completeness",
    ),
    factor(
      "fade",
      "Exhaustion / fade risk",
      10,
      failed,
      feature.gapAndFade ? "Habitual gap-and-fade name" : "No fade flag",
    ),
  ]);
}

const CATALYST_NOTE = {
  confirmed_company: "Company-specific catalyst confirmed",
  likely_catalyst: "Likely catalyst, not primary-source confirmed",
  sector_sympathy: "Sector or sympathy interpretation",
  technical: "Technical / breakout interpretation",
  macro: "Macro-driven interpretation",
  unexplained: "Unresolved",
} as const;

export { invert };
