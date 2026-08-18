import { copyFileSync, existsSync } from "node:fs";
import path from "node:path";
import { ArtifactStore, createRunPaths } from "./artifacts";
import { effectiveHarnessRequest } from "./policy";
import { verifyHasInfrastructureFailure, type VerifyResult } from "./verify";
import { loadMachine, RunMachine } from "./machine";
import {
  alignUsageWithInvocations,
  buildInvocationLedger,
} from "./invocations";
import { hydrateResumeState, writeResumeState } from "./resume";
import { nowIso } from "./util";

export type RemediationResult = {
  ok: boolean;
  runId: string;
  resumable: boolean;
  reusable: boolean;
  activePhase: string | null;
  remainingAgentRuns: number;
  remainingActiveRuntimeMs: number;
  invocations: {
    total: number;
    completed: number;
    failed: number;
    byRole: Record<string, number>;
    byAttempt: Record<string, number>;
  };
  budgetConflict?: string;
  reason: string;
};

export function remediateInfrastructureFailedAudit(options: {
  repoRoot: string;
  runId: string;
}): RemediationResult {
  const paths = createRunPaths(options.repoRoot, options.runId);
  const store = new ArtifactStore(paths);
  const loaded = loadMachine(paths.root);
  if (!loaded) {
    return fail(options.runId, "machine.json is missing.");
  }
  const machine = new RunMachine(paths.root, loaded);
  const isolation = machine.state.isolation as {
    worktreePath?: string | null;
    baseSha?: string | null;
    agentCwd?: string;
  };
  const worktree = isolation.worktreePath ?? isolation.agentCwd;
  if (!worktree || !existsSync(worktree)) {
    return fail(options.runId, `Worktree is missing at ${worktree ?? "unknown"}.`);
  }
  if (!machine.state.contractLocked || !machine.state.contractHash) {
    return fail(options.runId, "Locked contract is missing.");
  }
  if (!store.readJson("contract.json") || !store.readJson("baseline.json") || !store.readJson("page-map.json")) {
    return fail(options.runId, "Planner artifacts are missing.");
  }
  for (const round of machine.state.completedContractRounds ?? []) {
    if (
      !store.readJson(`contract-decision-builder-${round}.json`) ||
      !store.readJson(`contract-decision-evaluator-${round}.json`)
    ) {
      return fail(options.runId, `Contract consensus artifacts for round ${round} are missing.`);
    }
  }

  const verify = (store.readJson("verify-baseline.json") as VerifyResult[] | null) ?? [];
  const infra = verifyHasInfrastructureFailure(verify);
  copyIfExists(
    path.join(paths.artifacts, "evaluation.json"),
    path.join(paths.artifacts, "evaluation-superseded.json"),
  );
  copyIfExists(
    path.join(paths.artifacts, "verify-baseline.json"),
    path.join(paths.artifacts, "verify-baseline-infrastructure-failed.json"),
  );

  const budget = store.readJson("budget.json") as {
    agentRuns: number;
    consumedActiveRuntimeMs: number;
    maxAgentRuns: number;
    maxDurationMinutes: number;
    usage: import("./usage").AggregatedUsage;
  } | null;
  if (!budget) {
    return fail(options.runId, "budget.json is missing.");
  }
  const remainingAgentRuns = Math.max(0, budget.maxAgentRuns - budget.agentRuns);
  const remainingActiveRuntimeMs = Math.max(
    0,
    budget.maxDurationMinutes * 60_000 - budget.consumedActiveRuntimeMs,
  );
  const ledger = buildInvocationLedger({
    runRoot: paths.root,
    usage: budget.usage,
  });
  alignUsageWithInvocations(budget.usage, ledger);
  store.writeJson("invocation-ledger.json", ledger);
  store.writeJson("budget.json", budget);

  const request = effectiveHarnessRequest(machine.state.request);
  machine.state.request = { ...machine.state.request, skeptic: request.skeptic };
  machine.reopen("VERIFY", "infrastructure-failed target verification; rerun after server lease");
  machine.reopen("EVALUATE", "superseded evaluator result that scored infrastructure-failed evidence");
  machine.reopen("OPTIONAL_SKEPTIC", "required skeptic was skipped");
  machine.state.currentPhase = "VERIFY";
  machine.state.lastCompletedPhase = "CONTRACT_LOCK";
  machine.state.stopReason = infra
    ? "Target verification failed for infrastructure reasons: connect ECONNREFUSED"
    : "Required target verification must be rerun against a live harness-owned origin.";
  machine.state.failureCategory = "infrastructure";
  machine.persist();

  const requiredRoles = request.skeptic ? 2 : 1;
  const budgetConflict =
    remainingAgentRuns < requiredRoles
      ? `Need ${requiredRoles} remaining agent runs for evaluator${request.skeptic ? " and skeptic" : ""}; remaining ${remainingAgentRuns}. Budgets were not reset.`
      : remainingActiveRuntimeMs <= 0
        ? `Need remaining active runtime for verification/evaluation; remaining ${remainingActiveRuntimeMs}ms. Budgets were not reset.`
        : undefined;

  store.writeJson("remediation.json", {
    remediating: true,
    at: nowIso(),
    reason:
      "Infrastructure-failed Playwright target verification and missing required skeptic. Locked contract and historical artifacts preserved.",
    preserved: {
      contractHash: machine.state.contractHash,
      planner: true,
      contractRounds: machine.state.completedContractRounds ?? [],
      supersededEvaluation: "evaluation-superseded.json",
      infrastructureVerify: "verify-baseline-infrastructure-failed.json",
    },
    next: {
      activePhase: "VERIFY",
      rerunPlanner: false,
      rerunContractReview: false,
      acquireServer: true,
      rerunTargetVerification: true,
      freshEvaluator: true,
      requiredSkeptic: request.skeptic,
    },
    budgetConflict: budgetConflict ?? null,
  });

  const resume = hydrateResumeState({
    store,
    machine: machine.state,
    runRoot: paths.root,
  });
  resume.processStatus = "failed";
  resume.reusable = false;
  resume.resumable = !budgetConflict;
  resume.activePhase = "VERIFY";
  resume.lastCompletedPhase = "CONTRACT_LOCK";
  resume.failureCategory = "infrastructure";
  resume.failureMessage = machine.state.stopReason;
  resume.incompleteInvocation = null;
  resume.invocations = ledger;
  resume.budget = {
    ...resume.budget,
    agentRuns: budget.agentRuns,
    consumedActiveRuntimeMs: budget.consumedActiveRuntimeMs,
    usage: budget.usage,
  };
  resume.nextAction =
    "Start the harness-owned demo server, rerun target baseline verification, then run a fresh evaluator and required skeptic. Do not repeat the planner or completed contract reviewers.";
  writeResumeState(store, resume);

  return {
    ok: true,
    runId: options.runId,
    resumable: resume.resumable,
    reusable: false,
    activePhase: "VERIFY",
    remainingAgentRuns,
    remainingActiveRuntimeMs,
    invocations: {
      total: ledger.total,
      completed: ledger.completed,
      failed: ledger.failed,
      byRole: ledger.byRole,
      byAttempt: ledger.byAttempt,
    },
    budgetConflict,
    reason: resume.nextAction,
  };
}

function fail(runId: string, reason: string): RemediationResult {
  return {
    ok: false,
    runId,
    resumable: false,
    reusable: false,
    activePhase: null,
    remainingAgentRuns: 0,
    remainingActiveRuntimeMs: 0,
    invocations: { total: 0, completed: 0, failed: 0, byRole: {}, byAttempt: {} },
    reason,
  };
}

function copyIfExists(from: string, to: string): void {
  if (!existsSync(from)) return;
  copyFileSync(from, to);
}

export function remediateScannerAuditIfPresent(repoRoot: string): RemediationResult | null {
  const runId = "scanner-20260818-d66a2767";
  const root = path.join(repoRoot, "tmp", "page-harness", runId);
  if (!existsSync(path.join(root, "machine.json"))) return null;
  return remediateInfrastructureFailedAudit({ repoRoot, runId });
}
