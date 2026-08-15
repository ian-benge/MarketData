import { z } from "zod";
import { ATTRIBUTION_KINDS } from "@/lib/intelligence/types";
import { ASK_NATURES, CLAIM_NATURES } from "./types";

export const GroundedClaimSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  nature: z.enum(CLAIM_NATURES),
  sourceIds: z.array(z.string().min(1)).default([]),
  tickers: z.array(z.string()).default([]),
});

export const SessionBriefSchema = z.object({
  headline: z.string().min(1),
  sessionRead: z.string().min(1),
  materialNow: z.array(GroundedClaimSchema).default([]),
  unexplainedTape: z
    .array(
      z.object({
        ticker: z.string().min(1),
        changePercent: z.number().nullable().default(null),
        note: z.string().min(1),
      }),
    )
    .default([]),
  bookFlags: z
    .array(
      z.object({
        ticker: z.string().min(1),
        note: z.string().min(1),
        sourceIds: z.array(z.string()).default([]),
      }),
    )
    .default([]),
  themes: z
    .array(
      z.object({
        id: z.string().min(1),
        note: z.string().min(1),
        sourceIds: z.array(z.string()).default([]),
      }),
    )
    .default([]),
  watchItems: z.array(z.string()).default([]),
  gaps: z.array(z.string()).default([]),
  unresolvedQuestions: z.array(z.string()).default([]),
});

export const MoveNarrativeSchema = z.object({
  ticker: z.string().min(1),
  attribution: z.enum(ATTRIBUTION_KINDS),
  nature: z.enum(CLAIM_NATURES),
  headline: z.string().min(1),
  narrative: z.string().min(1),
  whyItMatters: z.string().default(""),
  caveats: z.array(z.string()).default([]),
  sourceIds: z.array(z.string()).default([]),
  relatedTickers: z.array(z.string()).default([]),
});

export const BookRiskSchema = z.object({
  headline: z.string().min(1),
  items: z
    .array(
      z.object({
        ticker: z.string().min(1),
        severity: z.enum(["high", "medium", "low"]),
        kind: z.enum([
          "unexplained_move",
          "catalyst",
          "concentration",
          "gap",
        ]),
        note: z.string().min(1),
        sourceIds: z.array(z.string()).default([]),
        changePercent: z.number().nullable().optional(),
        dayPnl: z.number().nullable().optional(),
      }),
    )
    .default([]),
  gaps: z.array(z.string()).default([]),
  ownerLocked: z.boolean().optional(),
});

export const NewsDigestSchema = z.object({
  headline: z.string().min(1),
  bullets: z.array(GroundedClaimSchema).default([]),
  clusters: z
    .array(
      z.object({
        title: z.string().min(1),
        eventIds: z.array(z.string()).default([]),
        note: z.string().min(1),
        sourceIds: z.array(z.string()).default([]),
      }),
    )
    .default([]),
  unresolvedQuestions: z.array(z.string()).default([]),
});

export const AskAnswerSchema = z.object({
  answer: z.string().min(1),
  nature: z.enum(ASK_NATURES),
  claims: z.array(GroundedClaimSchema).default([]),
  sourceIds: z.array(z.string()).default([]),
  followUps: z.array(z.string()).default([]),
});

export const QueryInterpretSchema = z.object({
  intent: z.enum(["search", "why_moving", "ask"]),
  tickers: z.array(z.string()).default([]),
  eventTypes: z.array(z.string()).default([]),
  themes: z.array(z.string()).default([]),
  materialOnly: z.boolean().default(false),
  timeWindow: z.string().nullable().default(null),
  textTerms: z.array(z.string()).default([]),
  whyTicker: z.string().nullable().default(null),
});
