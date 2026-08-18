import path from "node:path";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { AgentInvocationError, type AgentHost, type AgentSession } from "./agents";
import { ArtifactStore, type RunPaths } from "./artifacts";
import { AuditReuseError, loadAuditReuse, auditFingerprint } from "./audit-reuse";
import { BudgetExceededError, RunBudget } from "./budget";
import {
  lookupPage,
  BASELINE_VIEWPORTS,
  FULL_VIEWPORTS,
} from "./catalog";
import {
  compareCheckpointRanks,
  pickBestCheckpoint,
  shouldRestoreBaseline,
  type CheckpointRank,
} from "./checkpoints";
import { snapshotRedactedConfig } from "./config-snapshot";
import { agreeContract } from "./contract-consensus";
import { classifyFailure } from "./failure";
import {
  discoverContractProgress,
  hydrateResumeState,
  inferIncompleteFromFailure,
  persistBudgetFromLimits,
  writeResumeState,
} from "./resume";
import {
  bindPreLockProvenance,
  isEvidenceFresh,
  type ProvenanceManifest,
} from "./evidence";
import { inspectRoute, compareInspect, type InspectReport } from "./inspect";
import { InspectAuthError, assertInspectEvidence } from "./inspect-auth";
import {
  checkpoint,
  changedFiles,
  currentHead,
  ensureBaselineMirror,
  linkWorkspaceDependencies,
  restoreCommit,
  type IsolatedWorkspace,
} from "./isolation";
import { createMachine, RunMachine } from "./machine";
import {
  auditAfterEvidence,
  collectedAfterEvidence,
  deriveContractResult,
  evaluatedWorktreeSha,
  mergeTargetVerification,
  missingAfterEvidence,
  resolveRiskPolicy,
  type AfterEvidence,
  type RiskPolicy,
} from "./policy";
import { builderPrompt, evaluatorPrompt, plannerPrompt } from "./prompts";
import { writeReport } from "./report";
import type { RestoreKind, VerificationSource } from "./report";
import type { ContractResult, HarnessRequest, HarnessResultStatus } from "./request";
import {
  compareAdjacentRegression,
  evaluateCompleteRequiredPass,
  fingerprintsFromVerifyResults,
  selectBudgetRestoreCommit,
  type FailureFingerprint,
  type RegressionBaseline,
} from "./regression";
import {
  evaluationCompleteness,
  evaluationHasStructuralFailure,
  scoreEvaluation,
  canonicalizeContract,
  type Evaluation,
  type GateEvidenceContext,
  type PageContract,
  type PageMap,
  type Baseline,
} from "./schemas";
import { accountSdkUsage, type AggregatedUsage } from "./usage";
import { nowIso, type Logger } from "./util";
import {
  classifyVerifyResults,
  runVerification,
  verificationSummary,
  affectedAdjacentPages,
  type VerifyResult,
} from "./verify";

export type { HarnessRequest } from "./request";

export type GitOps = {
  checkpoint: typeof checkpoint;
  restoreCommit: typeof restoreCommit;
  changedFiles: typeof changedFiles;
  currentHead: typeof currentHead;
};

export type HarnessDeps = {
  host: AgentHost;
  store: ArtifactStore;
  paths: RunPaths;
  isolation: IsolatedWorkspace;
  baseUrl: string;
  log: Logger;
  inspect?: typeof inspectRoute;
  verify?: typeof runVerification;
  git?: Partial<GitOps>;
  machine?: RunMachine;
  budget?: RunBudget;
  model?: unknown;
  regressionBaselineFingerprints?: FailureFingerprint[];
};

export type HarnessResult = {
  status: HarnessResultStatus;
  contractResult: ContractResult;
  reusable: boolean;
  runId: string;
  route: string;
  reportPath: string;
  bestCommit: string | null;
  score: number;
  stopReason?: string | null;
  integrationReady?: boolean;
};

function persistLiveBudget(
  store: ArtifactStore,
  budget: RunBudget,
  request: HarnessRequest,
  paused: boolean,
): void {
  store.writeJson(
    "budget.json",
    persistBudgetFromLimits(request, {
      agentRuns: budget.agentRuns,
      consumedActiveRuntimeMs: budget.elapsedActiveMs(),
      pausedAt: paused ? nowIso() : null,
      usage: budget.usage,
    }),
  );
}

function withBudgetAccounting(
  host: AgentHost,
  budget: RunBudget,
  onTurn?: () => void,
): AgentHost {
  return {
    async open(options) {
      const session = await host.open(options);
      return {
        ...session,
        async send(prompt: string) {
          budget.recordAgentRun();
          budget.assert();
          try {
            const result = await session.send(prompt);
            budget.accountTurn(
              session.role,
              session.purpose,
              result.usageAccount ?? accountSdkUsage(result.usage),
            );
            onTurn?.();
            budget.assert();
            return result;
          } catch (error) {
            if (error instanceof AgentInvocationError && error.usageAccount) {
              budget.accountTurn(session.role, session.purpose, error.usageAccount);
            }
            onTurn?.();
            throw error;
          }
        },
      };
    },
  };
}

async function withSession<T>(
  session: AgentSession,
  fn: (session: AgentSession) => Promise<T>,
): Promise<T> {
  try {
    return await fn(session);
  } finally {
    await session.close();
  }
}

function persistInspect(dir: string, report: InspectReport): string {
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "inspect.json");
  writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return file;
}

function excerpt(file: string, limit = 8000): string {
  try {
    return readFileSync(file, "utf8").slice(0, limit);
  } catch {
    return `(missing ${file})`;
  }
}

export async function runHarness(
  request: HarnessRequest,
  deps: HarnessDeps,
): Promise<HarnessResult> {
  const runId = path.basename(deps.paths.root);
  const budget =
    deps.budget ??
    new RunBudget({
      maxDurationMs: request.maxDurationMinutes * 60_000,
      maxAgentRuns: request.maxAgentRuns,
      maxTotalTokens: request.maxTotalTokens,
      maxIterations: request.maxIterations,
      maxContractRounds: request.maxContractRounds,
    });
  const machine =
    deps.machine ??
    RunMachine.start(
      deps.paths.root,
      createMachine({
        runId,
        request,
        isolation: deps.isolation,
        model: deps.model ?? null,
      }),
    );
  const gitImpl: GitOps = {
    checkpoint,
    restoreCommit,
    changedFiles,
    currentHead,
    ...deps.git,
  };
  const persistBudget = () => persistLiveBudget(deps.store, budget, request, false);
  const hosted: HarnessDeps = {
    ...deps,
    host: withBudgetAccounting(deps.host, budget, persistBudget),
    git: gitImpl,
    budget,
    machine,
  };

  try {
    return await executeHarness(request, hosted, machine, budget, runId, gitImpl);
  } catch (error) {
    if (error instanceof AuditReuseError) {
      deps.store.writeJson("from-audit-rejected.json", { reason: error.reason });
      throw error;
    }
    if (error instanceof BudgetExceededError) {
      deps.log.warn(error.reason);
      machine.state.stopReason = error.reason;
      machine.persist();
      return recoverFromBudget({
        request,
        deps: hosted,
        machine,
        budget,
        runId,
        gitImpl,
        reason: error.reason,
      });
    }
    const message = error instanceof Error ? error.message : String(error);
    const classified = classifyFailure(message);
    budget.pause();
    machine.fail(machine.state.currentPhase, message, classified.category);
    persistLiveBudget(deps.store, budget, request, true);
    const resume = hydrateResumeState({
      store: deps.store,
      machine: machine.state,
      runRoot: deps.paths.root,
    });
    deps.store.writeFailureStatus({
      phase: machine.state.currentPhase,
      message,
      resumable: resume.resumable,
      category: classified.category,
      resume,
    });
    writeResumeState(deps.store, resume);
    throw error;
  }
}

async function executeHarness(
  request: HarnessRequest,
  deps: HarnessDeps,
  machine: RunMachine,
  budget: RunBudget,
  runId: string,
  gitImpl: GitOps,
): Promise<HarnessResult> {
  const page = lookupPage(request.route);
  const inspectRole = request.inspectRole ?? page?.role ?? "member";
  const inspectImpl = deps.inspect ?? inspectRoute;
  const verifyImpl = deps.verify ?? runVerification;
  const policy = resolveRiskPolicy(request.risk);
  budget.resumeClock();
  const persistBudget = () => persistLiveBudget(deps.store, budget, request, false);

  if (!deps.store.readJson("request.json")) {
    deps.store.writeJson("request.json", {
      ...request,
      runId,
      isolation: deps.isolation,
      riskPolicy: policy,
      startedAt: nowIso(),
    });
  }
  deps.store.appendProgress({ phase: "start", route: request.route });

  if (!machine.shouldSkip("BASELINE")) {
    machine.begin("BASELINE", { route: request.route });
    deps.log.info(`inspect baseline ${request.route} as ${inspectRole}`);
    const evaluatedSha = await resolveEvaluatedSha(
      gitImpl,
      deps.isolation.agentCwd,
      deps.isolation.baseSha,
    );
    const before = await inspectImpl({
      baseUrl: deps.baseUrl,
      route: request.route,
      role: inspectRole,
      outDir: deps.paths.inspectBefore,
      viewports: policy.inspectViewports === "full" ? FULL_VIEWPORTS : BASELINE_VIEWPORTS,
      samples: policy.inspectSamples,
      meta: {
        runId,
        route: request.route,
        contractHash: "pending",
        iteration: 0,
        worktreeSha: evaluatedSha,
        serverOrigin: deps.baseUrl,
        browser: "chrome",
        generatingCommand: "inspectRoute baseline",
      },
    });
    deps.store.writeJson("performance/before.json", before);
    persistInspect(deps.paths.inspectBefore, before);
    deps.store.writeJson("config.json", snapshotRedactedConfig());
    if (!before.measuredAt || !before.navigationSamplesMs.length) {
      throw new Error("Baseline performance was not measured; refusing to edit.");
    }
    assertInspectEvidence({
      requestedRoute: request.route,
      expectedOrigin: deps.baseUrl,
      finalUrl: before.finalUrl,
      title: before.title,
      headings: before.headings,
      routeVerified: before.routeVerified,
    });
    machine.complete("BASELINE", {
      measuredAt: before.measuredAt,
      finalUrl: before.finalUrl,
      routeVerified: true,
      worktreeSha: evaluatedSha,
    });
  }
  const before = requireInspect(deps, "performance/before.json");

  let reusedAudit = false;
  if (request.fromAudit && !request.auditOnly && !machine.state.contractLocked) {
    const reuse = loadAuditReuse({
      repoRoot: deps.isolation.repoRoot,
      fromAudit: request.fromAudit,
      request,
      isolation: deps.isolation,
      store: deps.store,
    });
    if (!reuse.ok) {
      throw new AuditReuseError(reuse.reason);
    }
    reusedAudit = true;
    deps.store.writeJson("contract.json", reuse.contract);
    deps.store.writeJson("from-audit.json", { runId: request.fromAudit, hash: reuse.hash });
    machine.lockContract(reuse.hash);
    machine.complete("PLAN", { reusedAudit: request.fromAudit });
    machine.complete("CONTRACT_DRAFT", { reusedAudit: request.fromAudit });
    machine.complete("DUAL_REVIEW", { reusedAudit: request.fromAudit });
    machine.complete("CONTRACT_LOCK", { hash: reuse.hash });
    deps.log.info(`reused audit ${request.fromAudit} hash=${reuse.hash.slice(0, 12)}`);
  }

  if (!reusedAudit && !machine.shouldSkip("PLAN")) {
    machine.begin("PLAN", { route: request.route });
    budget.assert();
    const planner = await deps.host.open({
      role: "planner",
      cwd: deps.isolation.agentCwd,
      purpose: "planner",
    });
    await withSession(planner, (session) =>
      session.send(
        plannerPrompt({
          route: request.route,
          objective: request.objective,
          page,
          inspectPath: path.join(deps.paths.inspectBefore, "inspect.json"),
          performancePath: path.join(deps.paths.performance, "before.json"),
          inspectExcerpt: excerpt(path.join(deps.paths.inspectBefore, "inspect.json")),
        }),
      ),
    );
    machine.complete("PLAN");
  }

  const baseline = requireArtifact<Baseline>(deps.store, "baseline");
  const pageMap = requireArtifact<PageMap>(deps.store, "page-map");
  let contract = requireArtifact<PageContract>(deps.store, "contract");
  assertContractRoute(contract, request.route);
  if (!machine.shouldSkip("CONTRACT_DRAFT")) {
    machine.begin("CONTRACT_DRAFT");
    const drafted = canonicalizeContract(contract);
    deps.store.writeJson("contract.canonical.json", drafted.contract);
    deps.store.writeText("contract.hash.txt", `${drafted.hash}\n`);
    machine.complete("CONTRACT_DRAFT", { hash: drafted.hash });
  }

  if (!machine.state.contractLocked && !machine.shouldSkip("DUAL_REVIEW")) {
    const discovered = discoverContractProgress(deps.store);
    const previousStop = machine.state.stopReason;
    const incomplete =
      machine.state.incompleteInvocation ??
      inferIncompleteFromFailure(
        discovered,
        previousStop,
        request.maxContractRounds,
      );
    machine.begin("DUAL_REVIEW");
    machine.state.stopReason = null;
    machine.state.failureCategory = null;
    if (incomplete) machine.setIncompleteInvocation(incomplete);
    const agreed = await agreeContract({
      route: request.route,
      objective: request.objective,
      contract,
      maxRounds: request.maxContractRounds,
      resume: incomplete
        ? {
            startRound: incomplete.round,
            skipBuilder: incomplete.role === "evaluator",
          }
        : discovered.completed.length
          ? { startRound: discovered.completed.length + 1, skipBuilder: false }
          : undefined,
      deps: {
        host: deps.host,
        store: deps.store,
        isolation: deps.isolation,
        budget,
        log: deps.log,
        machine,
        persistBudget,
      },
    });
    contract = agreed.contract;
    machine.complete("DUAL_REVIEW", { hash: agreed.hash, rounds: agreed.rounds });
    machine.begin("CONTRACT_LOCK");
    machine.lockContract(agreed.hash);
    machine.complete("CONTRACT_LOCK", { hash: agreed.hash });
  }

  contract = requireArtifact<PageContract>(deps.store, "contract");
  const contractHash =
    machine.state.contractHash ?? canonicalizeContract(contract).hash;
  deps.store.writeJson("contract.json", contract);
  if (machine.state.contractLocked) {
    deps.store.writeJson("contract-agreement.json", {
      hash: contractHash,
      agreedAt: nowIso(),
      auditOnly: request.auditOnly,
      locked: true,
    });
  }

  const inspectFilePath = path.join(deps.paths.inspectBefore, "inspect.json");
  const provenance = bindPreLockProvenance({
    runId,
    route: request.route,
    objective: request.objective,
    suppliedObjective: request.suppliedObjective,
    lockedContractHash: contractHash,
    baseSha: deps.isolation.baseSha,
    inspectFilePath,
    inspectMeta: before.meta,
  });
  deps.store.writeJson("provenance.json", provenance);

  if (request.auditOnly) {
    return runAuditTail({
      request,
      deps,
      machine,
      budget,
      runId,
      page,
      baseline,
      pageMap,
      contract,
      contractHash,
      before,
      inspectRole,
      verifyImpl,
      gitImpl,
      policy,
      provenance,
    });
  }

  if (!machine.state.contractLocked) {
    throw new Error("Contract is not locked; refusing to edit.");
  }

  if (!machine.state.startCommit) {
    const start = await gitImpl.checkpoint(
      deps.isolation.agentCwd,
      `page-harness: start ${request.route}`,
    );
    machine.state.startCommit = start.commit;
    machine.persist();
  }

  const ranks: CheckpointRank[] = [];
  let lastEvaluation: Evaluation | null = null;
  let repair: string | undefined;

  for (let iteration = 1; iteration <= request.maxIterations; iteration += 1) {
    machine.startIteration(iteration);
    budget.assert();
    deps.log.info(`builder iteration ${iteration}/${request.maxIterations}`);

    if (!machine.shouldSkip("BUILD")) {
      machine.begin("BUILD", { iteration });
      const builder = await deps.host.open({
        role: "builder",
        cwd: deps.isolation.agentCwd,
        purpose: "builder",
      });
      await withSession(builder, (session) =>
        session.send(
          builderPrompt({
            route: request.route,
            objective: request.objective,
            contractJson: JSON.stringify(contract, null, 2),
            contractHash,
            inspectExcerpt: excerpt(path.join(deps.paths.inspectBefore, "inspect.json")),
            pageMapExcerpt: JSON.stringify(pageMap, null, 2).slice(0, 4000),
            checkpoint: machine.state.bestCommit ?? machine.state.startCommit ?? undefined,
            repair,
          }),
        ),
      );
      machine.complete("BUILD", { iteration });
    }

    const evaluatedSha = await resolveEvaluatedSha(
      gitImpl,
      deps.isolation.agentCwd,
      machine.state.startCommit ?? deps.isolation.baseSha,
    );
    const changed = machine.state.startCommit
      ? await gitImpl.changedFiles(deps.isolation.agentCwd, machine.state.startCommit)
      : [];

    let routeError: InspectAuthError | null = null;
    if (!machine.shouldSkip("VERIFY")) {
      machine.begin("VERIFY", { iteration });
      const verifyRaw = await verifyImpl({
        cwd: deps.isolation.agentCwd,
        route: request.route,
        baseUrl: deps.baseUrl,
        changedFiles: changed,
        timeoutMs: policy.playwrightTimeoutMs,
        requireAdjacent: policy.requireAdjacentRegression,
        meta: {
          runId,
          route: request.route,
          contractHash,
          iteration,
          worktreeSha: evaluatedSha,
          serverOrigin: deps.baseUrl,
          browser: "n/a",
        },
      });
      let after: InspectReport | null = null;
      try {
        after = await inspectImpl({
          baseUrl: deps.baseUrl,
          route: request.route,
          role: inspectRole,
          outDir: path.join(deps.paths.inspectAfter, `iter-${iteration}`),
          viewports: BASELINE_VIEWPORTS,
          samples: policy.inspectSamples,
          meta: {
            runId,
            route: request.route,
            contractHash,
            iteration,
            worktreeSha: evaluatedSha,
            serverOrigin: deps.baseUrl,
            browser: "chrome",
            generatingCommand: `inspectRoute iteration ${iteration}`,
          },
        });
      } catch (error) {
        if (error instanceof InspectAuthError) {
          routeError = error;
        } else {
          throw error;
        }
      }
      if (!after) {
        after = sampleFailedInspect(
          request.route,
          deps.baseUrl,
          runId,
          contractHash,
          iteration,
          evaluatedSha,
        );
      }
      persistInspect(path.join(deps.paths.inspectAfter, `iter-${iteration}`), after);
      try {
        assertInspectEvidence({
          requestedRoute: request.route,
          expectedOrigin: deps.baseUrl,
          finalUrl: after.finalUrl,
          title: after.title,
          headings: after.headings,
          routeVerified: after.routeVerified,
        });
      } catch (error) {
        if (error instanceof InspectAuthError) {
          routeError = error;
        } else {
          throw error;
        }
      }
      deps.store.writeJson(`performance/after-${iteration}.json`, after);
      const merged = mergeTargetVerification({
        requestedRoute: request.route,
        inspect: after,
        expectedOrigin: deps.baseUrl,
        verify: verifyRaw,
      });
      deps.store.writeJson(`verify-iteration-${iteration}.json`, merged.results);
      const compare = compareInspect(before, after);
      deps.store.writeJson(`performance/compare-${iteration}.json`, compare);
      machine.complete("VERIFY", { tests: verificationSummary(merged.results) });
    }

    const after = requireInspect(deps, `performance/after-${iteration}.json`);
    const compare = (deps.store.readJson(`performance/compare-${iteration}.json`) ??
      compareInspect(before, after)) as ReturnType<typeof compareInspect>;
    const verify = (deps.store.readJson(`verify-iteration-${iteration}.json`) ??
      []) as VerifyResult[];
    const inspectPath = path.join(
      deps.paths.inspectAfter,
      `iter-${iteration}`,
      "inspect.json",
    );
    const freshness = isEvidenceFresh({
      meta: after.meta,
      runId,
      route: request.route,
      contractHash,
      iteration,
      requiredWorktreeSha: evaluatedSha,
      phase: "post_edit",
    });
    if (!freshness.ok && !routeError) {
      throw new Error(`Evaluator evidence is not fresh: ${freshness.reason}`);
    }

    const evaluation = await runEvaluator({
      role: "evaluator",
      request,
      deps,
      machine,
      contract,
      contractHash,
      iteration,
      inspectPath,
      performancePath: path.join(deps.paths.performance, `after-${iteration}.json`),
      verifyPath: path.join(deps.paths.artifacts, `verify-iteration-${iteration}.json`),
      comparePath: path.join(
        deps.paths.artifacts,
        `performance/compare-${iteration}.json`,
      ),
      inspectExcerpt: excerpt(inspectPath),
      budget,
    });
    lastEvaluation = evaluation;
    deps.store.writeJson(`evaluation-iteration-${iteration}.json`, evaluation);

    let skepticEval: Evaluation | null = null;
    const completeness = evaluationCompleteness(contract, evaluation, {
      phase: "post_edit",
      lockedContractHash: contractHash,
      inspectMeta: after.meta,
      requiredWorktreeSha: evaluatedSha,
      runId,
      route: request.route,
      iteration,
    });
    const classified = classifyVerifyResults({
      requestedRoute: request.route,
      results: verify,
    });
    const adjacentRequired =
      policy.requireAdjacentRegression &&
      affectedAdjacentPages(request.route, changed).length > 0;
    const baselineFingerprints = await loadBaselineFingerprints({
      deps,
      verifyImpl,
      gitImpl,
      policy,
      request,
      changed,
      adjacentRequired,
    });
    const regression = compareAdjacentRegression({
      policy,
      classified,
      baselineFingerprints,
      adjacentRequired,
    });
    deps.store.writeJson(`regression-iteration-${iteration}.json`, regression);

    if (request.skeptic) {
      if (!machine.shouldSkip("OPTIONAL_SKEPTIC")) {
        machine.begin("OPTIONAL_SKEPTIC", { iteration });
        skepticEval = await runEvaluator({
          role: "skeptic",
          request,
          deps,
          machine,
          contract,
          contractHash,
          iteration,
          inspectPath,
          performancePath: path.join(deps.paths.performance, `after-${iteration}.json`),
          verifyPath: path.join(
            deps.paths.artifacts,
            `verify-iteration-${iteration}.json`,
          ),
          comparePath: path.join(
            deps.paths.artifacts,
            `performance/compare-${iteration}.json`,
          ),
          inspectExcerpt: excerpt(inspectPath),
          budget,
        });
        machine.complete("OPTIONAL_SKEPTIC");
      }
    } else if (!machine.shouldSkip("OPTIONAL_SKEPTIC")) {
      machine.skip("OPTIONAL_SKEPTIC", "skeptic disabled");
    }

    let skepticPassed: boolean | null = null;
    if (skepticEval) {
      const skepticGaps = evaluationCompleteness(contract, skepticEval, {
        phase: "post_edit",
        lockedContractHash: contractHash,
        inspectMeta: after.meta,
        requiredWorktreeSha: evaluatedSha,
        runId,
        route: request.route,
        iteration,
      });
      skepticPassed =
        skepticEval.allRequiredPassed &&
        skepticGaps.failed.length === 0 &&
        !evaluationHasStructuralFailure(skepticGaps);
      if (!skepticPassed) {
        evaluation.targetedRepair = [
          ...evaluation.targetedRepair,
          ...skepticEval.targetedRepair,
        ];
      }
    }

    const passResult = evaluateCompleteRequiredPass({
      evaluationPassed: evaluation.allRequiredPassed,
      completeness,
      skepticRequired: request.skeptic || policy.requireSkeptic,
      skepticPassed,
      classified,
      regression,
      freshnessOk: freshness.ok,
      performanceRegressions: compare.regressions.length,
      routeError: Boolean(routeError),
    });
    const testsFailed = passResult.testsFailed;
    const passed = passResult.passed;

    if (!machine.shouldSkip("CHECKPOINT")) {
      machine.begin("CHECKPOINT", { iteration });
      const score = scoreEvaluation(contract, evaluation, completeness);
      const snap = await gitImpl.checkpoint(
        deps.isolation.agentCwd,
        `page-harness: ${request.route} iteration ${iteration} score ${score}`,
      );
      const rank: CheckpointRank = {
        commit: snap.commit ?? `iter-${iteration}`,
        iteration,
        completeRequiredPass: passed,
        severeWarningCount: evaluation.targetedRepair.length,
        performanceScore: performanceScore(before, after),
        dataCorrectnessScore: dataScore(evaluation),
        regressionCount: compare.regressions.length,
        diffSize: changed.length,
        evaluationScore: score,
      };
      ranks.push(rank);
      deps.store.writeJson(`checkpoint-${iteration}.json`, rank);
      deps.store.writeJson(
        "checkpoint-ranking.json",
        [...ranks].sort(compareCheckpointRanks),
      );
      const best = pickBestCheckpoint(ranks);
      if (best && !shouldRestoreBaseline(best)) {
        machine.state.bestCommit = best.commit;
      }
      machine.persist();
      machine.complete("CHECKPOINT", rank);
    }

    machine.begin("REPAIR_OR_FINISH", { iteration, passed });
    if (passed) {
      deps.log.info(`iteration ${iteration} passed`);
      machine.complete("REPAIR_OR_FINISH", { next: "finish" });
      break;
    }
    repair = formatRepair(evaluation, skepticEval, verify, compare);
    if (routeError) {
      repair = `${repair}\nInspect: ${routeError.message}`;
    }
    deps.store.writeJson(`failed-approaches/iteration-${iteration}.json`, {
      iteration,
      repair,
      completeness,
      testsFailed,
      reasons: passResult.reasons,
      regression,
      regressions: compare.regressions,
      routeError: routeError?.message ?? null,
    });
    machine.complete("REPAIR_OR_FINISH", { next: "repair" });
    if (iteration === request.maxIterations) {
      deps.log.warn("iteration budget exhausted without a fully passing evaluation");
      machine.state.stopReason = "max-iterations exhausted";
      machine.persist();
    }
  }

  const ranked = [...ranks].sort(compareCheckpointRanks);
  deps.store.writeJson("checkpoint-ranking.json", ranked);
  const best = pickBestCheckpoint(ranks);
  const restoreTo = machine.state.bestCommit ?? machine.state.startCommit;
  if (!machine.shouldSkip("RESTORE_BEST") && restoreTo) {
    machine.begin("RESTORE_BEST", { commit: restoreTo });
    await gitImpl.restoreCommit(deps.isolation.agentCwd, restoreTo);
    if (deps.isolation.mode === "worktree" && deps.isolation.worktreePath) {
      linkWorkspaceDependencies(deps.isolation.repoRoot, deps.isolation.agentCwd);
    }
    deps.log.info(
      shouldRestoreBaseline(best)
        ? `no complete pass; restored baseline ${restoreTo}`
        : `restored best passing checkpoint ${restoreTo}`,
    );
    machine.state.bestCommit = shouldRestoreBaseline(best) ? null : restoreTo;
    machine.complete("RESTORE_BEST", { commit: restoreTo });
  }

  const restored = await inspectVerifyEvaluateRestored({
    request,
    deps,
    machine,
    budget,
    runId,
    page,
    inspectRole,
    inspectImpl,
    verifyImpl,
    gitImpl,
    policy,
    contract,
    contractHash,
    before,
    provenance: null,
    evaluatedSha: restoreTo ?? deps.isolation.baseSha ?? "unknown",
    phase: "post_edit",
  });
  lastEvaluation = restored.evaluation ?? lastEvaluation;

  const completeness = restored.completeness;
  const passed =
    Boolean(best && !shouldRestoreBaseline(best)) &&
    Boolean(lastEvaluation?.allRequiredPassed) &&
    !evaluationHasStructuralFailure(completeness) &&
    completeness.failed.length === 0 &&
    restored.targetOk &&
    restored.compare.regressions.length === 0;
  const changed = deps.isolation.baseSha
    ? await gitImpl.changedFiles(deps.isolation.agentCwd, deps.isolation.baseSha)
    : machine.state.startCommit
      ? await gitImpl.changedFiles(deps.isolation.agentCwd, machine.state.startCommit)
      : [];
  const stopReason = passed ? null : machine.state.stopReason ?? "required gates did not all pass";
  const status: HarnessResultStatus = passed
    ? "passed"
    : machine.state.stopReason?.includes("exceeded")
      ? "cancelled"
      : "failed";
  const contractResult = deriveContractResult({
    evaluation: lastEvaluation,
    completeness,
    targetRouteVerified: restored.targetOk,
  });

  return finalize(request, deps, {
    status,
    contractResult,
    reusable: false,
    runId,
    bestCommit: machine.state.bestCommit,
    score: best?.evaluationScore ?? scoreEvaluation(contract, lastEvaluation!, completeness),
    stopReason,
    before,
    after: restored.after,
    evaluation: lastEvaluation,
    contract,
    baseline,
    pageMap,
    verify: restored.verify,
    changed,
    usage: budget.usage,
    compare: restored.compare,
    completeness,
    evaluatedSha: restored.evaluatedSha,
    integrationReady: passed,
    restoreKind: shouldRestoreBaseline(best) ? "baseline" : "passing_checkpoint",
    verificationSource: "final",
  });
}

async function runAuditTail(options: {
  request: HarnessRequest;
  deps: HarnessDeps;
  machine: RunMachine;
  budget: RunBudget;
  runId: string;
  page: ReturnType<typeof lookupPage>;
  baseline: Baseline;
  pageMap: PageMap;
  contract: PageContract;
  contractHash: string;
  before: InspectReport;
  inspectRole: HarnessRequest["inspectRole"];
  verifyImpl: typeof runVerification;
  gitImpl: GitOps;
  policy: RiskPolicy;
  provenance: ProvenanceManifest;
}): Promise<HarnessResult> {
  options.machine.skip("BUILD", "audit-only");
  options.machine.begin("VERIFY");
  const evaluatedSha = await resolveEvaluatedSha(
    options.gitImpl,
    options.deps.isolation.agentCwd,
    options.deps.isolation.baseSha,
  );
  const verifyRaw = await options.verifyImpl({
    cwd: options.deps.isolation.agentCwd,
    route: options.request.route,
    baseUrl: options.deps.baseUrl,
    timeoutMs: options.policy.playwrightTimeoutMs,
    requireAdjacent: false,
    meta: {
      runId: options.runId,
      route: options.request.route,
      contractHash: options.contractHash,
      iteration: 0,
      worktreeSha: evaluatedSha,
      serverOrigin: options.deps.baseUrl,
      browser: "n/a",
    },
  });
  const merged = mergeTargetVerification({
    requestedRoute: options.request.route,
    inspect: options.before,
    expectedOrigin: options.deps.baseUrl,
    verify: verifyRaw,
  });
  options.deps.store.writeJson("verify-baseline.json", merged.results);
  options.machine.complete("VERIFY");
  const inspectPath = path.join(options.deps.paths.inspectBefore, "inspect.json");
  const freshness = isEvidenceFresh({
    meta: options.before.meta,
    runId: options.runId,
    route: options.request.route,
    contractHash: options.contractHash,
    iteration: 0,
    provenance: options.provenance,
    inspectFilePath: inspectPath,
    phase: "audit",
  });
  const evidence: GateEvidenceContext = {
    phase: "audit",
    lockedContractHash: options.contractHash,
    inspectMeta: options.before.meta,
    provenance: options.provenance,
    inspectFilePath: inspectPath,
    runId: options.runId,
    route: options.request.route,
    iteration: 0,
  };
  const evaluation = await runEvaluator({
    role: "evaluator",
    request: options.request,
    deps: options.deps,
    machine: options.machine,
    contract: options.contract,
    contractHash: options.contractHash,
    iteration: 0,
    inspectPath,
    performancePath: path.join(options.deps.paths.performance, "before.json"),
    verifyPath: path.join(options.deps.paths.artifacts, "verify-baseline.json"),
    inspectExcerpt: excerpt(inspectPath),
    budget: options.budget,
  });
  options.machine.skip("OPTIONAL_SKEPTIC", "audit-only default");
  options.machine.skip("CHECKPOINT", "audit-only");
  options.machine.skip("REPAIR_OR_FINISH", "audit-only");
  options.machine.skip("RESTORE_BEST", "audit-only");
  const completeness = evaluationCompleteness(options.contract, evaluation, evidence);
  if (!freshness.ok) {
    completeness.ineligibleEvidence = [
      ...new Set([...completeness.ineligibleEvidence, ...options.contract.acceptanceGates.map((g) => g.id)]),
    ];
  }
  const contractResult = deriveContractResult({
    evaluation,
    completeness,
    targetRouteVerified: merged.targetOk,
  });
  options.deps.store.writeJson(
    "audit-fingerprint.json",
    auditFingerprint({
      request: options.request,
      isolation: options.deps.isolation,
      contract: options.contract,
    }),
  );
  const reusable = freshness.ok && merged.targetOk;
  return finalize(options.request, options.deps, {
    status: "audit_complete",
    contractResult,
    reusable,
    runId: options.runId,
    bestCommit: null,
    score: scoreEvaluation(options.contract, evaluation, completeness),
    stopReason: null,
    before: options.before,
    after: auditAfterEvidence(),
    evaluation,
    contract: options.contract,
    baseline: options.baseline,
    pageMap: options.pageMap,
    verify: merged.results,
    changed: [],
    usage: options.budget.usage,
    completeness,
    evaluatedSha,
  });
}

async function recoverFromBudget(options: {
  request: HarnessRequest;
  deps: HarnessDeps;
  machine: RunMachine;
  budget: RunBudget;
  runId: string;
  gitImpl: GitOps;
  reason: string;
}): Promise<HarnessResult> {
  const policy = resolveRiskPolicy(options.request.risk);
  const ranked =
    (options.deps.store.readJson("checkpoint-ranking.json") as CheckpointRank[] | null) ??
    [];
  const best = pickBestCheckpoint(ranked);
  const selection = selectBudgetRestoreCommit({
    best,
    startCommit: options.machine.state.startCommit,
  });
  const restoreTo = selection.commit;
  if (restoreTo) {
    if (!options.machine.shouldSkip("RESTORE_BEST")) {
      options.machine.begin("RESTORE_BEST", {
        commit: restoreTo,
        reason: options.reason,
        restoreKind: selection.restoreKind,
        previousBest: best?.commit ?? null,
      });
    }
    await options.gitImpl.restoreCommit(options.deps.isolation.agentCwd, restoreTo);
    if (options.deps.isolation.mode === "worktree" && options.deps.isolation.worktreePath) {
      linkWorkspaceDependencies(
        options.deps.isolation.repoRoot,
        options.deps.isolation.agentCwd,
      );
    }
    options.machine.state.bestCommit =
      selection.restoreKind === "passing_checkpoint" ? restoreTo : null;
    if (options.machine.state.currentPhase === "RESTORE_BEST") {
      options.machine.complete("RESTORE_BEST", { commit: restoreTo });
    }
  }

  const before =
    (options.deps.store.readJson("performance/before.json") as InspectReport | null) ??
    requireInspect(options.deps, "performance/before.json");
  const contract = (options.deps.store.readJson("contract.json") as PageContract | null) ?? null;
  const iterationEval =
    best &&
    ((options.deps.store.readJson(
      `evaluation-iteration-${best.iteration}.json`,
    ) as Evaluation | null) ??
      (options.deps.store.readJson("evaluation.json") as Evaluation | null));
  const checkpointAfter =
    best &&
    (options.deps.store.readJson(
      `performance/after-${best.iteration}.json`,
    ) as InspectReport | null);
  const checkpointVerify =
    best &&
    ((options.deps.store.readJson(`verify-iteration-${best.iteration}.json`) as VerifyResult[] | null) ??
      []);

  const timeRemaining =
    options.budget.limits.maxDurationMs - (Date.now() - options.budget.startedAt);
  let verificationSource: VerificationSource = "not_run";
  let after: AfterEvidence = checkpointAfter
    ? collectedAfterEvidence(checkpointAfter, "checkpoint")
    : missingAfterEvidence("not_collected");
  let verify: VerifyResult[] = checkpointVerify || [];
  if (checkpointVerify?.length) verificationSource = "checkpoint";
  let restoredTargetOk = false;
  let compare = checkpointAfter ? compareInspect(before, checkpointAfter) : undefined;
  let evaluatedSha = restoreTo ?? options.deps.isolation.baseSha ?? "unknown";

  if (timeRemaining > 30_000 && contract && options.machine.state.contractLocked) {
    try {
      const restored = await inspectVerifyEvaluateRestored({
        request: options.request,
        deps: options.deps,
        machine: options.machine,
        budget: options.budget,
        runId: options.runId,
        page: lookupPage(options.request.route),
        inspectRole: options.request.inspectRole,
        inspectImpl: options.deps.inspect ?? inspectRoute,
        verifyImpl: options.deps.verify ?? runVerification,
        gitImpl: options.gitImpl,
        policy,
        contract,
        contractHash: canonicalizeContract(contract).hash,
        before,
        provenance:
          (options.deps.store.readJson("provenance.json") as ProvenanceManifest | null) ??
          null,
        evaluatedSha,
        phase: "post_edit",
        allowAgents: false,
      });
      after = restored.after;
      verify = restored.verify;
      restoredTargetOk = restored.targetOk;
      compare = restored.compare;
      evaluatedSha = restored.evaluatedSha;
      verificationSource = "final";
    } catch (error) {
      options.deps.log.warn(
        `deterministic restoration verification failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  const evaluation = iterationEval;
  const completeness =
    contract && evaluation
      ? evaluationCompleteness(contract, evaluation)
      : emptyCompleteness();
  const classified = classifyVerifyResults({
    requestedRoute: options.request.route,
    results: verify,
  });
  const targetOk =
    restoredTargetOk ||
    classified.targetOk ||
    (selection.restoreKind === "passing_checkpoint" && Boolean(best?.completeRequiredPass));
  const changed = options.deps.isolation.baseSha
    ? await options.gitImpl.changedFiles(
        options.deps.isolation.agentCwd,
        options.deps.isolation.baseSha,
      )
    : [];
  const integrationReady =
    selection.restoreKind === "passing_checkpoint" &&
    verificationSource === "final" &&
    targetOk;
  return finalize(options.request, options.deps, {
    status: "cancelled",
    contractResult: deriveContractResult({
      evaluation,
      completeness,
      targetRouteVerified: targetOk,
    }),
    reusable: false,
    runId: options.runId,
    bestCommit: options.machine.state.bestCommit,
    score:
      best?.evaluationScore ??
      (evaluation && contract ? scoreEvaluation(contract, evaluation, completeness) : 0),
    stopReason: options.reason,
    before,
    after,
    evaluation,
    contract,
    baseline: (options.deps.store.readJson("baseline.json") as Baseline | null) ?? null,
    pageMap: (options.deps.store.readJson("page-map.json") as PageMap | null) ?? null,
    verify,
    changed,
    usage: options.budget.usage,
    completeness,
    compare,
    evaluatedSha,
    integrationReady,
    restoreKind: selection.restoreKind,
    verificationSource,
  });
}

async function inspectVerifyEvaluateRestored(options: {
  request: HarnessRequest;
  deps: HarnessDeps;
  machine: RunMachine;
  budget: RunBudget;
  runId: string;
  page: ReturnType<typeof lookupPage>;
  inspectRole: HarnessRequest["inspectRole"];
  inspectImpl: typeof inspectRoute;
  verifyImpl: typeof runVerification;
  gitImpl: GitOps;
  policy: RiskPolicy;
  contract: PageContract;
  contractHash: string;
  before: InspectReport;
  provenance: ProvenanceManifest | null;
  evaluatedSha: string;
  phase: "audit" | "post_edit";
  allowAgents?: boolean;
}): Promise<{
  after: AfterEvidence;
  verify: VerifyResult[];
  evaluation: Evaluation;
  completeness: ReturnType<typeof evaluationCompleteness>;
  compare: ReturnType<typeof compareInspect>;
  targetOk: boolean;
  evaluatedSha: string;
}> {
  const sha = evaluatedWorktreeSha({
    evaluatedSha: await resolveEvaluatedSha(
      options.gitImpl,
      options.deps.isolation.agentCwd,
      options.evaluatedSha,
    ),
    baseSha: options.evaluatedSha,
  });
  const afterReport = await options.inspectImpl({
    baseUrl: options.deps.baseUrl,
    route: options.request.route,
    role: options.inspectRole,
    outDir: options.deps.paths.inspectAfter,
    viewports: FULL_VIEWPORTS,
    samples: options.policy.inspectSamples,
    meta: {
      runId: options.runId,
      route: options.request.route,
      contractHash: options.contractHash,
      iteration: options.machine.state.iteration,
      worktreeSha: sha,
      serverOrigin: options.deps.baseUrl,
      browser: "chrome",
      generatingCommand: "inspectRoute restored",
    },
  });
  assertInspectEvidence({
    requestedRoute: options.request.route,
    expectedOrigin: options.deps.baseUrl,
    finalUrl: afterReport.finalUrl,
    title: afterReport.title,
    headings: afterReport.headings,
    routeVerified: afterReport.routeVerified,
  });
  options.deps.store.writeJson("performance/after.json", afterReport);
  persistInspect(options.deps.paths.inspectAfter, afterReport);
  const compare = compareInspect(options.before, afterReport);
  options.deps.store.writeJson("performance/compare.json", compare);
  const verifyRaw = await options.verifyImpl({
    cwd: options.deps.isolation.agentCwd,
    route: options.request.route,
    baseUrl: options.deps.baseUrl,
    timeoutMs: options.policy.playwrightTimeoutMs,
    requireAdjacent: options.policy.requireAdjacentRegression,
    meta: {
      runId: options.runId,
      route: options.request.route,
      contractHash: options.contractHash,
      iteration: options.machine.state.iteration,
      worktreeSha: sha,
      serverOrigin: options.deps.baseUrl,
      browser: "n/a",
    },
  });
  const merged = mergeTargetVerification({
    requestedRoute: options.request.route,
    inspect: afterReport,
    expectedOrigin: options.deps.baseUrl,
    verify: verifyRaw,
  });
  options.deps.store.writeJson("verify-final.json", merged.results);
  const inspectPath = path.join(options.deps.paths.inspectAfter, "inspect.json");
  let evaluation: Evaluation;
  if (options.allowAgents === false) {
    evaluation =
      (options.deps.store.readJson("evaluation.json") as Evaluation | null) ??
      ({
        role: "evaluator",
        contractHash: options.contractHash,
        iteration: options.machine.state.iteration,
        summary:
          "Agents skipped after budget exhaustion; checkpoint evaluation reused.",
        criteria: [
          {
            id: "checkpoint-reuse",
            verdict: "fail",
            notes: "Final evaluator did not run after budget exhaustion.",
            evidence: [],
          },
        ],
        targetedRepair: [],
        allRequiredPassed: false,
        freshnessConfirmed: false,
        shallowOrDisconnected: [],
      } satisfies Evaluation);
  } else {
    evaluation = await runEvaluator({
      role: "evaluator",
      request: options.request,
      deps: options.deps,
      machine: options.machine,
      contract: options.contract,
      contractHash: options.contractHash,
      iteration: options.machine.state.iteration,
      inspectPath,
      performancePath: path.join(options.deps.paths.performance, "after.json"),
      verifyPath: path.join(options.deps.paths.artifacts, "verify-final.json"),
      comparePath: path.join(options.deps.paths.artifacts, "performance/compare.json"),
      inspectExcerpt: excerpt(inspectPath),
      budget: options.budget,
    });
    if (options.request.skeptic) {
      await runEvaluator({
        role: "skeptic",
        request: options.request,
        deps: options.deps,
        machine: options.machine,
        contract: options.contract,
        contractHash: options.contractHash,
        iteration: options.machine.state.iteration,
        inspectPath,
        performancePath: path.join(options.deps.paths.performance, "after.json"),
        verifyPath: path.join(options.deps.paths.artifacts, "verify-final.json"),
        comparePath: path.join(options.deps.paths.artifacts, "performance/compare.json"),
        inspectExcerpt: excerpt(inspectPath),
        budget: options.budget,
      });
    }
  }
  const completeness = evaluationCompleteness(options.contract, evaluation, {
    phase: options.phase,
    lockedContractHash: options.contractHash,
    inspectMeta: afterReport.meta,
    provenance: options.provenance,
    inspectFilePath: inspectPath,
    requiredWorktreeSha: sha,
    runId: options.runId,
    route: options.request.route,
    iteration: options.machine.state.iteration,
  });
  return {
    after: collectedAfterEvidence(afterReport),
    verify: merged.results,
    evaluation,
    completeness,
    compare,
    targetOk: merged.targetOk,
    evaluatedSha: sha,
  };
}

function finalize(
  request: HarnessRequest,
  deps: HarnessDeps,
  options: {
    status: HarnessResultStatus;
    contractResult: ContractResult;
    reusable: boolean;
    runId: string;
    bestCommit: string | null;
    score: number;
    stopReason: string | null;
    before: InspectReport;
    after: AfterEvidence;
    evaluation: Evaluation | null;
    contract: PageContract | null;
    baseline: Baseline | null;
    pageMap: PageMap | null;
    verify: VerifyResult[];
    changed: string[];
    usage: AggregatedUsage;
    compare?: { regressions: string[]; improvements: string[] };
    completeness?: ReturnType<typeof evaluationCompleteness>;
    evaluatedSha?: string | null;
    integrationReady?: boolean;
    restoreKind?: RestoreKind;
    verificationSource?: VerificationSource;
  },
): HarnessResult {
  deps.store.writeJson("handoff.json", {
    worktree: formatHandoffPath(deps.isolation.worktreePath),
    branch: deps.isolation.branchName,
    baseSha: deps.isolation.baseSha,
    finalSha: options.bestCommit,
    evaluatedSha: options.evaluatedSha ?? options.bestCommit,
    integrationReady: options.integrationReady ?? false,
    restoreKind: options.restoreKind ?? "none",
    route: request.route,
    runId: options.runId,
    contractHash: options.contract
      ? canonicalizeContract(options.contract).hash
      : null,
  });
  deps.store.writeJson("run-status.json", {
    processStatus: options.status,
    contractResult: options.contractResult,
    reusable: options.reusable,
    integrationReady: options.integrationReady ?? false,
    completedAt: nowIso(),
  });
  const reportPath = writeReport({
    request,
    store: deps.store,
    paths: deps.paths,
    isolation: deps.isolation,
    page: lookupPage(request.route),
    baseline: options.baseline,
    pageMap: options.pageMap,
    contract: options.contract,
    before: options.before,
    after: options.after,
    evaluation: options.evaluation,
    skeptic: (deps.store.readJson("skeptic.json") as Evaluation | null) ?? null,
    verify: options.verify,
    status: options.status,
    contractResult: options.contractResult,
    score: options.score,
    bestCommit: options.bestCommit,
    changed: options.changed,
    completeness: options.completeness ?? emptyCompleteness(),
    usage: options.usage,
    stopReason: options.stopReason,
    compare: options.compare,
    model: deps.model,
    reusable: options.reusable,
    evaluatedSha: options.evaluatedSha,
    integrationReady: options.integrationReady,
    restoreKind: options.restoreKind,
    verificationSource: options.verificationSource,
  });
  return {
    status: options.status,
    contractResult: options.contractResult,
    reusable: options.reusable,
    runId: options.runId,
    route: request.route,
    reportPath,
    bestCommit: options.bestCommit,
    score: options.score,
    stopReason: options.stopReason,
    integrationReady: options.integrationReady ?? false,
  };
}

function formatHandoffPath(value: string | null | undefined): string | null {
  return value ? value.replace(/\\/g, "/") : null;
}

async function loadBaselineFingerprints(options: {
  deps: HarnessDeps;
  verifyImpl: typeof runVerification;
  gitImpl: GitOps;
  policy: RiskPolicy;
  request: HarnessRequest;
  changed: string[];
  adjacentRequired: boolean;
}): Promise<FailureFingerprint[] | null> {
  if (!options.adjacentRequired) return [];
  if (options.deps.regressionBaselineFingerprints) {
    return options.deps.regressionBaselineFingerprints;
  }
  const stored = options.deps.store.readJson("regression-baseline.json") as
    | RegressionBaseline
    | FailureFingerprint[]
    | null;
  if (Array.isArray(stored)) return stored;
  if (stored?.fingerprints) return stored.fingerprints;

  const mirror = await ensureBaselineMirror(options.deps.isolation);
  if (!mirror) return null;
  try {
    const results = await options.verifyImpl({
      cwd: mirror,
      route: options.request.route,
      baseUrl: options.deps.baseUrl,
      changedFiles: options.changed,
      timeoutMs: options.policy.playwrightTimeoutMs,
      requireAdjacent: true,
      jobs: { staticChecks: false, target: false, unrelated: false, adjacent: true },
    });
    const fingerprints = fingerprintsFromVerifyResults(results);
    const payload: RegressionBaseline = {
      fingerprints,
      capturedFrom: options.deps.isolation.baseSha ?? "unknown",
      adjacentSpecs: results
        .filter((row) => row.name === "playwright-adjacent")
        .map((row) => row.output.split("\n")[0] ?? row.name),
    };
    options.deps.store.writeJson("regression-baseline.json", payload);
    return fingerprints;
  } catch (error) {
    options.deps.log.warn(
      `baseline adjacent capture failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    return null;
  }
}

function emptyCompleteness() {
  return {
    missing: [],
    failed: [],
    noEvidence: [],
    illegalNotApplicable: [],
    unprovenConditional: [],
    ineligibleEvidence: [],
  };
}

function requireArtifact<T>(store: ArtifactStore, name: string): T {
  const value = store.readJson(`${name}.json`);
  if (!value) {
    throw new Error(
      `Role did not submit required artifact ${name}.json. The run cannot continue.`,
    );
  }
  return value as T;
}

function requireInspect(deps: HarnessDeps, relative: string): InspectReport {
  const value = deps.store.readJson(relative);
  if (!value) throw new Error(`Missing inspect artifact ${relative}`);
  return value as InspectReport;
}

function assertContractRoute(contract: PageContract, route: string): void {
  const left = contract.page.route.split("?")[0];
  const right = route.split("?")[0];
  if (left !== right) {
    throw new Error(`Contract route ${contract.page.route} does not match target ${route}`);
  }
}

async function resolveEvaluatedSha(
  gitImpl: GitOps,
  cwd: string,
  fallback: string | null | undefined,
): Promise<string> {
  try {
    return await gitImpl.currentHead(cwd);
  } catch {
    return fallback || "unknown";
  }
}

function sampleFailedInspect(
  route: string,
  baseUrl: string,
  runId: string,
  contractHash: string,
  iteration: number,
  worktreeSha: string,
): InspectReport {
  return {
    route,
    baseUrl,
    role: "member",
    title: "Sign in",
    finalUrl: `${baseUrl}/login`,
    consoleErrors: [],
    consoleWarnings: [],
    pageErrors: [],
    failedRequests: [],
    network: [],
    duplicateGets: [],
    transferKb: 0,
    documentRequests: 0,
    jsTransferKb: 0,
    navigationMs: null,
    navigationSamplesMs: [],
    navigationMsMedian: null,
    navigationMsVariance: null,
    overflowByViewport: {},
    landmarks: { banner: 0, main: 0, navigation: 0, contentinfo: 0 },
    keyboardTabOrder: [],
    a11y: {
      h1Count: 0,
      hasMain: false,
      duplicateIds: [],
      unlabeledControls: [],
      unnamedActions: [],
    },
    headings: ["h1: Sign in"],
    screenshots: [],
    states: { loading: false, empty: false, error: true, degraded: false },
    reactEvidence: { supported: false, note: "inspect failed" },
    measuredAt: nowIso(),
    meta: {
      runId,
      route,
      contractHash,
      iteration,
      worktreeSha,
      timestamp: nowIso(),
      serverOrigin: baseUrl,
      browser: "chrome",
      generatingCommand: "inspectRoute failed",
    },
    finalPathname: "/login",
    routeVerified: false,
    auth: { attempted: true, ok: false, cookiePresent: false, endpointStatus: null },
  };
}

async function runEvaluator(options: {
  role: "evaluator" | "skeptic";
  request: HarnessRequest;
  deps: HarnessDeps;
  machine: RunMachine;
  contract: PageContract;
  contractHash: string;
  iteration: number;
  inspectPath: string;
  performancePath: string;
  verifyPath: string;
  inspectExcerpt: string;
  comparePath?: string;
  budget: RunBudget;
}): Promise<Evaluation> {
  if (options.role === "evaluator") {
    options.machine.begin("EVALUATE", { iteration: options.iteration });
  }
  const session = await options.deps.host.open({
    role: options.role,
    cwd: options.deps.isolation.agentCwd,
    purpose: options.role,
  });
  await withSession(session, (agent) =>
    agent.send(
      evaluatorPrompt({
        role: options.role,
        route: options.request.route,
        contractJson: JSON.stringify(options.contract, null, 2),
        contractHash: options.contractHash,
        iteration: options.iteration,
        inspectPath: options.inspectPath,
        performancePath: options.performancePath,
        verifyPath: options.verifyPath,
        comparePath: options.comparePath,
        inspectExcerpt: options.inspectExcerpt,
      }),
    ),
  );
  const name = options.role === "skeptic" ? "skeptic" : "evaluation";
  const evaluation = requireArtifact<Evaluation>(options.deps.store, name);
  if (evaluation.contractHash !== options.contractHash) {
    throw new Error("Evaluator contractHash does not match the locked contract.");
  }
  if (options.role === "evaluator") {
    options.machine.complete("EVALUATE", { iteration: options.iteration });
  }
  return evaluation;
}

function formatRepair(
  evaluation: Evaluation,
  skeptic: Evaluation | null,
  verify: VerifyResult[],
  compare: { regressions: string[] },
): string {
  const lines = [
    evaluation.summary,
    ...evaluation.targetedRepair.map(
      (item) => `- ${item.criterionId}: ${item.problem} → ${item.requestedFix}`,
    ),
  ];
  if (skeptic) {
    lines.push(
      "Skeptic:",
      skeptic.summary,
      ...skeptic.targetedRepair.map(
        (item) => `- ${item.criterionId}: ${item.problem} → ${item.requestedFix}`,
      ),
    );
  }
  const failedTests = verify.filter((row) => !row.ok && row.scope !== "unrelated");
  if (failedTests.length) {
    lines.push("Tests:", ...failedTests.map((row) => `- FAIL ${row.name}`));
  }
  const unrelated = verify.filter((row) => !row.ok && row.scope === "unrelated");
  if (unrelated.length) {
    lines.push(
      "Unrelated suite failures (do not substitute for target-page verification):",
      ...unrelated.map((row) => `- FAIL ${row.name}`),
    );
  }
  if (compare.regressions.length) {
    lines.push(
      "Performance regressions:",
      ...compare.regressions.map((row) => `- ${row}`),
    );
  }
  return lines.join("\n");
}

function performanceScore(before: InspectReport, after: InspectReport): number {
  const beforeNav = before.navigationMsMedian ?? before.navigationMs ?? 1;
  const afterNav = after.navigationMsMedian ?? after.navigationMs ?? beforeNav;
  return Math.round((beforeNav / Math.max(afterNav, 1)) * 100);
}

function dataScore(evaluation: Evaluation): number {
  return evaluation.criteria.filter(
    (row) =>
      (row.dimension === "calculations" ||
        row.dimension === "data_freshness_provenance") &&
      row.verdict === "pass",
  ).length;
}
