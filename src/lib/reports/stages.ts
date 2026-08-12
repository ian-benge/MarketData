/**
 * Report pipeline stage names — keep in sync with
 * public.report_run_status in supabase migrations.
 */

export const REPORT_RUN_STATUSES = [
  "queued",
  "collecting_sources",
  "normalizing_market_data",
  "detecting_material_events",
  "analyzing_and_drafting",
  "validating_claims",
  "rendering_pdf",
  "archiving",
  "delivering_email",
  "completed",
  "partial",
  "failed",
  "cancelled",
] as const;

export type ReportRunStatus = (typeof REPORT_RUN_STATUSES)[number];

/** Executable pipeline stages in order (excludes terminal statuses). */
export const PIPELINE_STAGES = [
  "queued",
  "collecting_sources",
  "normalizing_market_data",
  "detecting_material_events",
  "analyzing_and_drafting",
  "validating_claims",
  "rendering_pdf",
  "archiving",
  "delivering_email",
] as const;

export type PipelineStage = (typeof PIPELINE_STAGES)[number];

export const TERMINAL_STATUSES = [
  "completed",
  "partial",
  "failed",
  "cancelled",
] as const;

export type TerminalStatus = (typeof TERMINAL_STATUSES)[number];

export function isPipelineStage(value: string): value is PipelineStage {
  return (PIPELINE_STAGES as readonly string[]).includes(value);
}

export function isTerminalStatus(value: string): value is TerminalStatus {
  return (TERMINAL_STATUSES as readonly string[]).includes(value);
}

/** Human labels for UI / PDF cover pages */
export const STAGE_LABELS: Record<ReportRunStatus, string> = {
  queued: "Queued",
  collecting_sources: "Collecting sources",
  normalizing_market_data: "Normalizing market data",
  detecting_material_events: "Detecting material events",
  analyzing_and_drafting: "Analyzing and drafting",
  validating_claims: "Validating claims",
  rendering_pdf: "Rendering PDF",
  archiving: "Archiving",
  delivering_email: "Delivering email",
  completed: "Completed",
  partial: "Partial",
  failed: "Failed",
  cancelled: "Cancelled",
};
