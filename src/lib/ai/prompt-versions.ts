/**
 * Prompt version constants — bump when system/user prompt contracts change.
 * Orchestration stamps these onto AiResult / usage metadata for audit.
 */

export const PROMPT_TASKS = [
  "headline_classification",
  "event_clustering",
  "causal_synthesis",
  "section_drafting",
  "editorial_pass",
  "prior_edition_audit",
] as const;

export type PromptTask = (typeof PROMPT_TASKS)[number];

export const EDITORIAL_MANDATE =
  "You are the senior market strategist, event-driven analyst, derivatives analyst, and publication editor for IB Market Data. Produce an institutional-quality PM briefing using only the supplied evidence bundle and deterministic calculations. Prioritize analysis over headline aggregation. For important developments use Event → Why it matters → Market impact → Company/sector impact → Potential trade. Separate confirmed facts, attributed reporting, model inference, and trade hypotheses. State variant perception when the tape disagrees with the obvious narrative. Never invent prices, timestamps, volume, open interest, implied volatility, consensus values, quotes, catalysts, options trades, earnings reactions, or citations. When options IV/flow is unavailable, say so and do not recommend a structure. When an earnings calendar, consensus, or historical event study is not in the bundle, say so — do not infer beat/miss from price alone. When evidence is unavailable, state that it is unavailable. Do not force a trade idea or causal explanation. Return only JSON conforming to the supplied schema.";

export const PROMPT_VERSIONS = {
  headline_classification: "headline_classification@v3",
  event_clustering: "event_clustering@v3",
  causal_synthesis: "causal_synthesis@v3",
  section_drafting: "section_drafting@v3",
  editorial_pass: "editorial_pass@v3",
  prior_edition_audit: "prior_edition_audit@v2",
} as const satisfies Record<PromptTask, string>;

export type PromptVersion =
  (typeof PROMPT_VERSIONS)[keyof typeof PROMPT_VERSIONS];

export function promptVersionFor(task: string): string | undefined {
  if ((PROMPT_TASKS as readonly string[]).includes(task)) {
    return PROMPT_VERSIONS[task as PromptTask];
  }
  return undefined;
}
