import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ArtifactStore, createRunPaths } from "./artifacts";
import type { AgentHost, AgentSession } from "./agents";
import { agreeContract } from "./contract-consensus";
import { BudgetExceededError, RunBudget } from "./budget";
import { Logger } from "./util";
import { canonicalizeContract, type PageContract } from "./schemas";
import { sampleContract } from "./test-fixtures";
import { ContractExhaustedError } from "./contract-ops";
import { createMachine, RunMachine } from "./machine";

function isolation(tmp: string) {
  return {
    mode: "none" as const,
    repoRoot: tmp,
    agentCwd: tmp,
    branchName: null,
    worktreePath: null,
    created: false,
    baseSha: "x",
  };
}

function budget(overrides: Partial<ConstructorParameters<typeof RunBudget>[0]> = {}) {
  return new RunBudget({
    maxDurationMs: 10_000,
    maxAgentRuns: 10,
    maxTotalTokens: 1000,
    maxIterations: 1,
    maxContractRounds: 3,
    ...overrides,
  });
}

function reviewerHost(
  store: ArtifactStore,
  script: Array<"accept" | "amend-a" | "amend-b">,
  options: { prompts?: string[]; opened?: string[]; onSend?: () => void } = {},
): AgentHost {
  let i = 0;
  const base = sampleContract();
  const altA: PageContract = { ...base, objective: `${base.objective} A` };
  const altB: PageContract = { ...base, objective: `${base.objective} B` };
  const hash = canonicalizeContract(base).hash;
  return {
    async open({ role, purpose }): Promise<AgentSession> {
      options.opened?.push(`${role}/${purpose}`);
      return {
        agentId: `rev-${role}-${i}`,
        role,
        purpose,
        async send(prompt: string) {
          options.prompts?.push(prompt);
          options.onSend?.();
          const step = script[i] ?? "accept";
          i += 1;
          if (step === "accept") {
            store.submit("contract-decision", {
              decision: "accept",
              acceptedHash: hash,
              proposalHash: hash,
              amendments: [],
              rationale: "ok",
            });
          } else {
            store.submit("contract-decision", {
              decision: "amend",
              proposalHash: hash,
              contract: step === "amend-a" ? altA : altB,
              amendments: [step],
              rationale: "change",
            });
          }
          return {
            agentId: "x",
            runId: "r",
            status: "finished",
            resultText: "ok",
            usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
            durationMs: 1,
            submitted: [],
          };
        },
        async close() {},
      };
    },
  };
}

describe("dual-review contract consensus", () => {
  it("locks a conflict-free critical review after the first independent pair", async () => {
    const tmp = mkdtempSync(path.join(os.tmpdir(), "phr-cc-"));
    try {
      const paths = createRunPaths(tmp, "cc");
      const store = new ArtifactStore(paths);
      const opened: string[] = [];
      const agreed = await agreeContract({
        route: "/denied",
        objective: sampleContract().objective,
        contract: sampleContract(),
        maxRounds: 3,
        independentReviewers: 2,
        deps: {
          host: reviewerHost(store, ["accept", "accept"], { opened }),
          store,
          isolation: isolation(tmp),
          budget: budget(),
          log: new Logger(() => {}),
        },
      });
      expect(agreed.hash).toBe(canonicalizeContract(sampleContract()).hash);
      expect(agreed.rounds).toBe(1);
      expect(agreed.disputeOnlyCalls).toBe(0);
      expect(opened).toEqual(["builder/contract_reviewer", "evaluator/contract_reviewer"]);
      expect(store.readJson("contract-decision-builder-2.json")).toBeNull();
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("does not lock on conflicting amendments within one round", async () => {
    const tmp = mkdtempSync(path.join(os.tmpdir(), "phr-cc-"));
    try {
      const paths = createRunPaths(tmp, "cc2");
      const store = new ArtifactStore(paths);
      await expect(
        agreeContract({
          route: "/denied",
          objective: sampleContract().objective,
          contract: sampleContract(),
          maxRounds: 1,
          deps: {
            host: reviewerHost(store, ["amend-a", "amend-b"]),
            store,
            isolation: isolation(tmp),
            budget: budget({ maxContractRounds: 1 }),
            log: new Logger(() => {}),
          },
        }),
      ).rejects.toThrow(ContractExhaustedError);
      expect(store.readJson("contract-conflict-1.json")).toBeTruthy();
      const disagreement = store.readJson("contract-disagreement.json") as {
        unresolved: Array<{ kind: string; path?: string; id?: string }>;
      };
      expect(disagreement.unresolved.some((item) => item.path === "objective")).toBe(true);
      expect(store.readJson("contract-agreement.json")).toBeNull();
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("freezes accepted gates and prompts later reviewers only about unresolved items", async () => {
    const tmp = mkdtempSync(path.join(os.tmpdir(), "phr-cc-freeze-"));
    try {
      const paths = createRunPaths(tmp, "cc-freeze");
      const store = new ArtifactStore(paths);
      const prompts: string[] = [];
      const opened: string[] = [];
      const agreed = await agreeContract({
        route: "/denied",
        objective: sampleContract().objective,
        contract: sampleContract(),
        maxRounds: 3,
        independentReviewers: 2,
        deps: {
          host: reviewerHost(store, ["accept", "amend-a", "accept", "accept"], { prompts, opened }),
          store,
          isolation: isolation(tmp),
          budget: budget(),
          log: new Logger(() => {}),
        },
      });
      expect(agreed.rounds).toBe(2);
      expect(agreed.disputeOnlyCalls).toBe(2);
      expect(opened.filter((row) => row.includes("contract_reviewer"))).toHaveLength(4);
      expect(agreed.frozenGateIds.length).toBeGreaterThan(0);
      const disputePrompt = prompts[2] ?? "";
      expect(disputePrompt).toMatch(/targeted dispute review/i);
      expect(disputePrompt).toMatch(/Already frozen/);
      expect(disputePrompt).toMatch(/Unresolved normative items only/);
      expect(disputePrompt).toMatch(/constraint objective/);
      expect(store.readJson("contract-decision-builder-3.json")).toBeNull();
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("does not repeat completed reviewers when later rounds run", async () => {
    const tmp = mkdtempSync(path.join(os.tmpdir(), "phr-cc-norepeat-"));
    try {
      const paths = createRunPaths(tmp, "cc-norepeat");
      const store = new ArtifactStore(paths);
      const hash = canonicalizeContract(sampleContract()).hash;
      store.writeJson("contract-decision-builder-1.json", {
        decision: "accept",
        acceptedHash: hash,
        proposalHash: hash,
        amendments: [],
        rationale: "ok",
      });
      store.writeJson("contract-decision-evaluator-1.json", {
        decision: "accept",
        acceptedHash: hash,
        proposalHash: hash,
        amendments: [],
        rationale: "ok",
      });
      const opened: string[] = [];
      const agreed = await agreeContract({
        route: "/denied",
        objective: sampleContract().objective,
        contract: sampleContract(),
        maxRounds: 3,
        resume: { startRound: 1 },
        deps: {
          host: reviewerHost(store, ["accept", "accept"], { opened }),
          store,
          isolation: isolation(tmp),
          budget: budget(),
          log: new Logger(() => {}),
        },
      });
      expect(opened).toEqual([]);
      expect(agreed.rounds).toBe(1);
      expect(agreed.hash).toBe(hash);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("keeps a completed reviewer result when the token cap is crossed after persist", async () => {
    const tmp = mkdtempSync(path.join(os.tmpdir(), "phr-cc-budget-"));
    try {
      const paths = createRunPaths(tmp, "cc-budget");
      const store = new ArtifactStore(paths);
      const runBudget = budget({ maxTotalTokens: 5, maxAgentRuns: 10 });
      const opened: string[] = [];
      await expect(
        agreeContract({
          route: "/denied",
          objective: sampleContract().objective,
          contract: sampleContract(),
          maxRounds: 3,
          deps: {
            host: reviewerHost(store, ["accept", "accept"], {
              opened,
              onSend: () => {
                runBudget.addUsage({ inputTokens: 20, outputTokens: 20, totalTokens: 40 });
              },
            }),
            store,
            isolation: isolation(tmp),
            budget: runBudget,
            log: new Logger(() => {}),
          },
        }),
      ).rejects.toThrow(BudgetExceededError);
      expect(opened).toEqual(["builder/contract_reviewer"]);
      expect(store.readJson("contract-decision-builder-1.json")).toMatchObject({
        decision: "accept",
      });
      expect(store.readJson("contract-decision-evaluator-1.json")).toBeNull();
      try {
        runBudget.assertAfterInvocation();
      } catch (error) {
        expect(error).toBeInstanceOf(BudgetExceededError);
        expect((error as BudgetExceededError).completedWorkPersisted).toBe(true);
      }
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("recovers an orphan contract-decision.json onto the incomplete round file", async () => {
    const tmp = mkdtempSync(path.join(os.tmpdir(), "phr-cc-orphan-"));
    try {
      const paths = createRunPaths(tmp, "cc-orphan");
      const store = new ArtifactStore(paths);
      const hash = canonicalizeContract(sampleContract()).hash;
      store.writeJson("contract-decision-builder-1.json", {
        decision: "accept",
        acceptedHash: hash,
        proposalHash: hash,
        amendments: [],
        rationale: "ok",
      });
      store.writeJson("contract-decision.json", {
        decision: "accept",
        acceptedHash: hash,
        proposalHash: hash,
        amendments: [],
        rationale: "orphan evaluator",
      });
      const machine = RunMachine.start(
        paths.root,
        createMachine({
          runId: "cc-orphan",
          request: {
            route: "/denied",
            objective: sampleContract().objective,
            suppliedObjective: sampleContract().objective,
            auditOnly: true,
            skeptic: false,
            maxIterations: 1,
            maxDurationMinutes: 5,
            maxContractRounds: 3,
            maxAgentRuns: 10,
            maxTotalTokens: 1000,
            inspectRole: "public",
            risk: "critical",
            fromAudit: null,
            resumeRunId: null,
            allowNoSandbox: false,
          },
          isolation: isolation(tmp),
          model: {},
        }),
      );
      machine.setIncompleteInvocation({
        round: 1,
        role: "evaluator",
        purpose: "contract_reviewer",
        agentId: "agent-eval",
        runId: "run-eval",
        startedAt: new Date().toISOString(),
        status: "started",
        countedTowardBudget: true,
      });
      const opened: string[] = [];
      const agreed = await agreeContract({
        route: "/denied",
        objective: sampleContract().objective,
        contract: sampleContract(),
        maxRounds: 3,
        resume: { startRound: 1 },
        deps: {
          host: reviewerHost(store, ["accept"], { opened }),
          store,
          isolation: isolation(tmp),
          budget: budget(),
          log: new Logger(() => {}),
          machine,
        },
      });
      expect(opened).toEqual([]);
      expect(agreed.hash).toBe(hash);
      expect(store.readJson("contract-decision-evaluator-1.json")).toMatchObject({
        rationale: "orphan evaluator",
      });
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
