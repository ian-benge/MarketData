import { z } from "zod";
import { ReportEditionSchema } from "@/lib/reports/editions";
import { tickerMeta, type TapeGroup } from "@/lib/reports/universe";

export const TradeDirectionSchema = z.enum(["long", "short"]);
export const TradeInstrumentSchema = z.enum([
  "stock",
  "etf",
  "listed_call",
  "listed_put",
]);
export const TradeStrategySchema = z.enum([
  "intraday_long",
  "intraday_short",
  "swing_long",
  "swing_short",
  "pair_long_short",
  "event_driven",
  "wait_for_confirmation",
]);

export const TradeIdeaSchema = z.object({
  id: z.string().min(1),
  ticker: z.string().min(1),
  direction: TradeDirectionSchema,
  instrument: TradeInstrumentSchema.default("stock"),
  strategyType: TradeStrategySchema,
  holdingPeriod: z.enum(["intraday", "swing_2_5d", "wait_for_confirmation"]),
  currentPrice: z.number().nullable(),
  priceTimestamp: z.string(),
  thesis: z.string(),
  catalyst: z.string(),
  mispricingNote: z.string(),
  entryLow: z.number(),
  entryHigh: z.number(),
  trigger: z.string(),
  stop: z.number(),
  invalidationFact: z.string(),
  target1: z.number(),
  target2: z.number(),
  rewardRisk1: z.number().nullable(),
  rewardRisk2: z.number().nullable(),
  confidence: z.number().int().min(1).max(5),
  confidenceReason: z.string(),
  liquidityNotes: z.string(),
  majorRisks: z.array(z.string()).default([]),
  correlationNote: z.string().default(""),
  monitor: z.string(),
  action: z.enum(["ADD", "HOLD", "REDUCE", "EXIT", "NO_TRADE"]).default("HOLD"),
  edition: ReportEditionSchema,
  sourceIds: z.array(z.string()).default([]),
  optionsStructure: z.string().nullable().default(null),
  pairLeg: z.string().optional(),
  variantNote: z.string().default(""),
});
export type TradeIdea = z.infer<typeof TradeIdeaSchema>;

const SKIP_PLAYBOOK_GROUPS: TapeGroup[] = ["crypto", "vol", "fx"];
const CORE_PLAYBOOK_GROUPS: TapeGroup[] = ["ai_infra", "sector", "index"];
const MACRO_EVENT_GROUPS: TapeGroup[] = ["rates", "commodity", "credit"];

type MoverInput = {
  ticker: string;
  price: number | null;
  changePercent: number | null;
  catalystSummary: string;
  sourceIds: string[];
};

/**
 * Reward/risk from the entry-zone midpoint. Null when risk is zero or inputs invalid.
 */
export function rewardRisk(
  entryLow: number,
  entryHigh: number,
  stop: number,
  target: number,
): number | null {
  if (
    ![entryLow, entryHigh, stop, target].every((n) => Number.isFinite(n))
  ) {
    return null;
  }
  const entry = (entryLow + entryHigh) / 2;
  const risk = Math.abs(entry - stop);
  if (risk === 0) return null;
  const reward = Math.abs(target - entry);
  return Math.round((reward / risk) * 100) / 100;
}

/** Prose range that quality-gate number extraction will not read as a negative. */
export function formatLevelRange(low: number, high: number): string {
  return `${low} to ${high}`;
}

/** Widths for a schematic risk (red) vs T1 reward (green) bar. */
export function riskRewardBarPercents(rr: number | null): {
  riskPct: number;
  rewardPct: number;
} {
  const r = rr != null && Number.isFinite(rr) && rr > 0 ? rr : 1;
  const rewardPct = Math.round((r / (1 + r)) * 100);
  return { riskPct: 100 - rewardPct, rewardPct };
}

export function isPlaybookName(
  ticker: string,
  hasCatalyst: boolean,
): boolean {
  const group = tickerMeta(ticker)?.group;
  if (!group) return true;
  if (SKIP_PLAYBOOK_GROUPS.includes(group)) return false;
  if (CORE_PLAYBOOK_GROUPS.includes(group)) return true;
  if (MACRO_EVENT_GROUPS.includes(group)) return hasCatalyst;
  return false;
}

export function ideasFromMovers(
  edition: TradeIdea["edition"],
  asOf: string,
  movers: MoverInput[],
): TradeIdea[] {
  const ranked = [...movers]
    .filter((m) => isPlaybookName(m.ticker, m.sourceIds.length > 0))
    .sort((a, b) => {
      const ac = a.sourceIds.length > 0 ? 0 : 1;
      const bc = b.sourceIds.length > 0 ? 0 : 1;
      if (ac !== bc) return ac - bc;
      return Math.abs(b.changePercent ?? 0) - Math.abs(a.changePercent ?? 0);
    });
  const cited = ranked.filter(
    (m) => m.sourceIds.length > 0 && m.price != null && Number.isFinite(m.price),
  );
  const waits = ranked.filter(
    (m) =>
      m.sourceIds.length === 0 && m.price != null && Number.isFinite(m.price),
  );
  const selected = [
    ...cited.slice(0, 3),
    ...(cited.length >= 2 ? [] : waits.slice(0, 1)),
  ];
  const ideas: TradeIdea[] = [];
  for (const mover of selected) {
    if (mover.price == null || !Number.isFinite(mover.price)) continue;
    const hasCatalyst = mover.sourceIds.length > 0;
    const long = (mover.changePercent ?? 0) >= 0;
    const last = mover.price;
    const wait = !hasCatalyst;
    const entryLow = round2(last * (long ? 0.997 : 0.995));
    const entryHigh = round2(last * (long ? 1.003 : 1.005));
    const stop = round2(long ? last * 0.988 : last * 1.012);
    const target1 = round2(long ? last * 1.02 : last * 0.98);
    const target2 = round2(long ? last * 1.035 : last * 0.965);
    const group = tickerMeta(mover.ticker)?.group;
    ideas.push({
      id: `idea-${edition}-${mover.ticker.toLowerCase()}`,
      ticker: mover.ticker,
      direction: long ? "long" : "short",
      instrument: group === "index" || group === "sector" ? "etf" : "stock",
      strategyType: wait
        ? "wait_for_confirmation"
        : hasCatalyst
          ? "event_driven"
          : long
            ? "intraday_long"
            : "intraday_short",
      holdingPeriod: wait ? "wait_for_confirmation" : "intraday",
      currentPrice: last,
      priceTimestamp: asOf,
      thesis: wait
        ? `${mover.ticker} printed ${long ? "higher" : "lower"} without a cited catalyst. Do not express until the cause is known.`
        : `${mover.ticker} ${long ? "upside" : "downside"} follow-through if the cited catalyst remains intact and the tape holds the entry zone ${formatLevelRange(entryLow, entryHigh)}.`,
      catalyst: mover.catalystSummary,
      mispricingNote:
        "Hypothesis only — the market may already have discounted the news. Not an order.",
      entryLow,
      entryHigh,
      trigger: wait
        ? "No trigger until a primary-source catalyst is attached."
        : long
          ? "Hold above the entry-zone midpoint; do not chase an already-extended print."
          : "Fail to reclaim the entry-zone midpoint. Stock shorts depend on borrow.",
      stop,
      invalidationFact: long
        ? `A print through ${stop} invalidates the long.`
        : `A print through ${stop} invalidates the short. Borrow availability and cost are not in this bundle.`,
      target1,
      target2,
      rewardRisk1: rewardRisk(entryLow, entryHigh, stop, target1),
      rewardRisk2: rewardRisk(entryLow, entryHigh, stop, target2),
      confidence: wait ? 2 : 3,
      confidenceReason: wait
        ? "Material print, uncited cause — low confidence by design."
        : "Evidence-backed mover; still a hypothesis, not a quota fill.",
      liquidityNotes:
        "U.S.-listed name in the configured coverage universe. Confirm spread and size before any expression.",
      majorRisks: [
        "Headline reversal",
        "Liquidity/slippage",
        "Index beta correlation",
        "Position already discounted",
      ],
      correlationNote:
        "Likely correlated with Nasdaq / semiconductor factor tape unless the name is a macro proxy.",
      monitor:
        "Price vs stop/targets, headline updates, SPY/QQQ direction, and duration (TLT).",
      action: wait ? "NO_TRADE" : "HOLD",
      edition,
      sourceIds: mover.sourceIds,
      optionsStructure: null,
      variantNote:
        "If the name mean-reverts while the catalyst is intact, the market may be fading the news. That is a variant, not a second trade.",
    });
  }

  const pair = pairIdeaFromMovers(edition, asOf, movers);
  if (pair) ideas.push(pair);
  return ideas;
}

function pairIdeaFromMovers(
  edition: TradeIdea["edition"],
  asOf: string,
  movers: MoverInput[],
): TradeIdea | null {
  const priced = movers.filter((m) => {
    if (m.price == null || m.changePercent == null || !Number.isFinite(m.price)) {
      return false;
    }
    const group = tickerMeta(m.ticker)?.group;
    return group === "ai_infra" || group === "sector";
  });
  if (priced.length < 2) return null;

  let best: {
    longLeg: MoverInput;
    shortLeg: MoverInput;
    spread: number;
    cited: number;
    sameSleeve: boolean;
  } | null = null;
  for (let i = 0; i < priced.length; i++) {
    for (let j = i + 1; j < priced.length; j++) {
      const a = priced[i]!;
      const b = priced[j]!;
      const delta = (a.changePercent ?? 0) - (b.changePercent ?? 0);
      const abs = Math.round(Math.abs(delta) * 100) / 100;
      if (abs < 0.25) continue;
      const longLeg = delta >= 0 ? a : b;
      const shortLeg = delta >= 0 ? b : a;
      const cited =
        (longLeg.sourceIds.length > 0 ? 1 : 0) +
        (shortLeg.sourceIds.length > 0 ? 1 : 0);
      if (cited < 1) continue;
      const sameSleeve =
        tickerMeta(longLeg.ticker)?.sleeve != null &&
        tickerMeta(longLeg.ticker)?.sleeve ===
          tickerMeta(shortLeg.ticker)?.sleeve;
      const score = abs - (sameSleeve ? 0.4 : 0) + cited * 0.05;
      const bestScore = best
        ? best.spread -
          (best.sameSleeve ? 0.4 : 0) +
          best.cited * 0.05
        : -Infinity;
      if (!best || score > bestScore) {
        best = {
          longLeg,
          shortLeg,
          spread: abs,
          cited,
          sameSleeve: Boolean(sameSleeve),
        };
      }
    }
  }
  if (!best || best.cited < 1) return null;

  const { longLeg, shortLeg, spread } = best;
  const last = longLeg.price!;
  const entryLow = round2(last * 0.997);
  const entryHigh = round2(last * 1.003);
  const stop = round2(last * 0.988);
  const target1 = round2(last * 1.02);
  const target2 = round2(last * 1.035);
  return {
    id: `idea-${edition}-pair-${longLeg.ticker.toLowerCase()}-${shortLeg.ticker.toLowerCase()}`,
    ticker: longLeg.ticker,
    direction: "long",
    instrument: "stock",
    strategyType: "pair_long_short",
    holdingPeriod: "intraday",
    currentPrice: last,
    priceTimestamp: asOf,
    thesis: `Relative-value hypothesis: long ${longLeg.ticker} / short ${shortLeg.ticker} because the session spread is ${spread} percentage points in the evidence tape. This is not a forecast of either absolute price.`,
    catalyst: `${longLeg.ticker}: ${longLeg.catalystSummary}. ${shortLeg.ticker}: ${shortLeg.catalystSummary}.`,
    mispricingNote:
      "Spread may already be the fair reaction. Pair is a relative expression, not two independent directional bets.",
    entryLow,
    entryHigh,
    trigger: `Only if ${longLeg.ticker} continues to outperform ${shortLeg.ticker} on the same catalyst set.`,
    stop,
    invalidationFact: `Spread mean-reversion through a ${longLeg.ticker} print of ${stop}, or a reversal of the cited catalysts.`,
    target1,
    target2,
    rewardRisk1: rewardRisk(entryLow, entryHigh, stop, target1),
    rewardRisk2: rewardRisk(entryLow, entryHigh, stop, target2),
    confidence: 2,
    confidenceReason:
      "Two-name relative value from session prints only — no residual model.",
    liquidityNotes:
      "Execute as a pair; do not leg in. Spreads and borrow on the short leg are not in this bundle.",
    majorRisks: [
      "Idiosyncratic headline on one leg",
      "Borrow on the short leg",
      "Beta mismatch vs. Nasdaq",
    ],
    correlationNote: `Short leg ${shortLeg.ticker} last ${shortLeg.price}.`,
    monitor: `Live spread ${longLeg.ticker} vs ${shortLeg.ticker}; flatten if either catalyst is walked back.`,
    action: "HOLD",
    edition,
    sourceIds: [...longLeg.sourceIds, ...shortLeg.sourceIds],
    optionsStructure: null,
    pairLeg: shortLeg.ticker,
    variantNote:
      "The variant is that the laggard is the better expression if the lead name is crowded. We do not have positioning data to prove crowding.",
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
