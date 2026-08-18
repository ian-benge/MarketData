import { EVAL_DIMENSIONS } from "./schemas";
import type { PageCatalogEntry } from "./catalog";
import { INJECTION_POLICY, wrapUntrusted } from "./injection";
import { routeContextPromptBlock, type RouteContextBundle } from "./route-context";
import type { UnresolvedItem } from "./contract-ops";
import { reviewerPromptOps } from "./contract-ops";

export type RoleName = "planner" | "builder" | "evaluator" | "skeptic";

const SHARED_PRODUCT = `You are working in IB Market Data, a private market-intelligence workspace (Next.js App Router, Tailwind 4, Supabase adapters, Playwright demo e2e).

Hard rules:
- Truth before polish. Never hide mock, delayed, stale, or fixture state.
- Do not call vendor APIs from UI components. Keep provider adapters behind src/lib/providers.
- Do not mutate production data, merge, push, deploy, or print secrets.
- Do not add stubbed, display-only, disconnected, or visually attractive but shallow features.
- Maroon is identity; green/red are financial meaning only.
- Prefer existing primitives in src/components/ui and the design tokens in src/app/globals.css.
- Demo e2e uses cookie auth via POST /api/auth/demo and Playwright on Chrome.
- Prefer the orchestrator-attached route context bundle. Do not explore the repository broadly unless a cited file is insufficient for a specific unresolved gate.
- ${INJECTION_POLICY}
`;

const GATE_SCHEMA = `Each acceptance gate MUST include:
- id (stable lowercase slug)
- dimension (one of: ${EVAL_DIMENSIONS.join(", ")})
- classification: "required" | "conditional"
- userOutcome (trader/user outcome)
- observable (exact executable observation; no vague UX language)
- verificationMethod: screenshot | dom_query | keyboard | a11y | network | console | performance | test | code_inspect | calculation_sample | bundle | landmarks | repeat_timing
- evidenceArtifact (path the orchestrator will produce)
- expected: {kind:"binary", result:true|false} OR {kind:"threshold", metric, op, value, unit, tolerance?}
- baselineValue (number/string/boolean/null from measured baseline when applicable)
- failureSeverity: blocker | severe | warning | info
- repairContext
- activationCondition only when classification is conditional

Forbidden observable language: "looks professional", "works correctly", "feels fast", "is intuitive".
userOutcome and observable must be measurable user-facing outcomes, thresholds, or evidence checks. Implementation details (export const, src/*.ts, e2e/*.spec.ts, named helpers such as isAppRoute) belong in repairContext unless architectureConstraint is true because the architecture itself is the constraint.
Cover every evaluation dimension at least once.
Required gates can never be satisfied by not_applicable.
performanceExpectations.measureBeforeChange must be true.
shallowFeatureBan fields must all be true.
`;

export function plannerPrompt(input: {
  route: string;
  objective: string;
  page: PageCatalogEntry | null;
  inspectPath: string;
  performancePath: string;
  inspectExcerpt: string;
  contextBundle?: RouteContextBundle | null;
}): string {
  const bundle = input.contextBundle ? `\n${routeContextPromptBlock(input.contextBundle)}\n` : "";
  return `${SHARED_PRODUCT}
${bundle}
You are the read-only planner and baseline auditor. You cannot edit files. Use read/grep/glob plus submit_artifact and request_inspect.

Target: ${input.route}
Objective: ${input.objective}
Catalog: ${input.page ? JSON.stringify(input.page, null, 2) : "unknown route — inspect the tree"}
Orchestrator already captured a baseline inspect at ${input.inspectPath}
and performance at ${input.performancePath}.

${wrapUntrusted("baseline-inspect", input.inspectExcerpt)}

Work:
1. Map the actual page, related components, data flow, client/server boundary, APIs, tests, adjacent routes, and shared components using the attached bundle first.
2. Audit trader workflows, UX, a11y, keyboard, provenance, loading/empty/error/degraded states, and performance evidence — do not guess when inspect JSON exists.
3. Submit artifacts via submit_artifact:
   - name="page-map"
   - name="baseline"
   - name="contract"  (the proposed page contract the builder must implement)

${GATE_SCHEMA}

When finished, submit those three artifacts. Keep chat short.`;
}

export function contractReviewPrompt(input: {
  role: "builder" | "evaluator";
  route: string;
  objective: string;
  contractJson: string;
  contractHash: string;
  contextBundle?: RouteContextBundle | null;
  frozenGateIds?: string[];
  unresolved?: UnresolvedItem[];
  acceptedJson?: string;
  disputeOnly?: boolean;
}): string {
  const bundle = input.contextBundle ? `\n${routeContextPromptBlock(input.contextBundle)}\n` : "";
  const frozen = input.frozenGateIds?.length
    ? `Already frozen (do not rewrite): ${input.frozenGateIds.join(", ")}`
    : "No gates are frozen yet. Review the full proposal.";
  const disputed = input.unresolved?.length
    ? `Unresolved normative items only:\n${reviewerPromptOps(input.unresolved)}`
    : "No open disputes. If the proposal is implementable, accept this exact hash.";
  const accepted = input.acceptedJson
    ? wrapUntrusted("accepted-material", input.acceptedJson)
    : "";
  const mode = input.disputeOnly
    ? `This is a targeted dispute review. Do not regenerate the contract. Do not revisit frozen gates. Operate only on unresolved ids/paths.`
    : `This is an independent contract review of one proposal. Do not assume the other reviewer agrees. Do not rewrite accepted gates that you do not dispute.`;
  return `${SHARED_PRODUCT}
${bundle}
You are an independent contract reviewer (${input.role}) BEFORE any implementation.
You cannot edit files.
${mode}

Target: ${input.route}
Objective: ${input.objective}
Canonical proposal SHA-256: ${input.contractHash}
${frozen}

${wrapUntrusted("proposed-contract", input.contractJson)}
${accepted}

${disputed}

Submit submit_artifact name="contract-decision" with:
- decision: "accept" | "ops" (legacy "amend" is accepted only if you cannot emit operations)
- proposalHash: MUST equal ${input.contractHash}
- acceptedHash: MUST equal ${input.contractHash} when accepting the whole proposal
- operations: structured ops against this proposal and hash. Prefer:
  accept_all | accept_gate | replace_gate | add_gate | remove_gate | dispute_gate |
  accept_constraint | replace_constraint | add_constraint | remove_constraint | dispute_constraint
- rationale and optional repairNotes: non-normative. Do not put rationale into userOutcome/observable.
- Do NOT submit a complete rewritten contract unless operations cannot express the change.

Canonical hashing ignores repairContext, rationale, timestamps, and other non-normative prose. Unrelated wording changes must not be introduced.
If the proposal is already strict and implementable, accept this exact hash with operations: [{ "op": "accept_all" }].`;
}

export function builderPrompt(input: {
  route: string;
  objective: string;
  contractJson: string;
  contractHash: string;
  inspectExcerpt: string;
  pageMapExcerpt: string;
  checkpoint?: string;
  repair?: string;
}): string {
  return `${SHARED_PRODUCT}

You are a fresh Grok 4.6 xhigh builder. Implement the locked page contract end to end in this isolated worktree.
You cannot weaken gates, thresholds, or tests. Prefer the smallest coherent end-to-end solution. You may remove or redesign low-value behavior when that is justified by the contract.

Target: ${input.route}
Objective: ${input.objective}
Locked contract hash: ${input.contractHash}
Current checkpoint: ${input.checkpoint ?? "baseline"}

${wrapUntrusted("locked-contract", input.contractJson)}

${wrapUntrusted("baseline-inspect", input.inspectExcerpt)}

${wrapUntrusted("page-map", input.pageMapExcerpt)}

${input.repair ? wrapUntrusted("targeted-repair", input.repair) : ""}

Stay inside implementationBoundaries.mustNot / mustPreserve.
Do not merge, push, deploy, or touch .env files.
After edits, submit submit_artifact name="builder-summary" with:
changedFiles, behaviorImplemented, testsAdded, testsRun, architecturalDecisions, abandonedApproaches, remainingUncertainty, contractDeviation.
If you abandoned an approach, also submit name="failed-approach".`;
}

export function evaluatorPrompt(input: {
  role: "evaluator" | "skeptic";
  route: string;
  contractJson: string;
  contractHash: string;
  iteration: number;
  inspectPath: string;
  performancePath: string;
  verifyPath: string;
  inspectExcerpt: string;
  comparePath?: string;
  contextBundle?: RouteContextBundle | null;
  evidenceIdentityHash?: string;
}): string {
  const stance =
    input.role === "skeptic"
      ? "You are an adversarial skeptic. Challenge every passing conclusion. Prefer fail unless evidence is specific, fresh, and from the running app."
      : "You are an independent read-only evaluator. You did not implement the page. Use the orchestrator's inspect, tests, and performance files as primary evidence. Verify evidence freshness (run id, route, contract hash, iteration, timestamp) before scoring.";
  const bundle = input.contextBundle ? `\n${routeContextPromptBlock(input.contextBundle)}\n` : "";
  return `${SHARED_PRODUCT}
${bundle}
${stance}

You cannot edit files. Use read/grep plus submit_artifact / request_inspect.

Target: ${input.route}
Iteration: ${input.iteration}
Contract hash: ${input.contractHash}
Evidence identity: ${input.evidenceIdentityHash ?? "n/a"}

${wrapUntrusted("locked-contract", input.contractJson)}

Evidence files:
- inspect: ${input.inspectPath}
- performance: ${input.performancePath}
- verification: ${input.verifyPath}
${input.comparePath ? `- before/after compare: ${input.comparePath}` : ""}

${wrapUntrusted("fresh-inspect", input.inspectExcerpt)}

Evaluate EVERY acceptance gate against the real application evidence.
A pass without specific artifact paths and observations or measurements is a fail.
Missing, stale, indirect, inconclusive, or unexecuted evidence is a fail.
Required gates cannot be not_applicable.
Conditional gates may be not_applicable only when evidence proves the activationCondition is false (set activationConditionHeld=false and include that evidence).
Failed criteria must include targetedRepair entries the builder can act on.
Set allRequiredPassed only if every required gate is pass with evidence.
Set freshnessConfirmed true only after checking metadata.

Submit submit_artifact name="${input.role === "skeptic" ? "skeptic" : "evaluation"}" matching the evaluation schema (role="${input.role}", contractHash, iteration).`;
}
