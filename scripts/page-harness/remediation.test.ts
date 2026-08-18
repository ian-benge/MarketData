import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ArtifactStore, createRunPaths } from "./artifacts";
import { createMachine, RunMachine } from "./machine";
import { remediateInfrastructureFailedAudit } from "./remediation";
import { sampleContract, sampleInspect } from "./test-fixtures";
import { canonicalizeContract } from "./schemas";
import { evidenceMeta } from "./evidence";
import { hydrateResumeState } from "./resume";
import type { HarnessRequest } from "./request";
import { runHarness } from "./orchestrator";
import type { AgentHost, AgentSession } from "./agents";
import { Logger } from "./util";
import { sampleEvaluation } from "./test-fixtures";

const request: HarnessRequest = {
  route: "/scanner",
  objective: "Improve Scanner",
  suppliedObjective: "Improve Scanner",
  auditOnly: true,
  skeptic: false,
  maxIterations: 3,
  maxDurationMinutes: 120,
  maxContractRounds: 3,
  maxAgentRuns: 12,
  maxTotalTokens: 20_000_000,
  inspectRole: "member",
  risk: "critical",
  fromAudit: null,
  resumeRunId: null,
  allowNoSandbox: false,
};

describe("infrastructure audit remediation", () => {
  it("resumes at verification without repeating planner or contract reviewers", async () => {
    const tmp = mkdtempSync(path.join(os.tmpdir(), "phr-remediate-"));
    try {
      const runId = "scanner-20260818-d66a2767";
      const worktree = path.join(tmp, "worktree");
      mkdirSync(worktree, { recursive: true });
      const paths = createRunPaths(tmp, runId);
      const store = new ArtifactStore(paths);
      const contract = sampleContract("/scanner");
      const hash = canonicalizeContract(contract).hash;
      const inspect = sampleInspect({
        route: "/scanner",
        finalUrl: "http://127.0.0.1:3200/scanner",
        finalPathname: "/scanner",
        routeVerified: true,
        meta: evidenceMeta({
          runId,
          route: "/scanner",
          contractHash: "pending",
          iteration: 0,
          worktreeSha: "abc",
          serverOrigin: "http://127.0.0.1:3200",
          browser: "chrome",
          generatingCommand: "inspectRoute baseline",
        }),
      });
      writeFileSync(paths.log, [
        "[phr] requested=enabled",
        "planner/planner agent=agent-1",
        "planner run=run-1",
        "builder/contract_reviewer agent=agent-2",
        "builder run=run-2",
        "evaluator/contract_reviewer agent=agent-3",
        "evaluator run=run-3",
        "builder/contract_reviewer agent=agent-4",
        "builder run=run-4",
        "evaluator/contract_reviewer agent=agent-5",
        "evaluator run=run-5",
        "builder/contract_reviewer agent=agent-6",
        "builder run=run-6",
        "ERROR builder run failed (run-6): Connection failed repeatedly",
        "[phr] requested=enabled",
        "builder/contract_reviewer agent=agent-7",
        "builder run=run-7",
        "evaluator/contract_reviewer agent=agent-8",
        "evaluator run=run-8",
        "evaluator/evaluator agent=agent-9",
        "evaluator run=run-9",
      ].join("\n"));
      store.writeJson("request.json", request);
      store.writeJson("contract.json", contract);
      store.writeJson("baseline.json", {
        route: "/scanner",
        summary: "ok",
        currentWorkflows: ["Scan"],
        strengths: ["Existing scanners"],
        gaps: ["Need live verification"],
        performanceNotes: ["Cheap"],
        dataProvenanceNotes: ["Snapshot"],
        testGaps: [],
        doNotBreak: ["Filters"],
      });
      store.submit("baseline", {
        route: "/scanner",
        summary: "ok",
        currentWorkflows: ["Scan"],
        strengths: ["Existing scanners"],
        gaps: ["Need live verification"],
        performanceNotes: ["Cheap"],
        dataProvenanceNotes: ["Snapshot"],
        testGaps: [],
        doNotBreak: ["Filters"],
      });
      store.submit("page-map", {
        route: "/scanner",
        pageFile: "src/app/scanner/page.tsx",
        relatedFiles: [],
        dataFlow: [],
        apis: [],
        clientServerBoundary: "server",
        existingTests: [],
        adjacentPages: [],
        designTokens: [],
        sharedComponents: [],
      });
      store.submit("contract", contract);
      for (const round of [1, 2, 3]) {
        store.writeJson(`contract-decision-builder-${round}.json`, {
          decision: "accept",
          acceptedHash: hash,
          amendments: [],
          rationale: "ok",
        });
        store.writeJson(`contract-decision-evaluator-${round}.json`, {
          decision: "accept",
          acceptedHash: hash,
          amendments: [],
          rationale: "ok",
        });
      }
      store.writeJson("performance/before.json", inspect);
      mkdirSync(paths.inspectBefore, { recursive: true });
      writeFileSync(path.join(paths.inspectBefore, "inspect.json"), `${JSON.stringify(inspect, null, 2)}\n`);
      store.writeJson("verify-baseline.json", [
        {
          name: "playwright-target",
          ok: false,
          output: "connect ECONNREFUSED 127.0.0.1:3200",
          scope: "target",
        },
      ]);
      store.writeJson("evaluation.json", sampleEvaluation(false, hash));
      store.writeJson("budget.json", {
        agentRuns: 9,
        consumedActiveRuntimeMs: 4_887_823,
        pausedAt: null,
        usage: {
          availability: "measured",
          inputTokens: 10,
          outputTokens: 5,
          totalTokens: 15,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          reasoningTokens: 0,
          tokenLimitEnforced: true,
          tokenLimitStatus: "enforced",
          turns: [
            {
              availability: "measured",
              role: "builder",
              purpose: "contract_reviewer",
              inputTokens: 4,
              outputTokens: 2,
              totalTokens: 6,
              tokenLimitEnforced: true,
              tokenLimitStatus: "enforced",
            },
            {
              availability: "measured",
              role: "evaluator",
              purpose: "contract_reviewer",
              inputTokens: 3,
              outputTokens: 1,
              totalTokens: 4,
              tokenLimitEnforced: true,
              tokenLimitStatus: "enforced",
            },
            {
              availability: "measured",
              role: "evaluator",
              purpose: "evaluator",
              inputTokens: 3,
              outputTokens: 2,
              totalTokens: 5,
              tokenLimitEnforced: true,
              tokenLimitStatus: "enforced",
            },
          ],
        },
        maxAgentRuns: 12,
        maxTotalTokens: 20_000_000,
        maxDurationMinutes: 120,
        maxContractRounds: 3,
        maxIterations: 3,
      });
      const machine = RunMachine.start(
        paths.root,
        createMachine({
          runId,
          request,
          isolation: {
            mode: "worktree",
            repoRoot: tmp,
            agentCwd: worktree,
            branchName: "page-improve/scanner",
            worktreePath: worktree,
            created: true,
            baseSha: "72b156f1e61af53eaf38090ecdb0ff743f7c5ff9",
          },
          model: {},
        }),
      );
      for (const phase of [
        "PRECHECK",
        "WORKTREE",
        "BASELINE",
        "PLAN",
        "CONTRACT_DRAFT",
        "DUAL_REVIEW",
        "CONTRACT_LOCK",
        "VERIFY",
        "EVALUATE",
      ] as const) {
        machine.begin(phase);
        machine.complete(phase);
      }
      machine.lockContract(hash);
      machine.skip("OPTIONAL_SKEPTIC", "audit-only default");
      machine.state.completedContractRounds = [1, 2, 3];
      machine.persist();
      store.writeJson("run-status.json", {
        processStatus: "audit_complete",
        contractResult: "failed",
        reusable: true,
      });

      const result = remediateInfrastructureFailedAudit({ repoRoot: tmp, runId });
      expect(result.ok).toBe(true);
      expect(result.resumable).toBe(true);
      expect(result.reusable).toBe(false);
      expect(result.activePhase).toBe("VERIFY");
      expect(result.invocations.total).toBe(9);
      expect(result.invocations.failed).toBe(1);
      expect(result.remainingAgentRuns).toBe(3);
      const resumed = RunMachine.resume(paths.root);
      expect(resumed.state.contractLocked).toBe(true);
      expect(resumed.state.currentPhase).toBe("VERIFY");
      expect(resumed.shouldSkip("PLAN")).toBe(true);
      expect(resumed.shouldSkip("DUAL_REVIEW")).toBe(true);
      expect(resumed.shouldSkip("VERIFY")).toBe(false);
      expect(resumed.shouldSkip("EVALUATE")).toBe(false);
      expect(store.readJson("evaluation-superseded.json")).toBeTruthy();
      const resume = hydrateResumeState({
        store,
        machine: resumed.state,
        runRoot: paths.root,
      });
      expect(resume.resumable).toBe(true);
      expect(resume.reusable).toBe(false);
      expect(resume.budget.usage.availability).toBe("partial");
      expect(resume.nextAction).toMatch(/demo server/i);
      expect(resume.nextAction).toMatch(/Do not repeat the planner/);

      const opened: string[] = [];
      const host: AgentHost = {
        async open({ role, purpose }): Promise<AgentSession> {
          opened.push(`${role}/${purpose}`);
          return {
            agentId: `agent-${opened.length}`,
            role,
            purpose,
            async send() {
              if (role === "evaluator" && purpose === "evaluator") {
                store.submit("evaluation", sampleEvaluation(false, hash));
              }
              if (role === "skeptic") {
                store.submit("skeptic", { ...sampleEvaluation(false, hash), role: "skeptic" });
              }
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
      const after = await runHarness(
        { ...request, resumeRunId: runId },
        {
          host,
          store,
          paths,
          isolation: {
            mode: "worktree",
            repoRoot: tmp,
            agentCwd: worktree,
            branchName: "page-improve/scanner",
            worktreePath: worktree,
            created: true,
            baseSha: "72b156f1e61af53eaf38090ecdb0ff743f7c5ff9",
          },
          baseUrl: "http://127.0.0.1:3200",
          log: new Logger(() => {}),
          inspect: async () => inspect,
          verify: async () => [{ name: "typecheck", ok: true, output: "", scope: "static" }],
          git: {
            checkpoint: async () => ({ commit: "abc", dirty: false }),
            restoreCommit: async () => {},
            changedFiles: async () => [],
            currentHead: async () => "abc",
          },
          machine: resumed,
        },
      );
      expect(opened.some((row) => row.startsWith("planner/"))).toBe(false);
      expect(opened.some((row) => row.includes("contract_reviewer"))).toBe(false);
      expect(opened).toContain("evaluator/evaluator");
      expect(opened).toContain("skeptic/skeptic");
      expect(after.status).toBe("audit_complete");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
