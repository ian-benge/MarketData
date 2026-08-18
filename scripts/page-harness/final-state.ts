import { existsSync, unlinkSync } from "node:fs";
import path from "node:path";
import type { ArtifactStore, RunPaths } from "./artifacts";
import type { AggregatedUsage } from "./usage";
import type { InvocationLedger } from "./invocations";
import type { Evaluation } from "./schemas";
import type { ContractResult, HarnessRequest, HarnessResultStatus } from "./request";
import type { AfterEvidence } from "./policy";
import type { FailureCategory } from "./failure";
import type { RestoreKind, VerificationSource } from "./report";
import type { WorkflowPolicy } from "./policy";
import { nowIso } from "./util";

export type SkepticStatus = "completed" | "missing" | "not_required";

export type AuthoritativeFinalState = {
  processStatus: HarnessResultStatus;
  contractResult: ContractResult;
  reusable: boolean;
  resumable: boolean;
  integrationReady: boolean;
  contractLocked: boolean;
  contractHash: string | null;
  verificationSource: VerificationSource;
  skepticRequired: boolean;
  skepticStatus: SkepticStatus;
  skepticPath: string | null;
  afterStatus: AfterEvidence["status"];
  afterReason: string | null;
  restoreKind: RestoreKind;
  evaluatedSha: string | null;
  bestCommit: string | null;
  stopReason: string | null;
  failureCategory: FailureCategory | null;
  requestedWorkflow: {
    risk: string;
    reviewers: 1 | 2 | null;
    skeptic: boolean;
  };
  effectiveWorkflow: {
    risk: string;
    independentReviewers: 1 | 2;
    disputeReviewers: 1 | 2;
    requireSkeptic: boolean;
    source: string;
  } | null;
  usage: AggregatedUsage;
  invocations: InvocationLedger | null;
  nextAction: string | null;
  updatedAt: string;
};

export function skepticStatusOf(input: {
  required: boolean;
  skeptic: Evaluation | null;
}): SkepticStatus {
  if (!input.required) return "not_required";
  return input.skeptic ? "completed" : "missing";
}

export function writeAuthoritativeState(input: {
  store: ArtifactStore;
  paths?: RunPaths;
  request: HarnessRequest;
  processStatus: HarnessResultStatus;
  contractResult: ContractResult;
  reusable: boolean;
  resumable?: boolean;
  integrationReady: boolean;
  contractLocked?: boolean;
  contractHash?: string | null;
  verificationSource: VerificationSource;
  skepticRequired: boolean;
  skeptic: Evaluation | null;
  skepticPath?: string | null;
  after: AfterEvidence;
  restoreKind: RestoreKind;
  evaluatedSha: string | null;
  bestCommit: string | null;
  stopReason: string | null;
  failureCategory?: FailureCategory | null;
  workflow?: WorkflowPolicy | null;
  usage: AggregatedUsage;
  invocations?: InvocationLedger | null;
  nextAction?: string | null;
}): AuthoritativeFinalState {
  const clearedStop =
    (input.processStatus === "audit_complete" || input.processStatus === "passed") &&
    input.reusable
      ? null
      : input.stopReason;
  const clearedCategory =
    (input.processStatus === "audit_complete" || input.processStatus === "passed") &&
    input.reusable
      ? null
      : (input.failureCategory ?? null);
  if (input.processStatus === "audit_complete" || input.processStatus === "passed") {
    clearStaleFailureArtifacts(input.store);
  }
  const state: AuthoritativeFinalState = {
    processStatus: input.processStatus,
    contractResult: input.contractResult,
    reusable: input.reusable,
    resumable: input.resumable ?? false,
    integrationReady: input.integrationReady,
    contractLocked: input.contractLocked ?? Boolean(input.contractHash),
    contractHash: input.contractHash ?? null,
    verificationSource: input.verificationSource,
    skepticRequired: input.skepticRequired,
    skepticStatus: skepticStatusOf({ required: input.skepticRequired, skeptic: input.skeptic }),
    skepticPath: input.skepticPath ?? (input.skeptic ? "skeptic.json" : null),
    afterStatus: input.after.status,
    afterReason: input.after.status === "unavailable" ? input.after.reason : null,
    restoreKind: input.restoreKind,
    evaluatedSha: input.evaluatedSha,
    bestCommit: input.bestCommit,
    stopReason: clearedStop,
    failureCategory: clearedCategory,
    requestedWorkflow: {
      risk: input.request.risk,
      reviewers: input.request.reviewers ?? null,
      skeptic: input.request.skeptic,
    },
    effectiveWorkflow: input.workflow
      ? {
          risk: input.workflow.risk,
          independentReviewers: input.workflow.independentReviewers,
          disputeReviewers: input.workflow.disputeReviewers,
          requireSkeptic: input.workflow.requireSkeptic,
          source: input.workflow.source,
        }
      : null,
    usage: input.usage,
    invocations: input.invocations ?? null,
    nextAction: input.nextAction ?? null,
    updatedAt: nowIso(),
  };
  input.store.writeJson("final-state.json", state);
  input.store.writeJson("run-status.json", {
    processStatus: state.processStatus,
    contractResult: state.contractResult,
    reusable: state.reusable,
    resumable: state.resumable,
    integrationReady: state.integrationReady,
    verificationSource: state.verificationSource,
    skepticRequired: state.skepticRequired,
    skepticStatus: state.skepticStatus,
    skepticPath: state.skepticPath,
    contractHash: state.contractHash,
    stopReason: state.stopReason,
    failureCategory: state.failureCategory,
    nextAction: state.nextAction,
    completedAt: nowIso(),
  });
  return state;
}

export function readAuthoritativeState(store: ArtifactStore): AuthoritativeFinalState | null {
  return (store.readJson("final-state.json") as AuthoritativeFinalState | null) ?? null;
}

export function clearStaleFailureArtifacts(store: ArtifactStore): void {
  const root = store.paths.artifacts;
  for (const name of ["fatal.json"]) {
    const full = path.join(root, name);
    if (existsSync(full)) {
      try {
        unlinkSync(full);
      } catch {
        store.writeJson(name, { resolved: true, at: nowIso() });
      }
    }
  }
}

export function budgetExhaustedNextAction(input: {
  tokensConsumed: number | null;
  tokenLimit: number;
  agentRuns: number;
  agentRunLimit: number;
  consumedMs: number;
  durationLimitMs: number;
  incompleteRole: string | null;
}): string {
  const tokenNeed =
    input.tokensConsumed != null && input.tokensConsumed >= input.tokenLimit
      ? `--max-total-tokens ${input.tokensConsumed + 1}`
      : null;
  const runNeed =
    input.agentRuns >= input.agentRunLimit ? `--max-agent-runs ${input.agentRuns + 1}` : null;
  const timeNeed =
    input.consumedMs >= input.durationLimitMs
      ? `--max-minutes ${Math.ceil(input.consumedMs / 60_000) + 1}`
      : null;
  const flags = [tokenNeed, runNeed, timeNeed].filter(Boolean).join(" ");
  const role = input.incompleteRole ? ` Retry incomplete role ${input.incompleteRole}.` : "";
  return `budget_exhausted. Resume with a strictly higher limit: npm run page:resume -- <run-id> ${flags || "--max-total-tokens <higher> --max-minutes <higher> --max-agent-runs <higher>"}.${role} Consumed totals are not reset.`;
}
