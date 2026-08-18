import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { RunBudget } from "./budget";
import type { ArtifactStore } from "./artifacts";
import type { AggregatedUsage } from "./usage";
import { emptyAggregatedUsage } from "./usage";
import { canonicalizeContract, parseArtifact, type ContractDecision } from "./schemas";
import type { HarnessPhase } from "./phases";
import { HARNESS_PHASES } from "./phases";
import type { MachineState } from "./machine";
import { loadMachine, RunMachine } from "./machine";
import type { IsolatedWorkspace } from "./isolation";
import { RUNTIME_OVERLAY_FILES } from "./isolation";
import { classifyFailure, type FailureCategory } from "./failure";
import type { HarnessRequest } from "./request";
import { requiresServer } from "./server-lease";
import {
  alignUsageWithInvocations,
  buildInvocationLedger,
  type InvocationLedger,
} from "./invocations";

export const HARNESS_SCHEMA_VERSION = 3;

export const RUN_ID_PATTERN = /^[a-z0-9][a-z0-9-]*-\d{8}-[a-f0-9]{8}$/i;

export type ProcessStatus = "running" | "completed" | "failed" | "stopped";

export type ContractReviewRole = "builder" | "evaluator";

export type IncompleteInvocation = {
  round: number;
  role: ContractReviewRole;
  purpose: "contract_reviewer";
  agentId: string | null;
  runId: string | null;
  startedAt: string | null;
  status: "started" | "failed";
  countedTowardBudget: boolean;
};

export type CompletedContractRound = {
  round: number;
  builderDecision: ContractDecision;
  evaluatorDecision: ContractDecision;
  proposalHash: string;
};

export type PersistedBudget = {
  agentRuns: number;
  consumedActiveRuntimeMs: number;
  pausedAt: string | null;
  usage: AggregatedUsage;
  maxAgentRuns: number;
  maxTotalTokens: number;
  maxDurationMinutes: number;
  maxContractRounds: number;
  maxIterations: number;
};

export type ResumeState = {
  schemaVersion: number;
  processStatus: ProcessStatus;
  reusable: boolean;
  resumable: boolean;
  lastCompletedPhase: HarnessPhase | null;
  activePhase: HarnessPhase | null;
  completedPhases: HarnessPhase[];
  contractRound: number;
  completedRounds: number[];
  incompleteInvocation: IncompleteInvocation | null;
  canonicalProposalHash: string | null;
  failureCategory: FailureCategory | null;
  failureMessage: string | null;
  worktreePath: string | null;
  baseSha: string | null;
  expectedHeadSha: string | null;
  route: string;
  suppliedObjective: string | null;
  budget: PersistedBudget;
  invocations?: InvocationLedger | null;
  nextAction: string;
};

export type ResumeValidationOk = { ok: true; state: ResumeState };
export type ResumeValidationErr = {
  ok: false;
  reason: string;
  category: FailureCategory;
  resumable: false;
  reusable: boolean;
  state: ResumeState | null;
};
export type ResumeValidation = ResumeValidationOk | ResumeValidationErr;

export type ResumeGit = {
  currentHead: (cwd: string) => Promise<string>;
  changedFiles: (cwd: string, from: string) => Promise<string[]>;
  dirtyFiles?: (cwd: string) => Promise<string[]>;
};

const OVERLAY_IGNORE = new Set<string>([
  ...RUNTIME_OVERLAY_FILES,
  ".env",
  ".env.local",
  "tsconfig.json",
]);

export function looksLikeRunId(value: string | undefined | null): boolean {
  if (!value) return false;
  const trimmed = value.trim();
  if (trimmed.startsWith("/") || trimmed.startsWith("-")) return false;
  return RUN_ID_PATTERN.test(trimmed);
}

export function looksLikeRoute(value: string | undefined | null): boolean {
  if (!value) return false;
  const trimmed = value.trim();
  return trimmed.startsWith("/") || trimmed === "." || trimmed.includes("\\");
}

export function lastCompletedPhase(
  phases: MachineState["phases"],
): HarnessPhase | null {
  let last: HarnessPhase | null = null;
  for (const phase of HARNESS_PHASES) {
    if (phases[phase]?.status === "completed") last = phase;
  }
  return last;
}

export function completedPhaseList(phases: MachineState["phases"]): HarnessPhase[] {
  return HARNESS_PHASES.filter((phase) => phases[phase]?.status === "completed");
}

export function phaseRequiresDemoServer(phase: HarnessPhase | null): boolean {
  return requiresServer(phase);
}

export function persistBudgetFromLimits(
  request: HarnessRequest,
  input: {
    agentRuns: number;
    consumedActiveRuntimeMs: number;
    pausedAt: string | null;
    usage?: AggregatedUsage | null;
  },
): PersistedBudget {
  return {
    agentRuns: input.agentRuns,
    consumedActiveRuntimeMs: input.consumedActiveRuntimeMs,
    pausedAt: input.pausedAt,
    usage: input.usage ?? emptyAggregatedUsage(),
    maxAgentRuns: request.maxAgentRuns,
    maxTotalTokens: request.maxTotalTokens,
    maxDurationMinutes: request.maxDurationMinutes,
    maxContractRounds: request.maxContractRounds,
    maxIterations: request.maxIterations,
  };
}

export function restoreRunBudget(persisted: PersistedBudget): RunBudget {
  return new RunBudget(
    {
      maxDurationMs: persisted.maxDurationMinutes * 60_000,
      maxAgentRuns: persisted.maxAgentRuns,
      maxTotalTokens: persisted.maxTotalTokens,
      maxIterations: persisted.maxIterations,
      maxContractRounds: persisted.maxContractRounds,
    },
    {
      consumedActiveMs: persisted.consumedActiveRuntimeMs,
      agentRuns: persisted.agentRuns,
      usage: persisted.usage,
      paused: true,
    },
  );
}

export function remainingBudgetLines(budget: PersistedBudget): string[] {
  const remainingMs = Math.max(
    0,
    budget.maxDurationMinutes * 60_000 - budget.consumedActiveRuntimeMs,
  );
  const tokenLabel =
    budget.usage.availability === "partial"
      ? `>= ${budget.usage.totalTokens} / ${budget.maxTotalTokens} (partial; not fully enforced retrospectively)`
      : budget.usage.totalTokens == null
        ? `unknown / ${budget.maxTotalTokens}`
        : `${budget.usage.totalTokens} / ${budget.maxTotalTokens}`;
  return [
    `agentRuns: ${budget.agentRuns} / ${budget.maxAgentRuns} (remaining ${Math.max(0, budget.maxAgentRuns - budget.agentRuns)})`,
    `tokens: ${tokenLabel}`,
    `activeRuntimeMs: ${budget.consumedActiveRuntimeMs} / ${budget.maxDurationMinutes * 60_000} (remaining ${remainingMs}ms)`,
    `contractRounds: in progress; cap ${budget.maxContractRounds} (not reset)`,
  ];
}

export function discoverContractProgress(store: ArtifactStore): {
  completed: CompletedContractRound[];
  incomplete: IncompleteInvocation | null;
  canonicalProposalHash: string | null;
} {
  const completed: CompletedContractRound[] = [];
  let incomplete: IncompleteInvocation | null = null;
  let lastHash: string | null = null;
  const drafted = store.readJson("contract.canonical.json");
  if (drafted) {
    try {
      lastHash = canonicalizeContract(drafted as Parameters<typeof canonicalizeContract>[0]).hash;
    } catch {
      lastHash = null;
    }
  }

  for (let round = 1; round <= 32; round += 1) {
    const builderRaw = store.readJson(`contract-decision-builder-${round}.json`);
    const evaluatorRaw = store.readJson(`contract-decision-evaluator-${round}.json`);
    const proposal = store.readJson(`contract-proposal-${round - 1}.json`) as
      | { hash?: string }
      | null;
    if (proposal?.hash) lastHash = proposal.hash;

    if (builderRaw && evaluatorRaw) {
      const builder = parseArtifact("contract-decision", builderRaw);
      const evaluator = parseArtifact("contract-decision", evaluatorRaw);
      completed.push({
        round,
        builderDecision: builder,
        evaluatorDecision: evaluator,
        proposalHash: lastHash ?? "",
      });
      continue;
    }
    if (builderRaw && !evaluatorRaw) {
      parseArtifact("contract-decision", builderRaw);
      incomplete = {
        round,
        role: "evaluator",
        purpose: "contract_reviewer",
        agentId: null,
        runId: null,
        startedAt: null,
        status: "started",
        countedTowardBudget: true,
      };
      break;
    }
    if (!builderRaw && !evaluatorRaw) {
      break;
    }
    if (!builderRaw && evaluatorRaw) {
      throw new Error(
        `Corrupted contract artifacts: evaluator decision exists for round ${round} without a builder decision.`,
      );
    }
  }

  const live = store.readJson("contract.json");
  if (live) {
    try {
      lastHash = canonicalizeContract(live as Parameters<typeof canonicalizeContract>[0]).hash;
    } catch {
      // keep previous hash
    }
  }

  return { completed, incomplete, canonicalProposalHash: lastHash };
}

export function inferIncompleteFromFailure(
  discovered: ReturnType<typeof discoverContractProgress>,
  failureMessage: string | null,
  maxContractRounds: number,
): IncompleteInvocation | null {
  if (discovered.incomplete) return discovered.incomplete;
  if (!failureMessage) return null;
  const nextRound = discovered.completed.length + 1;
  if (nextRound > maxContractRounds) return null;
  const classified = classifyFailure(failureMessage);
  if (!classified.retryable) return null;
  const builderFailed = /builder run failed/i.test(failureMessage);
  const evaluatorFailed = /evaluator run failed/i.test(failureMessage);
  const runId = failureMessage.match(/run-[0-9a-f-]+/i)?.[0] ?? null;
  if (builderFailed || (!evaluatorFailed && classified.retryable)) {
    return {
      round: nextRound,
      role: "builder",
      purpose: "contract_reviewer",
      agentId: null,
      runId,
      startedAt: null,
      status: "failed",
      countedTowardBudget: true,
    };
  }
  if (evaluatorFailed) {
    return {
      round: nextRound,
      role: "evaluator",
      purpose: "contract_reviewer",
      agentId: null,
      runId,
      startedAt: null,
      status: "failed",
      countedTowardBudget: true,
    };
  }
  return null;
}

export function countAgentRunsFromLog(runRoot: string): number {
  const logFile = path.join(runRoot, "log.txt");
  if (!existsSync(logFile)) return 0;
  const text = readFileSync(logFile, "utf8");
  const matches = text.match(/\b(?:planner|builder|evaluator|skeptic) run=/g);
  return matches?.length ?? 0;
}

export function consumedRuntimeFromMachine(machine: MachineState): number {
  const start =
    machine.phases.PRECHECK.startedAt ??
    machine.phases.WORKTREE.startedAt ??
    machine.updatedAt;
  const end =
    machine.phases.DUAL_REVIEW.endedAt ??
    machine.stopReason
      ? machine.updatedAt
      : machine.updatedAt;
  const from = Date.parse(start);
  const endedAt =
    machine.phases.DUAL_REVIEW.endedAt ??
    Object.values(machine.phases)
      .map((row) => row.endedAt)
      .filter((value): value is string => Boolean(value))
      .sort()
      .at(-1) ??
    machine.updatedAt;
  const to = Date.parse(endedAt);
  if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) return 0;
  return to - from;
}

export function hydrateResumeState(options: {
  store: ArtifactStore;
  machine: MachineState;
  runRoot: string;
}): ResumeState {
  const existing = options.store.readJson("resume-state.json") as ResumeState | null;
  const request = options.machine.request;
  const isolation = options.machine.isolation as IsolatedWorkspace;
  const discovered = discoverContractProgress(options.store);
  const status = options.store.readJson("run-status.json") as {
    reusable?: boolean;
    resumable?: boolean;
    failedPhase?: string;
    reason?: string;
    processStatus?: ProcessStatus;
    failureCategory?: FailureCategory;
  } | null;
  const fatal = options.store.readJson("fatal.json") as { message?: string } | null;
  const failureMessage =
    options.machine.stopReason ?? status?.reason ?? fatal?.message ?? null;
  const classified = failureMessage ? classifyFailure(failureMessage) : null;
  const incomplete = options.machine.contractLocked
    ? null
    : (options.machine.incompleteInvocation ??
      existing?.incompleteInvocation ??
      inferIncompleteFromFailure(discovered, failureMessage, request.maxContractRounds));
  const processStatus = deriveProcessStatus(options.machine, status?.processStatus);
  const reusable = processStatus === "completed" && status?.reusable === true;
  const consistent = artifactsInternallyConsistent(options.store, discovered);
  const crashInterrupted =
    !classified &&
    processStatus === "running" &&
    consistent &&
    (Boolean(incomplete) || options.machine.currentPhase !== "REPORT");
  const retryable =
    classified?.retryable === true || crashInterrupted;
  const dualReviewNeedsRole =
    options.machine.currentPhase === "DUAL_REVIEW" ||
    options.machine.phases.DUAL_REVIEW.status === "failed" ||
    options.machine.phases.DUAL_REVIEW.status === "in_progress";
  const resumable =
    processStatus !== "completed" &&
    consistent &&
    retryable &&
    (!dualReviewNeedsRole || Boolean(incomplete));
  const completedPhases = completedPhaseList(options.machine.phases);
  const last = lastCompletedPhase(options.machine.phases);
  const diskBudget = options.store.readJson("budget.json") as PersistedBudget | null;
  const persistedBudget = existing?.budget ?? diskBudget;
  const ledger = buildInvocationLedger({
    runRoot: options.runRoot,
    usage: persistedBudget?.usage ?? null,
  });
  if (persistedBudget?.usage) {
    alignUsageWithInvocations(persistedBudget.usage, ledger);
  }
  const agentRuns =
    persistedBudget?.agentRuns ??
    Math.max(
      ledger.total,
      countAgentRunsFromLog(options.runRoot),
      discovered.completed.length * 2 + (incomplete ? 1 : 0),
    );
  const budget = persistBudgetFromLimits(request, {
    agentRuns,
    consumedActiveRuntimeMs:
      persistedBudget?.consumedActiveRuntimeMs ??
      consumedRuntimeFromMachine(options.machine),
    pausedAt: persistedBudget?.pausedAt ?? options.machine.updatedAt,
    usage: persistedBudget?.usage ?? emptyAggregatedUsage(),
  });
  const contractRound = incomplete?.round ?? discovered.completed.length;
  const state: ResumeState = {
    schemaVersion: HARNESS_SCHEMA_VERSION,
    processStatus,
    reusable,
    resumable,
    lastCompletedPhase: last,
    activePhase: options.machine.currentPhase,
    completedPhases,
    contractRound,
    completedRounds: discovered.completed.map((row) => row.round),
    incompleteInvocation: incomplete,
    canonicalProposalHash:
      discovered.canonicalProposalHash ?? existing?.canonicalProposalHash ?? null,
    failureCategory:
      classified?.category ??
      (crashInterrupted ? "retryable_process" : null) ??
      status?.failureCategory ??
      null,
    failureMessage,
    worktreePath: isolation.worktreePath ?? null,
    baseSha: isolation.baseSha ?? null,
    expectedHeadSha: isolation.baseSha ?? null,
    route: request.route,
    suppliedObjective: request.suppliedObjective,
    budget,
    invocations: ledger,
    nextAction: describeNextAction({
      processStatus,
      reusable,
      resumable,
      incomplete,
      contractRound,
      maxContractRounds: request.maxContractRounds,
      phase: options.machine.currentPhase,
      failureCategory:
        classified?.category ??
        (crashInterrupted ? "retryable_process" : null) ??
        status?.failureCategory ??
        null,
      failureMessage,
    }),
  };
  return state;
}

function deriveProcessStatus(
  machine: MachineState,
  recorded?: string,
): ProcessStatus {
  const coerced = coerceProcessStatus(recorded);
  if (coerced) return coerced;
  if (machine.phases.REPORT.status === "completed") return "completed";
  if (machine.stopReason || Object.values(machine.phases).some((row) => row.status === "failed")) {
    return "failed";
  }
  if (Object.values(machine.phases).some((row) => row.status === "in_progress")) {
    return "running";
  }
  return "running";
}

function coerceProcessStatus(recorded?: string | null): ProcessStatus | undefined {
  if (!recorded) return undefined;
  if (recorded === "audit_complete" || recorded === "passed") return "completed";
  if (recorded === "cancelled") return "stopped";
  if (
    recorded === "running" ||
    recorded === "completed" ||
    recorded === "failed" ||
    recorded === "stopped"
  ) {
    return recorded;
  }
  return undefined;
}

function artifactsInternallyConsistent(
  store: ArtifactStore,
  discovered: ReturnType<typeof discoverContractProgress>,
): boolean {
  try {
    if (!store.readJson("request.json")) return false;
    if (!store.readJson("contract.json")) return false;
    if (!store.readJson("baseline.json")) return false;
    for (const round of discovered.completed) {
      parseArtifact("contract-decision", round.builderDecision);
      parseArtifact("contract-decision", round.evaluatorDecision);
    }
    return true;
  } catch {
    return false;
  }
}

export function describeNextAction(input: {
  processStatus: ProcessStatus;
  reusable: boolean;
  resumable: boolean;
  incomplete: IncompleteInvocation | null;
  contractRound: number;
  maxContractRounds: number;
  phase: HarnessPhase;
  failureCategory?: FailureCategory | null;
  failureMessage?: string | null;
}): string {
  if (input.reusable && !input.resumable) {
    return "Completed audit is reusable via --from-audit; it is not resumable.";
  }
  if (!input.resumable) {
    return "Not resumable. Start a new audit or repair the blocking failure.";
  }
  if (input.incomplete?.role === "builder") {
    return `Retry round-${input.incomplete.round} builder contract reviewer with a fresh Grok 4.6 xhigh context, then run the evaluator reviewer if the builder decision succeeds. Do not repeat the planner or completed contract rounds. Contract round cap remains ${input.maxContractRounds}.`;
  }
  if (input.incomplete?.role === "evaluator") {
    return `Retry round-${input.incomplete.round} evaluator contract reviewer with a fresh Grok 4.6 xhigh context. Keep the persisted builder decision for that round. Contract round cap remains ${input.maxContractRounds}.`;
  }
  if (
    input.failureCategory === "infrastructure" ||
    /econnrefused|infrastructure/i.test(input.failureMessage ?? "") ||
    input.phase === "VERIFY" ||
    input.phase === "EVALUATE" ||
    input.phase === "OPTIONAL_SKEPTIC"
  ) {
    return "Start the harness-owned demo server, rerun target baseline verification, then run a fresh evaluator and required skeptic. Do not repeat the planner or completed contract reviewers.";
  }
  return `Resume ${input.phase} from the last atomically completed state.`;
}

export function formatRunStatus(runId: string, state: ResumeState): string {
  const lines = [
    `run: ${runId}`,
    `route: ${state.route}`,
    `processStatus: ${state.processStatus}`,
    `reusable: ${state.reusable ? "yes" : "no"}`,
    `resumable: ${state.resumable ? "yes" : "no"}`,
    `failedPhase: ${state.processStatus === "failed" ? state.activePhase ?? "n/a" : "n/a"}`,
    `activePhase: ${state.activePhase ?? "n/a"}`,
    `completedPhases: ${state.completedPhases.join(", ") || "none"}`,
    `contractRound: ${state.contractRound}`,
    `completedContractRounds: ${state.completedRounds.join(", ") || "none"}`,
    `incompleteRole: ${state.incompleteInvocation ? `${state.incompleteInvocation.role}/${state.incompleteInvocation.purpose}` : "none"}`,
    `invocations: ${
      state.invocations
        ? `total ${state.invocations.total}, completed ${state.invocations.completed}, failed ${state.invocations.failed}`
        : "n/a"
    }`,
    `invocationsByRole: ${
      state.invocations
        ? Object.entries(state.invocations.byRole)
            .map(([role, count]) => `${role}=${count}`)
            .join(", ") || "none"
        : "n/a"
    }`,
    `invocationsByAttempt: ${
      state.invocations
        ? Object.entries(state.invocations.byAttempt)
            .map(([attempt, count]) => `${attempt}=${count}`)
            .join(", ") || "none"
        : "n/a"
    }`,
    `failureCategory: ${state.failureCategory ?? "n/a"}`,
    `failure: ${state.failureMessage ?? "n/a"}`,
    `canonicalProposalHash: ${state.canonicalProposalHash ?? "n/a"}`,
    ...remainingBudgetLines(state.budget),
    `nextAction: ${state.nextAction}`,
  ];
  return lines.join("\n");
}

export function writeResumeState(store: ArtifactStore, state: ResumeState): void {
  store.writeJson("resume-state.json", state);
  store.writeJson("run-status.json", {
    processStatus: state.processStatus,
    reusable: state.reusable,
    resumable: state.resumable,
    failedPhase: state.processStatus === "failed" ? state.activePhase : null,
    activePhase: state.activePhase,
    lastCompletedPhase: state.lastCompletedPhase,
    completedPhases: state.completedPhases,
    contractRound: state.contractRound,
    failureCategory: state.failureCategory,
    reason: state.failureMessage,
    nextAction: state.nextAction,
    schemaVersion: state.schemaVersion,
    completedAt: state.processStatus === "running" ? null : new Date().toISOString(),
  });
  store.writeJson("budget.json", state.budget);
}

export function migratePersistedRun(store: ArtifactStore, runRoot: string): ResumeState {
  const machine = loadMachine(runRoot);
  if (!machine) {
    throw new Error(`No machine.json at ${runRoot}`);
  }
  const state = hydrateResumeState({ store, machine, runRoot });
  const runtime = new RunMachine(runRoot, machine);
  runtime.state.version = 3;
  runtime.state.schemaVersion = HARNESS_SCHEMA_VERSION;
  runtime.state.lastCompletedPhase = state.lastCompletedPhase;
  runtime.state.contractRound = state.contractRound;
  runtime.state.completedContractRounds = state.completedRounds;
  runtime.state.incompleteInvocation = state.incompleteInvocation;
  runtime.state.canonicalProposalHash = state.canonicalProposalHash;
  runtime.state.failureCategory = state.failureCategory;
  runtime.persist();
  writeResumeState(store, state);
  return state;
}

export async function validateResume(options: {
  store: ArtifactStore;
  runRoot: string;
  repoRoot: string;
  git?: ResumeGit;
  now?: Date;
}): Promise<ResumeValidation> {
  const machine = loadMachine(options.runRoot);
  if (!machine) {
    return {
      ok: false,
      reason: "No resumable machine state (machine.json missing).",
      category: "corrupted_artifact",
      resumable: false,
      reusable: false,
      state: null,
    };
  }
  let state: ResumeState;
  try {
    state = hydrateResumeState({
      store: options.store,
      machine,
      runRoot: options.runRoot,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      reason: `Corrupted artifacts: ${message}`,
      category: "corrupted_artifact",
      resumable: false,
      reusable: false,
      state: null,
    };
  }

  if (state.reusable && !state.resumable) {
    return {
      ok: false,
      reason: "Completed audit is reusable via --from-audit but is not resumable.",
      category: "unknown_fatal",
      resumable: false,
      reusable: true,
      state,
    };
  }

  if (!state.resumable) {
    return {
      ok: false,
      reason:
        state.failureMessage ??
        `Run is not resumable (${state.failureCategory ?? "unknown"}).`,
      category: state.failureCategory ?? "unknown_fatal",
      resumable: false,
      reusable: state.reusable,
      state,
    };
  }

  const request = options.store.readJson("request.json") as {
    route?: string;
    suppliedObjective?: string | null;
  } | null;
  if (!request?.route || request.route !== state.route) {
    return failValidation(
      state,
      "provenance",
      "Persisted route does not match the original request.",
    );
  }
  if ((request.suppliedObjective ?? null) !== state.suppliedObjective) {
    return failValidation(
      state,
      "provenance",
      "Persisted supplied objective does not match the original request.",
    );
  }

  const isolation = machine.isolation as IsolatedWorkspace;
  if (isolation.mode === "worktree") {
    if (!isolation.worktreePath || !existsSync(isolation.worktreePath)) {
      return failValidation(
        state,
        "incompatible_worktree",
        `Original isolated worktree is missing: ${isolation.worktreePath ?? "(unset)"}.`,
      );
    }
    if (options.git) {
      const head = await options.git.currentHead(isolation.worktreePath);
      if (state.expectedHeadSha && head !== state.expectedHeadSha) {
        return failValidation(
          state,
          "incompatible_worktree",
          `Worktree HEAD ${head} does not match persisted SHA ${state.expectedHeadSha}.`,
        );
      }
      if (isolation.baseSha && head !== isolation.baseSha && state.expectedHeadSha === isolation.baseSha) {
        return failValidation(
          state,
          "incompatible_worktree",
          `Worktree current SHA ${head} does not match base SHA ${isolation.baseSha}.`,
        );
      }
      const changed = await options.git.changedFiles(
        isolation.worktreePath,
        isolation.baseSha ?? head,
      );
      const dirty = options.git.dirtyFiles
        ? await options.git.dirtyFiles(isolation.worktreePath)
        : [];
      const appEdits = [...new Set([...changed, ...dirty])].filter(
        (file) => !OVERLAY_IGNORE.has(file.replace(/\\/g, "/")),
      );
      if (appEdits.length) {
        return failValidation(
          state,
          "application_edit",
          `Application edit detected in worktree: ${appEdits.join(", ")}.`,
        );
      }
    }
  }

  try {
    discoverContractProgress(options.store);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return failValidation(state, "corrupted_artifact", message);
  }

  const dualReview =
    machine.currentPhase === "DUAL_REVIEW" ||
    machine.phases.DUAL_REVIEW.status === "failed" ||
    machine.phases.DUAL_REVIEW.status === "in_progress";
  if (dualReview && !state.incompleteInvocation) {
    return failValidation(
      state,
      "unknown_fatal",
      "Evidence is insufficient to resume: no incomplete reviewer invocation was recorded.",
    );
  }

  return { ok: true, state };
}

function failValidation(
  state: ResumeState,
  category: FailureCategory,
  reason: string,
): ResumeValidationErr {
  return {
    ok: false,
    reason,
    category,
    resumable: false,
    reusable: state.reusable,
    state: {
      ...state,
      resumable: false,
      failureCategory: category,
      failureMessage: reason,
      nextAction: "Not resumable. Start a new audit or repair the blocking failure.",
    },
  };
}

export function resolveResumeRunId(options: {
  script: string;
  resumeFlag?: string;
  positional?: string;
  repoRoot: string;
}): { ok: true; runId: string } | { ok: false; message: string } {
  const flagged = options.resumeFlag?.trim();
  const positional = options.positional?.trim();
  const candidate = flagged || (options.script === "page:resume" ? positional : undefined);
  if (options.script === "page:resume") {
    if (!candidate) {
      return { ok: false, message: "page:resume requires a run id, not a route." };
    }
    if (looksLikeRoute(candidate)) {
      return {
        ok: false,
        message: `page:resume requires a run id. Refusing to treat ${candidate} as a route or start a new run.`,
      };
    }
    const root = path.join(options.repoRoot, "tmp", "page-harness", candidate);
    if (!existsSync(root)) {
      return {
        ok: false,
        message: `Run not found: ${candidate}. page:resume will not start a new run.`,
      };
    }
    return { ok: true, runId: candidate };
  }
  if (flagged) {
    const root = path.join(options.repoRoot, "tmp", "page-harness", flagged);
    if (!existsSync(root)) {
      return { ok: false, message: `Run not found: ${flagged}.` };
    }
    return { ok: true, runId: flagged };
  }
  return { ok: false, message: "no resume id" };
}

export function listRunPromptFiles(runRoot: string): string[] {
  const dir = path.join(runRoot, "artifacts", "prompts");
  if (!existsSync(dir)) return [];
  return readdirSync(dir).map((file) => path.join(dir, file));
}
