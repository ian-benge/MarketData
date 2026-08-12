import { z } from "zod";
import {
  ReportEditionSchema,
  type ReportEdition,
} from "@/lib/reports/editions";

export const THESIS_STATUSES = [
  "confirmed",
  "pending",
  "weakened",
  "invalidated",
  "target_reached",
] as const;

export const ThesisStatusSchema = z.enum(THESIS_STATUSES);
export type ThesisStatus = z.infer<typeof ThesisStatusSchema>;

export const THESIS_STATUS_LABELS: Record<ThesisStatus, string> = {
  confirmed: "CONFIRMED",
  pending: "PENDING",
  weakened: "WEAKENED",
  invalidated: "INVALIDATED",
  target_reached: "TARGET_REACHED",
};

export const ThesisRecordSchema = z.object({
  id: z.string().min(1),
  statement: z.string().min(1),
  tickers: z.array(z.string()).default([]),
  holdingPeriod: z
    .enum(["intraday", "swing_2_5d", "wait_for_confirmation"])
    .default("intraday"),
  initialEdition: ReportEditionSchema,
  status: ThesisStatusSchema,
  previousStatus: ThesisStatusSchema.optional(),
  newEvidence: z.string().default(""),
  marketResponse: z.string().default(""),
  affectsTrade: z.boolean().default(false),
  sourceIds: z.array(z.string()).default([]),
  targetPrice: z.number().nullable().optional(),
  invalidationPrice: z.number().nullable().optional(),
  expectedDirection: z.enum(["up", "down", "neutral"]).default("neutral"),
});
export type ThesisRecord = z.infer<typeof ThesisRecordSchema>;

export const PriorEditionChangeSchema = z.object({
  thesisId: z.string().min(1),
  priorThesis: z.string().min(1),
  previousStatus: ThesisStatusSchema,
  currentStatus: ThesisStatusSchema,
  newEvidence: z.string(),
  marketResponse: z.string(),
  whatChanged: z.string(),
  affectsTrade: z.boolean(),
});
export type PriorEditionChange = z.infer<typeof PriorEditionChangeSchema>;

export type ThesisQuote = {
  ticker: string;
  last: number | null;
  changePercent: number | null;
};

const CONFIRM_MOVE_PCT = 0.75;
const INVALIDATE_MOVE_PCT = 0.75;

/**
 * Deterministic status transition. Never drops a prior thesis id.
 */
export function evaluateThesis(
  prior: ThesisRecord,
  quotes: ThesisQuote[],
): ThesisRecord {
  const quote = quotes.find((q) =>
    prior.tickers.some((t) => t.toUpperCase() === q.ticker.toUpperCase()),
  );
  const last = quote?.last ?? null;
  const changePct = quote?.changePercent ?? null;

  let status: ThesisStatus = "pending";
  let newEvidence = "No fresh print for named tickers as of cutoff.";
  let marketResponse = "Tape not yet decisive versus the prior thesis.";

  if (prior.targetPrice != null && last != null) {
    const hitLong =
      prior.expectedDirection === "up" && last >= prior.targetPrice;
    const hitShort =
      prior.expectedDirection === "down" && last <= prior.targetPrice;
    if (hitLong || hitShort) {
      status = "target_reached";
      newEvidence = `${quote?.ticker} last ${last} reached target ${prior.targetPrice}.`;
      marketResponse = "Price reached the stated objective.";
    }
  }

  if (status === "pending" && prior.invalidationPrice != null && last != null) {
    const brokeLong =
      prior.expectedDirection === "up" && last <= prior.invalidationPrice;
    const brokeShort =
      prior.expectedDirection === "down" && last >= prior.invalidationPrice;
    if (brokeLong || brokeShort) {
      status = "invalidated";
      newEvidence = `${quote?.ticker} last ${last} crossed invalidation ${prior.invalidationPrice}.`;
      marketResponse = "Price violated the invalidation level.";
    }
  }

  if (status === "pending" && changePct != null) {
    if (prior.expectedDirection === "up" && changePct >= CONFIRM_MOVE_PCT) {
      status = "confirmed";
      newEvidence = `${quote?.ticker} ${changePct.toFixed(2)}% vs prior close.`;
      marketResponse = "Move aligned with the bullish thesis.";
    } else if (
      prior.expectedDirection === "down" &&
      changePct <= -CONFIRM_MOVE_PCT
    ) {
      status = "confirmed";
      newEvidence = `${quote?.ticker} ${changePct.toFixed(2)}% vs prior close.`;
      marketResponse = "Move aligned with the bearish thesis.";
    } else if (
      prior.expectedDirection === "up" &&
      changePct <= -INVALIDATE_MOVE_PCT
    ) {
      status = "weakened";
      newEvidence = `${quote?.ticker} ${changePct.toFixed(2)}% vs prior close.`;
      marketResponse = "Tape moved against the bullish thesis.";
    } else if (
      prior.expectedDirection === "down" &&
      changePct >= INVALIDATE_MOVE_PCT
    ) {
      status = "weakened";
      newEvidence = `${quote?.ticker} ${changePct.toFixed(2)}% vs prior close.`;
      marketResponse = "Tape moved against the bearish thesis.";
    }
  }

  return {
    ...prior,
    previousStatus: prior.status,
    status,
    newEvidence,
    marketResponse,
    affectsTrade: status === "invalidated" || status === "target_reached",
  };
}

/**
 * Carry every prior thesis forward. New theses are appended; none are removed.
 */
export function mergeTheses(
  prior: ThesisRecord[],
  next: ThesisRecord[],
  quotes: ThesisQuote[],
): { theses: ThesisRecord[]; changes: PriorEditionChange[] } {
  const evaluated: ThesisRecord[] = [];
  const seen = new Set<string>();
  for (const thesis of prior) {
    if (seen.has(thesis.id)) continue;
    seen.add(thesis.id);
    evaluated.push(evaluateThesis(thesis, quotes));
  }
  const additions = next.filter((t) => !seen.has(t.id));
  const theses = [...evaluated, ...additions];
  const changes: PriorEditionChange[] = evaluated.map((t) => ({
    thesisId: t.id,
    priorThesis: t.statement,
    previousStatus: t.previousStatus ?? "pending",
    currentStatus: t.status,
    newEvidence: t.newEvidence,
    marketResponse: t.marketResponse,
    whatChanged:
      t.previousStatus && t.previousStatus !== t.status
        ? `Status ${THESIS_STATUS_LABELS[t.previousStatus]} → ${THESIS_STATUS_LABELS[t.status]}.`
        : "Status unchanged; evidence refreshed.",
    affectsTrade: t.affectsTrade,
  }));
  return { theses, changes };
}

export function assertNoDroppedTheses(
  priorIds: string[],
  current: ThesisRecord[],
): string[] {
  const have = new Set(current.map((t) => t.id));
  return priorIds.filter((id) => !have.has(id));
}

export function seedThesesFromMovers(
  edition: ReportEdition,
  movers: Array<{
    ticker: string;
    changePercent: number | null;
    price: number | null;
    catalystSummary: string;
    sourceIds: string[];
  }>,
): ThesisRecord[] {
  return movers.slice(0, 5).map((m) => {
    const direction: ThesisRecord["expectedDirection"] =
      (m.changePercent ?? 0) >= 0 ? "up" : "down";
    const last = m.price;
    return {
      id: `thesis-${m.ticker.toLowerCase()}`,
      statement: `${m.ticker} ${direction === "up" ? "bid" : "pressured"} — ${m.catalystSummary}`,
      tickers: [m.ticker],
      holdingPeriod: "intraday",
      initialEdition: edition,
      status: "pending",
      newEvidence: m.catalystSummary,
      marketResponse: "Initial observation at this edition cutoff.",
      affectsTrade: false,
      sourceIds: m.sourceIds,
      targetPrice:
        last != null
          ? direction === "up"
            ? round2(last * 1.02)
            : round2(last * 0.98)
          : null,
      invalidationPrice:
        last != null
          ? direction === "up"
            ? round2(last * 0.985)
            : round2(last * 1.015)
          : null,
      expectedDirection: direction,
    };
  });
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
