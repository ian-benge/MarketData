import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ArtifactStore, createRunPaths } from "./artifacts";
import { AgentInvocationError, type AgentHost, type AgentSession } from "./agents";
import { RunBudget } from "./budget";
import { classifyFailure } from "./failure";
import { createMachine, RunMachine } from "./machine";
import { agreeContract } from "./contract-consensus";
import type { HarnessRequest } from "./request";
import { canonicalizeContract } from "./schemas";
import { sampleContract, sampleInspect } from "./test-fixtures";
import { Logger } from "./util";
import { runHarness } from "./orchestrator";
import {
  discoverContractProgress,
  formatRunStatus,
  hydrateResumeState,
  looksLikeRoute,
  looksLikeRunId,
  applyResumeBudgetExtension,
  migratePersistedRun,
  resolveResumeRunId,
  restoreRunBudget,
  validateResume,
} from "./resume";
import { main } from "./cli";

const requestBase: HarnessRequest = {
  route: "/denied",
  objective: "Keep authorization copy honest.",
  suppliedObjective: "Keep authorization copy honest.",
  auditOnly: true,
  skeptic: false,
  maxIterations: 3,
  maxDurationMinutes: 120,
  maxContractRounds: 3,
  maxAgentRuns: 12,
  maxTotalTokens: 20_000_000,
  inspectRole: "public",
  risk: "low",
  fromAudit: null,
  resumeRunId: null,
  allowNoSandbox: false,
};

function isolation(tmp: string, mode: "none" | "worktree" = "none") {
  const worktreePath = mode === "worktree" ? path.join(tmp, "worktree") : null;
  if (worktreePath) mkdirSync(worktreePath, { recursive: true });
  return {
    mode,
    repoRoot: tmp,
    agentCwd: worktreePath ?? tmp,
    branchName: mode === "worktree" ? "page-improve/denied-test" : null,
    worktreePath,
    created: mode === "worktree",
    baseSha: "aaa111bbb222ccc333ddd444eee555fff6667778",
  };
}

function acceptDecision(hash: string) {
  return {
    decision: "accept" as const,
    acceptedHash: hash,
    amendments: [],
    rationale: "ok",
  };
}

function seedRetryableDualReview(tmp: string, runId = "denied-20260818-abcd1234") {
  const paths = createRunPaths(tmp, runId);
  const store = new ArtifactStore(paths);
  const iso = isolation(tmp, "worktree");
  const machine = RunMachine.start(
    paths.root,
    createMachine({ runId, request: requestBase, isolation: iso, model: {} }),
  );
  for (const phase of ["PRECHECK", "WORKTREE", "BASELINE", "PLAN", "CONTRACT_DRAFT"] as const) {
    machine.begin(phase);
    machine.complete(phase);
  }
  machine.begin("DUAL_REVIEW");
  machine.fail(
    "DUAL_REVIEW",
    "builder run failed (run-02c7bf59-cddf-4d7a-a13d-6aa1bf39ce7a): Connection failed repeatedly",
    "retryable_network",
  );
  const contract = sampleContract();
  const hash = canonicalizeContract(contract).hash;
  store.writeJson("request.json", {
    route: requestBase.route,
    suppliedObjective: requestBase.suppliedObjective,
  });
  store.writeJson("contract.json", contract);
  store.writeJson("baseline.json", { route: "/denied" });
  store.writeJson("contract-decision-builder-1.json", acceptDecision(hash));
  store.writeJson("contract-decision-evaluator-1.json", acceptDecision(hash));
  store.writeJson("contract-decision-builder-2.json", acceptDecision(hash));
  store.writeJson("contract-decision-evaluator-2.json", acceptDecision(hash));
  store.writeJson("run-status.json", {
    reusable: false,
    failedPhase: "DUAL_REVIEW",
    reason:
      "builder run failed (run-02c7bf59-cddf-4d7a-a13d-6aa1bf39ce7a): Connection failed repeatedly",
  });
  writeFileSync(
    paths.log,
    [
      "planner run=run-1",
      "builder run=run-2",
      "evaluator run=run-3",
      "builder run=run-4",
      "evaluator run=run-5",
      "builder run=run-02c7bf59-cddf-4d7a-a13d-6aa1bf39ce7a",
    ].join("\n"),
    "utf8",
  );
  return { paths, store, machine, hash, iso };
}

function recordingHost(store: ArtifactStore, hash: string, opened: string[]): AgentHost {
  return {
    async open({ role, purpose }): Promise<AgentSession> {
      opened.push(`${role}/${purpose}`);
      return {
        agentId: `agent-${opened.length}`,
        role,
        purpose,
        async send() {
          store.submit("contract-decision", acceptDecision(hash));
          return {
            agentId: `agent-${opened.length}`,
            runId: `run-${opened.length}`,
            status: "finished",
            resultText: "ok",
            usage: { inputTokens: 2, outputTokens: 2, totalTokens: 4 },
            durationMs: 1,
            submitted: [],
          };
        },
        async close() {},
      };
    },
  };
}

describe("retryable failure classification", () => {
  it("treats SDK connection failure as retryable", () => {
    const classified = classifyFailure(
      "builder run failed (run-02c7bf59-cddf-4d7a-a13d-6aa1bf39ce7a): Connection failed repeatedly",
    );
    expect(classified.category).toBe("retryable_network");
    expect(classified.retryable).toBe(true);
  });

  it("classifies ECONNREFUSED as retryable infrastructure", () => {
    const classified = classifyFailure(
      "Target verification failed for infrastructure reasons: connect ECONNREFUSED 127.0.0.1:3200",
    );
    expect(classified.category).toBe("infrastructure");
    expect(classified.retryable).toBe(true);
  });

  it("keeps permission and security failures non-retryable", () => {
    expect(classifyFailure("access denied by project hooks").retryable).toBe(false);
    expect(classifyFailure("Sandbox required for builder runs").retryable).toBe(false);
    expect(classifyFailure("Builder and evaluator did not accept the same canonical contract hash. Refusing to edit.").retryable).toBe(false);
    const budget = classifyFailure("max-total-tokens exceeded (26301234 > 25000000)");
    expect(budget.category).toBe("budget_exhausted");
    expect(budget.retryable).toBe(true);
    const exhausted = classifyFailure(
      "builder run failed (run-d39a0888-5873-49dd-8b14-c190c4f6e967): [resource_exhausted] Error",
    );
    expect(exhausted.category).toBe("retryable_network");
    expect(exhausted.retryable).toBe(true);
    const powershell = classifyFailure(
      "spawn C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe ENOENT",
    );
    expect(powershell.category).toBe("retryable_process");
    expect(powershell.retryable).toBe(true);
  });
});

describe("resumable vs reusable", () => {
  it("marks a failed retryable run resumable while reusable=false", () => {
    const tmp = mkdtempSync(path.join(os.tmpdir(), "phr-resume-"));
    try {
      const { store, machine, paths } = seedRetryableDualReview(tmp);
      const state = hydrateResumeState({ store, machine: machine.state, runRoot: paths.root });
      expect(state.processStatus).toBe("failed");
      expect(state.reusable).toBe(false);
      expect(state.resumable).toBe(true);
      expect(state.incompleteInvocation?.role).toBe("builder");
      expect(state.incompleteInvocation?.round).toBe(3);
      expect(state.budget.agentRuns).toBe(6);
      expect(state.budget.maxContractRounds).toBe(3);
      expect(formatRunStatus("denied-20260818-abcd1234", state)).toMatch(/resumable: yes/);
      expect(formatRunStatus("denied-20260818-abcd1234", state)).toMatch(/reusable: no/);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("treats a completed audit as reusable but not resumable", () => {
    const tmp = mkdtempSync(path.join(os.tmpdir(), "phr-complete-"));
    try {
      const paths = createRunPaths(tmp, "denied-20260818-deadbeef");
      const store = new ArtifactStore(paths);
      const machine = RunMachine.start(
        paths.root,
        createMachine({
          runId: "denied-20260818-deadbeef",
          request: requestBase,
          isolation: isolation(tmp),
          model: {},
        }),
      );
      machine.begin("REPORT");
      machine.complete("REPORT");
      store.writeJson("request.json", { route: "/denied", suppliedObjective: requestBase.suppliedObjective });
      store.writeJson("contract.json", sampleContract());
      store.writeJson("baseline.json", { route: "/denied" });
      store.writeJson("run-status.json", { processStatus: "completed", reusable: true });
      const state = hydrateResumeState({ store, machine: machine.state, runRoot: paths.root });
      expect(state.reusable).toBe(true);
      expect(state.resumable).toBe(false);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("keeps permission and security failures non-resumable", () => {
    const tmp = mkdtempSync(path.join(os.tmpdir(), "phr-perm-"));
    try {
      const { store, machine, paths } = seedRetryableDualReview(tmp, "denied-20260818-perm0001");
      machine.fail("DUAL_REVIEW", "access denied by project hooks", "permission");
      store.writeJson("run-status.json", {
        reusable: false,
        reason: "access denied by project hooks",
      });
      const permission = hydrateResumeState({ store, machine: machine.state, runRoot: paths.root });
      expect(permission.resumable).toBe(false);
      expect(permission.reusable).toBe(false);

      machine.fail("DUAL_REVIEW", "Sandbox required for builder runs", "security_policy");
      store.writeJson("run-status.json", {
        reusable: false,
        reason: "Sandbox required for builder runs",
      });
      const security = hydrateResumeState({ store, machine: machine.state, runRoot: paths.root });
      expect(security.resumable).toBe(false);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe("contract-reviewer interruption", () => {
  it("does not count an incomplete reviewer decision toward consensus", async () => {
    const tmp = mkdtempSync(path.join(os.tmpdir(), "phr-incomplete-"));
    try {
      const { store, hash, paths } = seedRetryableDualReview(tmp);
      const opened: string[] = [];
      const host: AgentHost = {
        async open({ role, purpose }): Promise<AgentSession> {
          opened.push(`${role}/${purpose}`);
          return {
            agentId: "agent-fail",
            role,
            purpose,
            async send() {
              throw new AgentInvocationError(
                "builder run failed (run-02c7bf59-cddf-4d7a-a13d-6aa1bf39ce7a): Connection failed repeatedly",
                { runId: "run-02c7bf59-cddf-4d7a-a13d-6aa1bf39ce7a" },
              );
            },
            async close() {},
          };
        },
      };
      const machine = RunMachine.resume(paths.root);
      await expect(
        agreeContract({
          route: "/denied",
          objective: requestBase.objective,
          contract: sampleContract(),
          maxRounds: 3,
          resume: { startRound: 3, skipBuilder: false },
          deps: {
            host,
            store,
            isolation: isolation(tmp),
            budget: new RunBudget({
              maxDurationMs: 60_000,
              maxAgentRuns: 12,
              maxTotalTokens: 1000,
              maxIterations: 1,
              maxContractRounds: 3,
            }),
            log: new Logger(() => {}),
            machine,
          },
        }),
      ).rejects.toThrow(/Connection failed repeatedly/);
      expect(opened).toEqual(["builder/contract_reviewer"]);
      expect(store.readJson("contract-decision-builder-3.json")).toBeNull();
      expect(store.readJson("contract-agreement.json")).toBeNull();
      const discovered = discoverContractProgress(store);
      expect(discovered.completed.map((row) => row.round)).toEqual([1, 2]);
      expect(discovered.incomplete).toBeNull();
      expect(machine.state.incompleteInvocation?.role).toBe("builder");
      expect(machine.state.incompleteInvocation?.status).toBe("failed");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("retries only the incomplete role and does not repeat completed rounds", async () => {
    const tmp = mkdtempSync(path.join(os.tmpdir(), "phr-retry-role-"));
    try {
      const { store, hash, paths } = seedRetryableDualReview(tmp);
      store.writeJson("contract-decision-builder-3.json", acceptDecision(hash));
      const opened: string[] = [];
      const machine = RunMachine.resume(paths.root);
      const agreed = await agreeContract({
        route: "/denied",
        objective: requestBase.objective,
        contract: sampleContract(),
        maxRounds: 3,
        resume: { startRound: 3, skipBuilder: true },
        deps: {
          host: recordingHost(store, hash, opened),
          store,
          isolation: isolation(tmp),
          budget: new RunBudget({
            maxDurationMs: 60_000,
            maxAgentRuns: 12,
            maxTotalTokens: 1000,
            maxIterations: 1,
            maxContractRounds: 3,
          }),
          log: new Logger(() => {}),
          machine,
        },
      });
      expect(opened).toEqual(["evaluator/contract_reviewer"]);
      expect(agreed.rounds).toBe(3);
      expect(store.readJson("contract-agreement.json")).toMatchObject({ hash });
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("does not reset the contract-round cap on resume", async () => {
    const tmp = mkdtempSync(path.join(os.tmpdir(), "phr-cap-"));
    try {
      const { store, hash } = seedRetryableDualReview(tmp);
      const host: AgentHost = {
        async open({ role, purpose }): Promise<AgentSession> {
          return {
            agentId: `agent-${role}`,
            role,
            purpose,
            async send() {
              store.submit("contract-decision", {
                decision: "amend",
                contract: { ...sampleContract(), objective: `${sampleContract().objective} ${role}` },
                amendments: [role],
                rationale: "still disagree",
              });
              return {
                agentId: `agent-${role}`,
                runId: `run-${role}`,
                status: "finished",
                resultText: "ok",
                usage: { inputTokens: 2, outputTokens: 2, totalTokens: 4 },
                durationMs: 1,
                submitted: [],
              };
            },
            async close() {},
          };
        },
      };
      await expect(
        agreeContract({
          route: "/denied",
          objective: requestBase.objective,
          contract: sampleContract(),
          maxRounds: 3,
          resume: { startRound: 3, skipBuilder: false },
          deps: {
            host,
            store,
            isolation: isolation(tmp),
            budget: new RunBudget({
              maxDurationMs: 60_000,
              maxAgentRuns: 12,
              maxTotalTokens: 1000,
              maxIterations: 1,
              maxContractRounds: 3,
            }),
            log: new Logger(() => {}),
          },
        }),
      ).rejects.toThrow(/contract_exhausted|did not accept the same canonical/);
      expect(store.readJson("contract-decision-builder-4.json")).toBeNull();
      expect(hash).toHaveLength(64);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe("budget restoration", () => {
  it("preserves token, agent-run, and active runtime budgets", () => {
    const budget = restoreRunBudget({
      agentRuns: 6,
      consumedActiveRuntimeMs: 56 * 60_000,
      pausedAt: "2026-08-18T17:10:38.573Z",
      usage: {
        availability: "measured",
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
        cacheReadTokens: null,
        cacheWriteTokens: null,
        reasoningTokens: null,
        tokenLimitEnforced: true,
        tokenLimitStatus: "enforced",
        turns: [],
      },
      maxAgentRuns: 12,
      maxTotalTokens: 20_000_000,
      maxDurationMinutes: 120,
      maxContractRounds: 3,
      maxIterations: 3,
    });
    expect(budget.agentRuns).toBe(6);
    expect(budget.usage.totalTokens).toBe(150);
    expect(budget.elapsedActiveMs()).toBe(56 * 60_000);
    expect(budget.limits.maxContractRounds).toBe(3);
    expect(budget.limits.maxAgentRuns).toBe(12);
  });

  it("excludes offline downtime from active runtime", async () => {
    const budget = new RunBudget(
      {
        maxDurationMs: 120 * 60_000,
        maxAgentRuns: 12,
        maxTotalTokens: 1000,
        maxIterations: 3,
        maxContractRounds: 3,
      },
      { consumedActiveMs: 10_000, paused: true },
    );
    expect(budget.elapsedActiveMs()).toBe(10_000);
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(budget.elapsedActiveMs()).toBe(10_000);
    budget.resumeClock();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(budget.elapsedActiveMs()).toBeGreaterThan(10_000);
    budget.pause();
    const frozen = budget.elapsedActiveMs();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(budget.elapsedActiveMs()).toBe(frozen);
  });
});

describe("resume validation", () => {
  it("blocks resume on worktree SHA mismatch", async () => {
    const tmp = mkdtempSync(path.join(os.tmpdir(), "phr-sha-"));
    try {
      const { store, paths, iso } = seedRetryableDualReview(tmp);
      migratePersistedRun(store, paths.root);
      const result = await validateResume({
        store,
        runRoot: paths.root,
        repoRoot: tmp,
        git: {
          currentHead: async () => "ffffffffffffffffffffffffffffffffffffffff",
          changedFiles: async () => [],
        },
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.category).toBe("incompatible_worktree");
        expect(result.reason).toMatch(/does not match persisted SHA/);
      }
      expect(iso.baseSha).not.toBe("ffffffffffffffffffffffffffffffffffffffff");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("blocks resume on corrupted artifacts", async () => {
    const tmp = mkdtempSync(path.join(os.tmpdir(), "phr-corrupt-"));
    try {
      const { store, paths } = seedRetryableDualReview(tmp);
      store.writeJson("contract-decision-builder-1.json", { not: "a decision" });
      const result = await validateResume({
        store,
        runRoot: paths.root,
        repoRoot: tmp,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.category).toBe("corrupted_artifact");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe("resume does not repeat completed work", () => {
  it("does not repeat the planner when dual review is resumed", async () => {
    const tmp = mkdtempSync(path.join(os.tmpdir(), "phr-planner-"));
    try {
      const { store, paths } = seedRetryableDualReview(tmp);
      store.writeJson("page-map.json", {
        route: "/denied",
        pageFile: "src/app/denied/page.tsx",
        relatedFiles: [],
        dataFlow: [],
        apis: [],
        clientServerBoundary: "server",
        existingTests: [],
        adjacentPages: [],
        designTokens: [],
        sharedComponents: [],
      });
      store.writeJson("performance/before.json", sampleInspect());
      const opened: string[] = [];
      const host: AgentHost = {
        async open({ role, purpose }): Promise<AgentSession> {
          opened.push(`${role}/${purpose}`);
          return {
            agentId: `agent-${opened.length}`,
            role,
            purpose,
            async send() {
              throw new AgentInvocationError(
                "builder run failed (run-retry): Connection failed repeatedly",
                { runId: "run-retry" },
              );
            },
            async close() {},
          };
        },
      };
      await expect(
        runHarness(
          { ...requestBase, resumeRunId: "denied-20260818-abcd1234" },
          {
            host,
            store,
            paths,
            isolation: isolation(tmp),
            baseUrl: "http://127.0.0.1:3200",
            log: new Logger(() => {}),
            machine: RunMachine.resume(paths.root),
            inspect: async () => sampleInspect(),
            verify: async () => [],
            git: {
              checkpoint: async () => ({ commit: "aaa", dirty: false }),
              restoreCommit: async () => {},
              changedFiles: async () => [],
              currentHead: async () => "aaa111bbb222ccc333ddd444eee555fff6667778",
            },
            budget: restoreRunBudget({
              agentRuns: 6,
              consumedActiveRuntimeMs: 56 * 60_000,
              pausedAt: "2026-08-18T17:10:38.573Z",
              usage: {
                availability: "unknown",
                inputTokens: null,
                outputTokens: null,
                totalTokens: null,
                cacheReadTokens: null,
                cacheWriteTokens: null,
                reasoningTokens: null,
                tokenLimitEnforced: false,
                tokenLimitStatus: "unenforced_usage_unknown",
                turns: [],
              },
              maxAgentRuns: 12,
              maxTotalTokens: 20_000_000,
              maxDurationMinutes: 120,
              maxContractRounds: 3,
              maxIterations: 3,
            }),
          },
        ),
      ).rejects.toThrow(/Connection failed repeatedly/);
      expect(opened.some((row) => row.startsWith("planner"))).toBe(false);
      expect(opened).toEqual(["builder/contract_reviewer"]);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe("budget_exhausted resume", () => {
  it("is resumable with a strictly higher cap and rejects reduced limits", async () => {
    const tmp = mkdtempSync(path.join(os.tmpdir(), "phr-budget-ex-"));
    try {
      const runId = "denied-20260818-b0d9e7a1";
      const paths = createRunPaths(tmp, runId);
      const store = new ArtifactStore(paths);
      const iso = isolation(tmp);
      const machine = RunMachine.start(
        paths.root,
        createMachine({ runId, request: requestBase, isolation: iso, model: {} }),
      );
      for (const phase of ["PRECHECK", "WORKTREE", "BASELINE", "PLAN", "CONTRACT_DRAFT"] as const) {
        machine.begin(phase);
        machine.complete(phase);
      }
      machine.begin("DUAL_REVIEW");
      machine.fail("DUAL_REVIEW", "max-total-tokens exceeded (100 > 50)", "budget_exhausted");
      const contract = sampleContract();
      const hash = canonicalizeContract(contract).hash;
      store.writeJson("request.json", {
        route: requestBase.route,
        suppliedObjective: requestBase.suppliedObjective,
      });
      store.writeJson("contract.json", contract);
      store.writeJson("baseline.json", { route: "/denied" });
      store.writeJson("contract-decision-builder-1.json", acceptDecision(hash));
      store.writeJson("contract-decision-evaluator-1.json", acceptDecision(hash));
      store.writeJson("budget.json", {
        agentRuns: 4,
        consumedActiveRuntimeMs: 12_000,
        pausedAt: new Date().toISOString(),
        usage: {
          availability: "measured",
          inputTokens: 80,
          outputTokens: 20,
          totalTokens: 100,
          cacheReadTokens: null,
          cacheWriteTokens: null,
          reasoningTokens: null,
          tokenLimitEnforced: true,
          tokenLimitStatus: "enforced",
          turns: [
            {
              role: "planner",
              purpose: "planner",
              availability: "measured",
              inputTokens: 80,
              outputTokens: 20,
              totalTokens: 100,
              cacheReadTokens: null,
              cacheWriteTokens: null,
              reasoningTokens: null,
              tokenLimitEnforced: true,
              tokenLimitStatus: "enforced",
            },
          ],
        },
        maxAgentRuns: 12,
        maxTotalTokens: 50,
        maxDurationMinutes: 120,
        maxContractRounds: 3,
        maxIterations: 3,
      });
      const state = hydrateResumeState({ store, machine: machine.state, runRoot: paths.root });
      expect(state.failureCategory).toBe("budget_exhausted");
      expect(state.resumable).toBe(true);
      expect(state.reusable).toBe(false);
      expect(state.nextAction).toMatch(/budget_exhausted/);
      expect(state.budget.agentRuns).toBe(4);
      expect(state.budget.usage.totalTokens).toBe(100);

      const restored = restoreRunBudget(state.budget);
      expect(() =>
        applyResumeBudgetExtension({
          budget: restored,
          request: { ...requestBase },
          store,
          maxTotalTokens: 50,
          reason: "same cap",
        }),
      ).toThrow(/must strictly increase|may only increase/);

      const raised = restoreRunBudget(state.budget);
      const record = applyResumeBudgetExtension({
        budget: raised,
        request: { ...requestBase },
        store,
        maxTotalTokens: 101,
        reason: "resume after token exhaustion",
      });
      expect(record.previous.maxTotalTokens).toBe(50);
      expect(record.next.maxTotalTokens).toBe(101);
      expect(raised.agentRuns).toBe(4);
      expect(raised.usage.totalTokens).toBe(100);
      const extensions = store.readJson("budget-extensions.json") as Array<{ reason: string }>;
      expect(extensions).toHaveLength(1);

      const validated = await validateResume({
        store,
        runRoot: paths.root,
        repoRoot: tmp,
      });
      expect(validated.ok).toBe(true);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe("CLI status and resume argument parsing", () => {
  it("recognizes run ids and refuses to treat routes as resume targets", () => {
    expect(looksLikeRunId("scanner-20260818-d66a2767")).toBe(true);
    expect(looksLikeRoute("/scanner")).toBe(true);
    const refused = resolveResumeRunId({
      script: "page:resume",
      positional: "/scanner",
      repoRoot: os.tmpdir(),
    });
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.message).toMatch(/will not start a new run|requires a run id/i);
  });

  it("page:resume never starts a new run from a route argument", async () => {
    const previous = process.env.npm_lifecycle_event;
    process.env.npm_lifecycle_event = "page:resume";
    try {
      const code = await main(["/scanner"]);
      expect(code).toBe(1);
    } finally {
      process.env.npm_lifecycle_event = previous;
    }
  });

  it("resolves an existing run id for resume", () => {
    const tmp = mkdtempSync(path.join(os.tmpdir(), "phr-cli-"));
    try {
      const { paths } = seedRetryableDualReview(tmp, "denied-20260818-cli00001");
      const resolved = resolveResumeRunId({
        script: "page:resume",
        positional: "denied-20260818-cli00001",
        repoRoot: tmp,
      });
      expect(resolved).toEqual({ ok: true, runId: "denied-20260818-cli00001" });
      expect(paths.root).toContain("denied-20260818-cli00001");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
