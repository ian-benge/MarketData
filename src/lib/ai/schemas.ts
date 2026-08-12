import { z } from "zod";
import { CausalStatusSchema } from "@/lib/providers/types";

/** Shared claim shape — every material claim must cite sourceIds. */
export const AiClaimSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  material: z.boolean().default(true),
  causalStatus: CausalStatusSchema.default("unclear"),
  sourceIds: z.array(z.string().min(1)).default([]),
  tickers: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(1).optional(),
});
export type AiClaim = z.infer<typeof AiClaimSchema>;

export const AiClaimsOutputSchema = z.object({
  claims: z.array(AiClaimSchema).default([]),
});
export type AiClaimsOutput = z.infer<typeof AiClaimsOutputSchema>;

/** Headline / theme classification */
export const HeadlineClassificationSchema = z.object({
  labels: z.array(z.string().min(1)).min(1),
  primaryLabel: z.string().optional(),
  confidence: z.number().min(0).max(1),
  tickers: z.array(z.string()).default([]),
  rationale: z.string().optional(),
});
export type HeadlineClassification = z.infer<typeof HeadlineClassificationSchema>;

/** Event clustering from news items */
export const EventClusterItemSchema = z.object({
  clusterId: z.string().min(1),
  title: z.string().min(1),
  summary: z.string().optional(),
  sourceIds: z.array(z.string().min(1)).min(1),
  tickers: z.array(z.string()).default([]),
  labels: z.array(z.string()).default([]),
});
export type EventClusterItem = z.infer<typeof EventClusterItemSchema>;

export const EventClusteringSchema = z.object({
  clusters: z.array(EventClusterItemSchema).default([]),
});
export type EventClustering = z.infer<typeof EventClusteringSchema>;

/** Catalyst attribution for a material mover */
export const MoverCatalystSchema = z.object({
  ticker: z.string().min(1),
  catalystSummary: z.string().min(1),
  causalStatus: CausalStatusSchema,
  confidenceScore: z.number().min(0).max(1),
  confidenceReason: z.string().optional(),
  sourceIds: z.array(z.string().min(1)).default([]),
  claims: z.array(AiClaimSchema).default([]),
});
export type MoverCatalyst = z.infer<typeof MoverCatalystSchema>;

export const MoverCatalystsOutputSchema = z.object({
  movers: z.array(MoverCatalystSchema).default([]),
});
export type MoverCatalystsOutput = z.infer<typeof MoverCatalystsOutputSchema>;

/** Causal synthesis across an event / mover set */
export const CausalSynthesisSchema = z.object({
  causalStatus: CausalStatusSchema,
  summary: z.string().min(1),
  sourceIds: z.array(z.string().min(1)).default([]),
  claims: z.array(AiClaimSchema).default([]),
  unresolvedQuestions: z.array(z.string()).default([]),
});
export type CausalSynthesis = z.infer<typeof CausalSynthesisSchema>;

/** Section draft for report body */
export const SectionDraftSchema = z.object({
  sectionKey: z.string().min(1),
  title: z.string().min(1),
  body: z.string().min(1),
  claimIds: z.array(z.string()).default([]),
  sourceIds: z.array(z.string()).default([]),
  labels: z.array(z.string()).default([]),
});
export type SectionDraft = z.infer<typeof SectionDraftSchema>;

export const SectionDraftsOutputSchema = z.object({
  sections: z.array(SectionDraftSchema).default([]),
});
export type SectionDraftsOutput = z.infer<typeof SectionDraftsOutputSchema>;

/** Executive summary bullets */
export const ExecutiveSummaryBulletSchema = z.object({
  text: z.string().min(1),
  sourceIds: z.array(z.string()).default([]),
  material: z.boolean().default(true),
});
export type ExecutiveSummaryBullet = z.infer<
  typeof ExecutiveSummaryBulletSchema
>;

export const ExecutiveSummarySchema = z.object({
  headline: z.string().min(1),
  bullets: z.array(ExecutiveSummaryBulletSchema).min(1),
  labels: z.array(z.string()).default([]),
});
export type ExecutiveSummary = z.infer<typeof ExecutiveSummarySchema>;

/** Editorial pass — polish + flag issues without inventing facts */
export const EditorialPassSchema = z.object({
  revisedHeadline: z.string().optional(),
  revisedBullets: z.array(z.string()).default([]),
  sectionEdits: z
    .array(
      z.object({
        sectionKey: z.string(),
        revisedBody: z.string(),
        notes: z.string().optional(),
      }),
    )
    .default([]),
  flags: z
    .array(
      z.object({
        severity: z.enum(["info", "warning", "blocking"]),
        message: z.string(),
        sectionKey: z.string().optional(),
      }),
    )
    .default([]),
});
export type EditorialPass = z.infer<typeof EditorialPassSchema>;

export const PriorEditionAuditSchema = z.object({
  notes: z.array(z.string()).default([]),
  preservedThesisIds: z.array(z.string()).default([]),
});
export type PriorEditionAudit = z.infer<typeof PriorEditionAuditSchema>;
