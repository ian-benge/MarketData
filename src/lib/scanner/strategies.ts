import type { ExtendedMarketSession } from "@/lib/market-data/schemas";
import type { ScannerFeatureSnapshot, ScannerStrategyDef } from "./types";

const ALL_SESSIONS: ExtendedMarketSession[] = [
  "overnight",
  "premarket",
  "regular",
  "afterhours",
  "closed",
];

export type HodRegimeConfig = {
  minAccelPct: number;
  minRvol: number;
  minFiveMinRvol: number;
  minDollarVolume: number;
  maxSpread: number;
  minPrice: number;
  maxPrice: number | null;
  maxFloat: number | null;
  minFloat: number | null;
};

export const HOD_REGIMES = {
  penny: {
    minAccelPct: 2,
    minRvol: 3,
    minFiveMinRvol: 4,
    minDollarVolume: 400_000,
    maxSpread: 0.035,
    minPrice: 0.5,
    maxPrice: 5,
    maxFloat: 80_000_000,
    minFloat: null,
  },
  small: {
    minAccelPct: 1.2,
    minRvol: 2,
    minFiveMinRvol: 3,
    minDollarVolume: 1_000_000,
    maxSpread: 0.02,
    minPrice: 2,
    maxPrice: 20,
    maxFloat: 50_000_000,
    minFloat: null,
  },
  large: {
    minAccelPct: 0.55,
    minRvol: 1.5,
    minFiveMinRvol: 2.2,
    minDollarVolume: 8_000_000,
    maxSpread: 0.008,
    minPrice: 20,
    maxPrice: null,
    maxFloat: null,
    minFloat: null,
  },
} as const satisfies Record<string, HodRegimeConfig>;

export const FIVE_PILLARS = {
  minPrice: 2,
  maxPrice: 20,
  minChangePct: 10,
  minRvol: 5,
  maxFloat: 20_000_000,
  minDollarVolume: 500_000,
} as const;

export const DESK_LIQUIDITY_FLOOR = {
  minPrice: 2,
  minAvgDollarVolume: 20_000_000,
} as const;

function rvol(feature: ScannerFeatureSnapshot): number | null {
  return feature.sessionRelativeVolume ?? feature.relativeVolume;
}

function absChange(feature: ScannerFeatureSnapshot): number {
  return Math.abs(feature.changeFromClosePct ?? 0);
}

function hasPrint(feature: ScannerFeatureSnapshot): boolean {
  return feature.last != null && Number.isFinite(feature.last);
}

function liquidEnough(feature: ScannerFeatureSnapshot, minDollar: number): boolean {
  if (feature.dollarVolume != null && feature.dollarVolume >= minDollar) return true;
  if (feature.volume != null && feature.last != null && feature.volume * feature.last >= minDollar) {
    return true;
  }
  return false;
}

function spreadOk(feature: ScannerFeatureSnapshot, maxSpread: number): boolean {
  if (feature.spreadFraction == null) return true;
  return feature.spreadFraction <= maxSpread;
}

function notHalted(feature: ScannerFeatureSnapshot): boolean {
  return feature.haltStatus !== "halted";
}

export function hodMomentumMatch(
  feature: ScannerFeatureSnapshot,
  regime: HodRegimeConfig,
): boolean {
  if (!hasPrint(feature) || !notHalted(feature)) return false;
  if (!feature.newHod && !feature.nearHod) return false;
  if (feature.last! < regime.minPrice) return false;
  if (regime.maxPrice != null && feature.last! > regime.maxPrice) return false;
  if (regime.maxFloat != null && feature.floatShares != null && feature.floatShares > regime.maxFloat) {
    return false;
  }
  if (regime.minFloat != null && feature.floatShares != null && feature.floatShares < regime.minFloat) {
    return false;
  }
  const accel = feature.velocity5mPct ?? feature.acceleration ?? 0;
  if (accel < regime.minAccelPct) return false;
  const rel = rvol(feature);
  const five = feature.fiveMinuteRelativeVolume;
  const volumeOk =
    (rel != null && rel >= regime.minRvol) ||
    (five != null && five >= regime.minFiveMinRvol);
  if (!volumeOk) return false;
  if (!liquidEnough(feature, regime.minDollarVolume)) return false;
  if (!spreadOk(feature, regime.maxSpread)) return false;
  return true;
}

export function fivePillarsMatch(feature: ScannerFeatureSnapshot): boolean {
  if (!hasPrint(feature) || !notHalted(feature)) return false;
  if (feature.last! < FIVE_PILLARS.minPrice || feature.last! > FIVE_PILLARS.maxPrice) {
    return false;
  }
  if ((feature.changeFromClosePct ?? 0) < FIVE_PILLARS.minChangePct) return false;
  const rel = rvol(feature);
  if (rel == null || rel < FIVE_PILLARS.minRvol) return false;
  if (feature.floatShares == null || feature.floatShares > FIVE_PILLARS.maxFloat) {
    return false;
  }
  if (!liquidEnough(feature, FIVE_PILLARS.minDollarVolume)) return false;
  if (
    feature.catalystKind !== "confirmed_company" &&
    feature.catalystKind !== "likely_catalyst" &&
    feature.catalystKind !== "sector_sympathy"
  ) {
    return false;
  }
  return true;
}

export function passesDeskFloor(
  feature: ScannerFeatureSnapshot,
  floor: { minPrice: number; minAvgDollarVolume: number } = DESK_LIQUIDITY_FLOOR,
): boolean {
  if (feature.inWatchlist || feature.inPosition) return true;
  if (feature.last != null && feature.last < floor.minPrice) return false;
  if (feature.avgVolume20d != null && feature.last != null) {
    const adv = feature.avgVolume20d * feature.last;
    if (adv < floor.minAvgDollarVolume) return false;
  }
  return true;
}

function strategy(
  def: Omit<ScannerStrategyDef, "match" | "rank"> & {
    match: ScannerStrategyDef["match"];
    rank?: ScannerStrategyDef["rank"];
  },
): ScannerStrategyDef {
  return {
    ...def,
    rank:
      def.rank ??
      ((feature) => absChange(feature) * (rvol(feature) ?? 1)),
  };
}

export const SCANNER_STRATEGIES: ScannerStrategyDef[] = [
  strategy({
    id: "five_pillars",
    system: "momentum",
    kind: "both",
    title: "Five Pillars",
    shortTitle: "5 Pillars",
    description:
      "Price $2–$20, ≥10% above prior close, ≥5× relative volume, float under 20M, and a confirmed, likely, or sector catalyst.",
    sessions: ALL_SESSIONS,
    oncePerSession: true,
    cooldownSeconds: 900,
    consolidateSeconds: 120,
    audioKey: "five_pillars",
    match: fivePillarsMatch,
    rank: (f) => (f.changeFromClosePct ?? 0) * (rvol(f) ?? 1),
  }),
  strategy({
    id: "premarket_gappers",
    system: "momentum",
    kind: "ranked",
    title: "Premarket gappers",
    shortTitle: "PM gaps",
    description: "Largest gaps versus prior close during the 4:00–9:30 a.m. ET window.",
    sessions: ["premarket", "overnight"],
    oncePerSession: false,
    cooldownSeconds: 300,
    consolidateSeconds: 90,
    audioKey: "gap",
    match: (f) =>
      hasPrint(f) &&
      (f.session === "premarket" || f.session === "overnight") &&
      Math.abs(f.gapPercent ?? f.changeFromClosePct ?? 0) >= 4 &&
      (f.last ?? 0) >= 1,
    rank: (f) => Math.abs(f.gapPercent ?? f.changeFromClosePct ?? 0),
  }),
  strategy({
    id: "regular_gappers",
    system: "momentum",
    kind: "ranked",
    title: "Regular-session gappers",
    shortTitle: "RTH gaps",
    description: "Opening gaps that remain among the largest after 9:30 a.m. ET.",
    sessions: ["regular"],
    oncePerSession: false,
    cooldownSeconds: 300,
    consolidateSeconds: 90,
    audioKey: "gap",
    match: (f) =>
      hasPrint(f) &&
      f.session === "regular" &&
      Math.abs(f.gapPercent ?? 0) >= 3 &&
      (f.last ?? 0) >= 1,
    rank: (f) => Math.abs(f.gapPercent ?? 0),
  }),
  strategy({
    id: "top_gainers",
    system: "momentum",
    kind: "ranked",
    title: "Top gainers",
    shortTitle: "Gainers",
    description: "Largest percent advances versus prior close in the scanned universe.",
    sessions: ALL_SESSIONS,
    oncePerSession: false,
    cooldownSeconds: 180,
    consolidateSeconds: 60,
    audioKey: "gainer",
    match: (f) => hasPrint(f) && (f.changeFromClosePct ?? 0) >= 3,
    rank: (f) => f.changeFromClosePct ?? 0,
  }),
  strategy({
    id: "top_losers",
    system: "momentum",
    kind: "ranked",
    title: "Top losers",
    shortTitle: "Losers",
    description: "Largest percent declines versus prior close.",
    sessions: ALL_SESSIONS,
    oncePerSession: false,
    cooldownSeconds: 180,
    consolidateSeconds: 60,
    audioKey: "loser",
    match: (f) => hasPrint(f) && (f.changeFromClosePct ?? 0) <= -3,
    rank: (f) => -(f.changeFromClosePct ?? 0),
  }),
  strategy({
    id: "low_float_gainers",
    system: "momentum",
    kind: "both",
    title: "Low-float gainers",
    shortTitle: "Low float",
    description: "Gainers with float at or below 20 million shares.",
    sessions: ALL_SESSIONS,
    oncePerSession: false,
    cooldownSeconds: 240,
    consolidateSeconds: 90,
    audioKey: "low_float",
    match: (f) =>
      hasPrint(f) &&
      f.floatShares != null &&
      f.floatShares <= 20_000_000 &&
      (f.changeFromClosePct ?? 0) >= 5 &&
      (rvol(f) ?? 0) >= 2,
    rank: (f) => (f.changeFromClosePct ?? 0) * (rvol(f) ?? 1),
  }),
  strategy({
    id: "top_rvol",
    system: "momentum",
    kind: "ranked",
    title: "Top relative volume",
    shortTitle: "RVOL",
    description: "Highest session-adjusted relative volume.",
    sessions: ALL_SESSIONS,
    oncePerSession: false,
    cooldownSeconds: 180,
    consolidateSeconds: 60,
    audioKey: "rvol",
    match: (f) => hasPrint(f) && (rvol(f) ?? 0) >= 3,
    rank: (f) => rvol(f) ?? 0,
  }),
  strategy({
    id: "five_minute_volume",
    system: "momentum",
    kind: "both",
    title: "Five-minute volume",
    shortTitle: "5m vol",
    description: "Abnormal volume concentrated in the last five minutes.",
    sessions: ["premarket", "regular", "afterhours"],
    oncePerSession: false,
    cooldownSeconds: 180,
    consolidateSeconds: 75,
    audioKey: "rvol",
    match: (f) =>
      hasPrint(f) &&
      (f.fiveMinuteRelativeVolume ?? 0) >= 4 &&
      liquidEnough(f, 250_000),
    rank: (f) => f.fiveMinuteRelativeVolume ?? 0,
  }),
  strategy({
    id: "hod_momentum_penny",
    system: "momentum",
    kind: "both",
    title: "Penny HOD momentum",
    shortTitle: "Penny HOD",
    description:
      "New or near high of day with acceleration, abnormal volume, and enough liquidity in the sub-$5 regime. Not a raw new-high print.",
    sessions: ["premarket", "regular", "afterhours"],
    oncePerSession: false,
    cooldownSeconds: 240,
    consolidateSeconds: 90,
    audioKey: "hod",
    match: (f) => hodMomentumMatch(f, HOD_REGIMES.penny) && (f.last ?? 0) < 5,
  }),
  strategy({
    id: "hod_momentum_small",
    system: "momentum",
    kind: "both",
    title: "Small-cap HOD momentum",
    shortTitle: "Small HOD",
    description:
      "Small-cap high-of-day continuation: new/near HOD, recent acceleration, abnormal volume, and liquidity.",
    sessions: ["premarket", "regular", "afterhours"],
    oncePerSession: false,
    cooldownSeconds: 240,
    consolidateSeconds: 90,
    audioKey: "hod",
    match: (f) =>
      hodMomentumMatch(f, HOD_REGIMES.small) &&
      (f.priceRegime === "small_cap" || f.priceRegime === "low_float" || (f.last ?? 0) <= 20),
  }),
  strategy({
    id: "hod_momentum_large",
    system: "momentum",
    kind: "both",
    title: "Large-cap HOD momentum",
    shortTitle: "Large HOD",
    description: "Liquid large-cap names making a new or near high with acceleration and volume.",
    sessions: ["regular", "premarket", "afterhours"],
    oncePerSession: false,
    cooldownSeconds: 300,
    consolidateSeconds: 90,
    audioKey: "hod",
    match: (f) =>
      hodMomentumMatch(f, HOD_REGIMES.large) &&
      (f.priceRegime === "large_cap" || (f.last ?? 0) >= 20),
  }),
  strategy({
    id: "running_up",
    system: "momentum",
    kind: "both",
    title: "Running up",
    shortTitle: "Run up",
    description: "Price accelerating higher over the last five minutes on elevated volume.",
    sessions: ["premarket", "regular", "afterhours"],
    oncePerSession: false,
    cooldownSeconds: 180,
    consolidateSeconds: 60,
    audioKey: "run_up",
    match: (f) =>
      hasPrint(f) &&
      notHalted(f) &&
      (f.velocity5mPct ?? 0) >= 3 &&
      (f.acceleration ?? f.velocity5mPct ?? 0) > 0 &&
      (rvol(f) ?? 0) >= 2 &&
      (f.changeFromClosePct ?? 0) >= 3,
  }),
  strategy({
    id: "running_down",
    system: "momentum",
    kind: "both",
    title: "Running down",
    shortTitle: "Run down",
    description: "Price accelerating lower over the last five minutes on elevated volume.",
    sessions: ["premarket", "regular", "afterhours"],
    oncePerSession: false,
    cooldownSeconds: 180,
    consolidateSeconds: 60,
    audioKey: "run_down",
    match: (f) =>
      hasPrint(f) &&
      notHalted(f) &&
      (f.velocity5mPct ?? 0) <= -3 &&
      (f.acceleration ?? 0) < 0 &&
      (rvol(f) ?? 0) >= 2 &&
      (f.changeFromClosePct ?? 0) <= -3,
  }),
  strategy({
    id: "reversal",
    system: "momentum",
    kind: "both",
    title: "Reversal",
    shortTitle: "Reversal",
    description: "Intraday reversal: a large open-to-now move with opposing five-minute velocity.",
    sessions: ["regular", "premarket", "afterhours"],
    oncePerSession: false,
    cooldownSeconds: 300,
    consolidateSeconds: 90,
    audioKey: "reversal",
    match: (f) => {
      if (!hasPrint(f) || !notHalted(f) || (rvol(f) ?? 0) < 1.5) return false;
      const fromOpen = f.changeFromOpenPct ?? 0;
      const vel = f.velocity5mPct ?? 0;
      return (fromOpen <= -4 && vel >= 1.5) || (fromOpen >= 4 && vel <= -1.5);
    },
  }),
  strategy({
    id: "up_5_in_5",
    system: "momentum",
    kind: "both",
    title: "Up 5% in 5 minutes",
    shortTitle: "+5%/5m",
    description: "Five-minute return of at least 5%.",
    sessions: ["premarket", "regular", "afterhours"],
    oncePerSession: false,
    cooldownSeconds: 180,
    consolidateSeconds: 60,
    audioKey: "spike",
    match: (f) =>
      hasPrint(f) &&
      notHalted(f) &&
      (f.velocity5mPct ?? 0) >= 5 &&
      liquidEnough(f, 250_000),
  }),
  strategy({
    id: "up_10_in_10",
    system: "momentum",
    kind: "both",
    title: "Up 10% in 10 minutes",
    shortTitle: "+10%/10m",
    description: "Ten-minute return of at least 10%.",
    sessions: ["premarket", "regular", "afterhours"],
    oncePerSession: false,
    cooldownSeconds: 240,
    consolidateSeconds: 75,
    audioKey: "spike",
    match: (f) =>
      hasPrint(f) &&
      notHalted(f) &&
      (f.velocity10mPct ?? 0) >= 10 &&
      liquidEnough(f, 250_000),
  }),
  strategy({
    id: "breakout_52w",
    system: "momentum",
    kind: "both",
    title: "52-week breakouts",
    shortTitle: "52w",
    description: "Trading at or through the 52-week high with volume confirmation.",
    sessions: ALL_SESSIONS,
    oncePerSession: true,
    cooldownSeconds: 1800,
    consolidateSeconds: 180,
    audioKey: "breakout",
    match: (f) =>
      hasPrint(f) &&
      f.week52High != null &&
      (f.distanceFrom52wHighPct ?? -99) >= -0.2 &&
      (f.changeFromClosePct ?? 0) >= 2 &&
      (rvol(f) ?? 0) >= 1.2,
  }),
  strategy({
    id: "recent_ipo",
    system: "momentum",
    kind: "both",
    title: "Recent IPO / uplisting movers",
    shortTitle: "IPO",
    description: "Names listed within the past year making an abnormal session move.",
    sessions: ALL_SESSIONS,
    oncePerSession: true,
    cooldownSeconds: 900,
    consolidateSeconds: 120,
    audioKey: "ipo",
    match: (f) =>
      hasPrint(f) &&
      f.ipoAgeDays != null &&
      f.ipoAgeDays <= 365 &&
      absChange(f) >= 8 &&
      (rvol(f) ?? 0) >= 2,
  }),
  strategy({
    id: "reverse_split",
    system: "momentum",
    kind: "both",
    title: "Recent reverse splits",
    shortTitle: "Rev split",
    description: "Tickers with a recent reverse split that are moving abnormally.",
    sessions: ALL_SESSIONS,
    oncePerSession: true,
    cooldownSeconds: 900,
    consolidateSeconds: 120,
    audioKey: "split",
    match: (f) => hasPrint(f) && f.recentReverseSplit && absChange(f) >= 5,
  }),
  strategy({
    id: "change_since_open",
    system: "momentum",
    kind: "ranked",
    title: "Change since the 9:30 open",
    shortTitle: "Since open",
    description: "Largest moves versus the regular-session open.",
    sessions: ["regular"],
    oncePerSession: false,
    cooldownSeconds: 180,
    consolidateSeconds: 60,
    audioKey: "open",
    match: (f) =>
      hasPrint(f) && f.session === "regular" && Math.abs(f.changeFromOpenPct ?? 0) >= 2,
    rank: (f) => Math.abs(f.changeFromOpenPct ?? 0),
  }),
  strategy({
    id: "top_of_trend",
    system: "momentum",
    kind: "both",
    title: "Top of trend / continuation",
    shortTitle: "Continuation",
    description: "Leaders still near the high with volume and a continuation (not unexplained) read.",
    sessions: ["regular", "premarket"],
    oncePerSession: false,
    cooldownSeconds: 300,
    consolidateSeconds: 90,
    audioKey: "trend",
    match: (f) =>
      hasPrint(f) &&
      f.nearHod &&
      (f.changeFromClosePct ?? 0) >= 5 &&
      (rvol(f) ?? 0) >= 2 &&
      f.catalystKind !== "unexplained",
  }),
  strategy({
    id: "halts",
    system: "momentum",
    kind: "both",
    title: "Trading halts",
    shortTitle: "Halts",
    description: "Current and recently resumed halts with the published reason when available.",
    sessions: ALL_SESSIONS,
    oncePerSession: false,
    cooldownSeconds: 60,
    consolidateSeconds: 30,
    audioKey: "halt",
    match: (f) => f.haltStatus === "halted" || f.haltStatus === "resumed",
    rank: (f) => (f.haltStatus === "halted" ? 100 : 50) + absChange(f),
  }),
  strategy({
    id: "after_hours_movers",
    system: "momentum",
    kind: "ranked",
    title: "After-hours movers",
    shortTitle: "AH",
    description: "Largest after-hours moves through 8:00 p.m. ET.",
    sessions: ["afterhours"],
    oncePerSession: false,
    cooldownSeconds: 180,
    consolidateSeconds: 60,
    audioKey: "ah",
    match: (f) =>
      hasPrint(f) && f.session === "afterhours" && absChange(f) >= 3,
    rank: (f) => absChange(f),
  }),
  strategy({
    id: "former_runners",
    system: "momentum",
    kind: "both",
    title: "Former runners",
    shortTitle: "Runners",
    description: "Names with a history of extreme intraday or multi-day movement that are active again.",
    sessions: ALL_SESSIONS,
    oncePerSession: false,
    cooldownSeconds: 300,
    consolidateSeconds: 90,
    audioKey: "runner",
    match: (f) =>
      hasPrint(f) && f.formerRunner && absChange(f) >= 5 && (rvol(f) ?? 0) >= 2,
  }),
  strategy({
    id: "desk_abnormal_price",
    system: "desk",
    kind: "ranked",
    title: "Abnormal price",
    shortTitle: "Price",
    description: "Multi-window abnormal price movement across the institutional universe.",
    sessions: ALL_SESSIONS,
    oncePerSession: false,
    cooldownSeconds: 240,
    consolidateSeconds: 90,
    audioKey: "desk",
    match: (f) =>
      passesDeskFloor(f) &&
      hasPrint(f) &&
      (absChange(f) >= 2.5 || Math.abs(f.velocity5mPct ?? 0) >= 1.5),
  }),
  strategy({
    id: "desk_abnormal_volume",
    system: "desk",
    kind: "ranked",
    title: "Abnormal volume",
    shortTitle: "Volume",
    description: "Abnormal or accelerating volume versus the 20-day baseline.",
    sessions: ALL_SESSIONS,
    oncePerSession: false,
    cooldownSeconds: 240,
    consolidateSeconds: 90,
    audioKey: "desk",
    match: (f) =>
      passesDeskFloor(f) &&
      hasPrint(f) &&
      ((rvol(f) ?? 0) >= 2 || (f.fiveMinuteRelativeVolume ?? 0) >= 3),
    rank: (f) => rvol(f) ?? f.fiveMinuteRelativeVolume ?? 0,
  }),
  strategy({
    id: "desk_sector_relative",
    system: "desk",
    kind: "ranked",
    title: "Sector-relative outliers",
    shortTitle: "Vs sector",
    description: "Coverage names outperforming or lagging their sector/theme tape.",
    sessions: ALL_SESSIONS,
    oncePerSession: false,
    cooldownSeconds: 300,
    consolidateSeconds: 90,
    audioKey: "desk",
    match: (f) =>
      passesDeskFloor(f) &&
      hasPrint(f) &&
      (f.inWatchlist || f.themes.length > 0) &&
      absChange(f) >= 1.5,
  }),
  strategy({
    id: "desk_gaps",
    system: "desk",
    kind: "ranked",
    title: "Premarket / AH gaps",
    shortTitle: "Gaps",
    description: "Institutional-liquidity gaps in premarket and after-hours.",
    sessions: ["premarket", "afterhours", "overnight"],
    oncePerSession: false,
    cooldownSeconds: 300,
    consolidateSeconds: 90,
    audioKey: "desk",
    match: (f) =>
      passesDeskFloor(f) &&
      hasPrint(f) &&
      Math.abs(f.gapPercent ?? f.changeFromClosePct ?? 0) >= 2,
    rank: (f) => Math.abs(f.gapPercent ?? f.changeFromClosePct ?? 0),
  }),
  strategy({
    id: "desk_earnings",
    system: "desk",
    kind: "both",
    title: "Earnings & guidance",
    shortTitle: "Earnings",
    description: "Moves attributed to earnings or guidance.",
    sessions: ALL_SESSIONS,
    oncePerSession: true,
    cooldownSeconds: 900,
    consolidateSeconds: 180,
    audioKey: "catalyst",
    match: (f) =>
      passesDeskFloor(f) &&
      hasPrint(f) &&
      absChange(f) >= 1.2 &&
      (f.explanation.evidence.some((item) => item.eventType === "earnings" || item.eventType === "guidance") ||
        /earnings|guidance/i.test(f.explanation.headline)),
  }),
  strategy({
    id: "desk_analyst",
    system: "desk",
    kind: "both",
    title: "Analyst actions",
    shortTitle: "Analyst",
    description: "Initiations, upgrades, downgrades, and target changes with tape confirmation.",
    sessions: ALL_SESSIONS,
    oncePerSession: true,
    cooldownSeconds: 900,
    consolidateSeconds: 180,
    audioKey: "catalyst",
    match: (f) =>
      passesDeskFloor(f) &&
      f.explanation.evidence.some((item) => item.eventType === "analyst"),
  }),
  strategy({
    id: "desk_filings",
    system: "desk",
    kind: "both",
    title: "Filings & corporate actions",
    shortTitle: "Filings",
    description: "SEC filings, offerings, buybacks, and other corporate actions.",
    sessions: ALL_SESSIONS,
    oncePerSession: true,
    cooldownSeconds: 900,
    consolidateSeconds: 180,
    audioKey: "catalyst",
    match: (f) =>
      passesDeskFloor(f) &&
      f.explanation.evidence.some((item) =>
        ["filing", "offering", "financing", "buyback", "ma"].includes(item.eventType ?? ""),
      ),
  }),
  strategy({
    id: "desk_regulatory",
    system: "desk",
    kind: "both",
    title: "Regulatory / legal / policy",
    shortTitle: "Policy",
    description: "FDA, legal, regulatory, geopolitical, and policy catalysts.",
    sessions: ALL_SESSIONS,
    oncePerSession: true,
    cooldownSeconds: 900,
    consolidateSeconds: 180,
    audioKey: "catalyst",
    match: (f) =>
      passesDeskFloor(f) &&
      f.explanation.evidence.some((item) =>
        ["regulatory", "litigation", "geopolitics", "trade", "tariff", "export_control"].includes(
          item.eventType ?? "",
        ),
      ),
  }),
  strategy({
    id: "desk_contracts",
    system: "desk",
    kind: "both",
    title: "M&A, contracts, partnerships",
    shortTitle: "Deals",
    description: "M&A, contracts, partnerships, and financing events.",
    sessions: ALL_SESSIONS,
    oncePerSession: true,
    cooldownSeconds: 900,
    consolidateSeconds: 180,
    audioKey: "catalyst",
    match: (f) =>
      passesDeskFloor(f) &&
      f.explanation.evidence.some((item) =>
        ["ma", "contract", "partnership", "financing", "customer"].includes(item.eventType ?? ""),
      ),
  }),
  strategy({
    id: "desk_watchlist_unexplained",
    system: "desk",
    kind: "both",
    title: "Watchlist moving unexplained",
    shortTitle: "Unexplained",
    description: "Coverage or book names moving without an identified catalyst.",
    sessions: ALL_SESSIONS,
    oncePerSession: false,
    cooldownSeconds: 420,
    consolidateSeconds: 120,
    audioKey: "unexplained",
    match: (f) =>
      hasPrint(f) &&
      (f.inWatchlist || f.inPosition) &&
      f.catalystKind === "unexplained" &&
      absChange(f) >= 1.5,
  }),
  strategy({
    id: "desk_news_before_price",
    system: "desk",
    kind: "both",
    title: "News before price",
    shortTitle: "News lead",
    description: "A qualifying headline arrived before a confirming price move.",
    sessions: ALL_SESSIONS,
    oncePerSession: false,
    cooldownSeconds: 300,
    consolidateSeconds: 90,
    audioKey: "news_lead",
    match: (f) =>
      passesDeskFloor(f) &&
      f.newsFreshness === "0_2h" &&
      absChange(f) < 1.5 &&
      (f.inWatchlist || f.inPosition || f.themes.length > 0) &&
      f.catalystKind !== "unexplained",
  }),
  strategy({
    id: "desk_price_before_news",
    system: "desk",
    kind: "both",
    title: "Price before news",
    shortTitle: "Tape lead",
    description: "Price and volume moved before the news system identified a catalyst.",
    sessions: ALL_SESSIONS,
    oncePerSession: false,
    cooldownSeconds: 300,
    consolidateSeconds: 90,
    audioKey: "tape_lead",
    match: (f) =>
      passesDeskFloor(f) &&
      hasPrint(f) &&
      absChange(f) >= 2.5 &&
      (rvol(f) ?? 0) >= 1.8 &&
      f.newsFreshness === "none" &&
      f.catalystKind === "unexplained",
  }),
  strategy({
    id: "desk_exhaustion",
    system: "desk",
    kind: "both",
    title: "Exhaustion / failed breakout / fade",
    shortTitle: "Exhaustion",
    description: "Possible exhaustion, failed breakouts, gap fades, and reversal conditions.",
    sessions: ["regular", "afterhours"],
    oncePerSession: false,
    cooldownSeconds: 360,
    consolidateSeconds: 120,
    audioKey: "fade",
    match: (f) => {
      if (!passesDeskFloor(f) || !hasPrint(f)) return false;
      const gapFade =
        (f.gapPercent ?? 0) >= 3 && (f.changeFromOpenPct ?? 0) <= -1.5;
      const failedBreak =
        f.nearHod === false &&
        (f.distanceFromHodPct ?? 0) <= -1.2 &&
        (f.changeFromClosePct ?? 0) >= 2 &&
        (f.velocity5mPct ?? 0) < 0;
      const reversal =
        Math.abs(f.changeFromOpenPct ?? 0) >= 3 &&
        Math.sign(f.changeFromOpenPct ?? 0) !== Math.sign(f.velocity5mPct ?? 0) &&
        Math.abs(f.velocity5mPct ?? 0) >= 1;
      return gapFade || failedBreak || reversal || f.gapAndFade;
    },
  }),
  strategy({
    id: "desk_options",
    system: "desk",
    kind: "ranked",
    title: "Unusual options",
    shortTitle: "Options",
    description: "Unusual options activity when the entitlement is present. Hidden when unavailable.",
    sessions: ALL_SESSIONS,
    oncePerSession: false,
    cooldownSeconds: 300,
    consolidateSeconds: 90,
    audioKey: "options",
    match: (f) => passesDeskFloor(f) && f.unusualOptions,
  }),
  strategy({
    id: "desk_thematic",
    system: "desk",
    kind: "ranked",
    title: "Thematic / second-order",
    shortTitle: "Themes",
    description:
      "Semiconductors, photonics, hyperscalers, data centers, power, AI software, and related suppliers.",
    sessions: ALL_SESSIONS,
    oncePerSession: false,
    cooldownSeconds: 240,
    consolidateSeconds: 90,
    audioKey: "theme",
    match: (f) =>
      passesDeskFloor(f) &&
      hasPrint(f) &&
      f.themes.length > 0 &&
      absChange(f) >= 1.2,
  }),
  strategy({
    id: "desk_high_conviction",
    system: "desk",
    kind: "both",
    title: "High-conviction desk movers",
    shortTitle: "Conviction",
    description:
      "Opportunity score with catalyst, volume, and coverage confirmation — inspectable factor breakdown, not an opaque AI score.",
    sessions: ALL_SESSIONS,
    oncePerSession: false,
    cooldownSeconds: 300,
    consolidateSeconds: 90,
    audioKey: "desk",
    match: (f) =>
      passesDeskFloor(f) &&
      hasPrint(f) &&
      absChange(f) >= 1.8 &&
      (rvol(f) ?? 0) >= 1.5 &&
      (f.inWatchlist || f.inPosition || f.themes.length > 0),
  }),
];

export const STRATEGY_BY_ID = new Map(
  SCANNER_STRATEGIES.map((item) => [item.id, item] as const),
);

export function strategiesFor(
  system: "momentum" | "desk",
  session: ExtendedMarketSession,
): ScannerStrategyDef[] {
  return SCANNER_STRATEGIES.filter((item) => {
    if (item.system !== system) return false;
    if (item.sessions === "*") return true;
    return item.sessions.includes(session);
  });
}

export function strategyTitle(id: string): string {
  return STRATEGY_BY_ID.get(id)?.title ?? id;
}
