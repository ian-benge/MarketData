import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ArtifactStore, createRunPaths } from "./artifacts";
import type { AgentHost, AgentSession } from "./agents";
import { runHarness } from "./orchestrator";
import { AuditReuseError } from "./audit-reuse";
import { Logger } from "./util";
import { sampleContract, sampleEvaluation, sampleInspect } from "./test-fixtures";
import { canonicalizeContract } from "./schemas";
import { evidenceMeta } from "./evidence";
import { createMachine, RunMachine } from "./machine";
import type { ServerLease } from "./server-lease";
import { AgentInvocationError } from "./agents";
import { writeFileSync, mkdirSync } from "node:fs";

function scriptedHost(
  store: ArtifactStore,
  evaluatorPassOn: number,
  options: {
    acceptedHash?: string;
    agentIds?: string[];
    usage?: { inputTokens: number; outputTokens: number; totalTokens: number } | "unknown";
    prompts?: string[];
    opened?: string[];
  } = {},
): AgentHost {
  let evalCount = 0;
  let builderImplement = 0;
  const contract = sampleContract();
  const hash = options.acceptedHash ?? canonicalizeContract(contract).hash;
  return {
    async open({ role, purpose }): Promise<AgentSession> {
      const agentId = `fake-${role}-${purpose}-${Math.random().toString(16).slice(2)}`;
      options.agentIds?.push(agentId);
      options.opened?.push(`${role}/${purpose}`);
      return {
        agentId,
        role,
        purpose,
        async send(prompt: string) {
          options.prompts?.push(prompt);
          const contractReview = purpose === "contract_reviewer";
          if (role === "planner") {
            store.submit("baseline", {
              route: "/denied",
              summary: "Static authorization edge.",
              currentWorkflows: ["Return to Market Overview"],
              strengths: ["Clear 403 copy"],
              gaps: ["Confirm keyboard path"],
              performanceNotes: ["Static page, cheap"],
              dataProvenanceNotes: ["No market data"],
              testGaps: [],
              doNotBreak: ["Copy meaning"],
            });
            store.submit("page-map", {
              route: "/denied",
              pageFile: "src/app/denied/page.tsx",
              relatedFiles: ["src/components/ui/AccessFrame.tsx"],
              dataFlow: ["No API"],
              apis: [],
              clientServerBoundary: "Server component only",
              existingTests: ["e2e/demo-auth.spec.ts"],
              adjacentPages: ["/login", "/admin"],
              designTokens: ["--ib-maroon-800"],
              sharedComponents: ["src/components/ui/AccessFrame.tsx"],
            });
            store.submit("contract", contract);
          }
          if (role === "builder") {
            if (contractReview) {
              store.submit("contract-decision", {
                decision: "accept",
                acceptedHash: hash,
                amendments: [],
                rationale: "Scope is implementable.",
              });
            } else {
              builderImplement += 1;
              store.submit("builder-summary", {
                iteration: builderImplement,
                changedFiles: ["src/app/denied/page.tsx"],
                behaviorImplemented: "Focus styles on actions",
                testsAdded: [],
                testsRun: ["typecheck"],
                architecturalDecisions: ["Reuse AccessFrame"],
                abandonedApproaches: [],
                remainingUncertainty: [],
                contractDeviation: "none",
              });
            }
          }
          if (role === "skeptic") {
            store.submit("skeptic", {
              ...sampleEvaluation(evalCount >= evaluatorPassOn, hash),
              role: "skeptic",
            });
          }
          if (role === "evaluator") {
            if (contractReview) {
              store.submit("contract-decision", {
                decision: "accept",
                acceptedHash: hash,
                amendments: [],
                rationale: "Gates are testable.",
              });
            } else {
              evalCount += 1;
              store.submit("evaluation", sampleEvaluation(evalCount >= evaluatorPassOn, hash));
            }
          }
          return {
            agentId,
            runId: `run-${role}-${purpose}`,
            status: "finished",
            resultText: prompt.slice(0, 20),
            usage:
              options.usage === "unknown"
                ? { inputTokens: 0, outputTokens: 0, totalTokens: 0 }
                : (options.usage ?? { inputTokens: 10, outputTokens: 5, totalTokens: 15 }),
            durationMs: 1,
            submitted: [],
          };
        },
        async close() {},
      };
    },
  };
}

const requestBase = {
  route: "/denied",
  auditOnly: false,
  skeptic: false,
  maxIterations: 2,
  maxDurationMinutes: 5,
  maxContractRounds: 2,
  maxAgentRuns: 20,
  maxTotalTokens: 100000,
  inspectRole: "public" as const,
  risk: "low" as const,
  fromAudit: null,
  resumeRunId: null,
  allowNoSandbox: false,
  suppliedObjective: "Improve keyboard",
};

function inspectStub() {
  return async (options: {
    route: string;
    baseUrl: string;
    meta?: {
      runId?: string;
      contractHash?: string;
      iteration?: number;
      worktreeSha?: string;
    };
  }) =>
    sampleInspect({
      route: options.route,
      baseUrl: options.baseUrl,
      finalUrl: `${options.baseUrl}${options.route}`,
      finalPathname: options.route,
      routeVerified: true,
      meta: evidenceMeta({
        runId: options.meta?.runId ?? "test",
        route: options.route,
        contractHash: options.meta?.contractHash ?? "pending",
        iteration: options.meta?.iteration ?? 0,
        worktreeSha: options.meta?.worktreeSha ?? "abc",
        serverOrigin: options.baseUrl,
        browser: "chrome",
        generatingCommand: "inspectRoute",
      }),
    });
}

describe("page harness orchestrator", () => {
  it("completes a read-only audit without treating it as an implementation pass", async () => {
    const tmp = mkdtempSync(path.join(os.tmpdir(), "phr-"));
    try {
      const paths = createRunPaths(tmp, "audit-test");
      const store = new ArtifactStore(paths);
      const result = await runHarness(
        { ...requestBase, objective: "Audit only", auditOnly: true, maxIterations: 1 },
        {
          host: scriptedHost(store, 1),
          store,
          paths,
          isolation: {
            mode: "none",
            repoRoot: tmp,
            agentCwd: tmp,
            branchName: null,
            worktreePath: null,
            created: false,
            baseSha: "abc",
          },
          baseUrl: "http://127.0.0.1:3200",
          log: new Logger(() => {}),
          inspect: inspectStub(),
          verify: async () => [{ name: "typecheck", ok: true, output: "" }],
          git: {
            checkpoint: async () => ({ commit: "aaa", dirty: false }),
            restoreCommit: async () => {},
            changedFiles: async () => [],
          },
        },
      );
      expect(result.status).toBe("audit_complete");
      expect(result.contractResult).toBe("passed");
      const report = readFileSync(result.reportPath, "utf8");
      expect(report).toMatch(/Process status: \*\*audit_complete\*\*/);
      expect(report).toMatch(/Contract result: \*\*passed\*\*/);
      expect(report).toMatch(/After inspect: \*\*unavailable\*\*/);
      expect(report).not.toMatch(/After inspect: console errors 0, transfer 80kb/);
      const usage = store.readJson("report.json") as {
        usage: { turns: unknown[]; availability: string; totalTokens: number | null };
      };
      expect(usage.usage.turns.length).toBeGreaterThanOrEqual(3);
      expect(usage.usage.availability).toBe("measured");
      expect(usage.usage.totalTokens).toBeGreaterThan(0);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("repairs after a failed evaluation with a fresh builder and keeps the passing checkpoint", async () => {
    const tmp = mkdtempSync(path.join(os.tmpdir(), "phr-"));
    const restored: string[] = [];
    const agentIds: string[] = [];
    try {
      const paths = createRunPaths(tmp, "improve-test");
      const store = new ArtifactStore(paths);
      const result = await runHarness(
        { ...requestBase, objective: "Improve keyboard" },
        {
          host: scriptedHost(store, 2, { agentIds }),
          store,
          paths,
          isolation: {
            mode: "none",
            repoRoot: tmp,
            agentCwd: tmp,
            branchName: "page-improve/denied-test",
            worktreePath: null,
            created: true,
            baseSha: "abc",
          },
          baseUrl: "http://127.0.0.1:3200",
          log: new Logger(() => {}),
          inspect: inspectStub(),
          verify: async () => [{ name: "typecheck", ok: true, output: "" }],
          git: {
            checkpoint: async (_cwd, message) => ({
              commit: message.includes("iteration") ? message.replace(/\s+/g, "-") : "start",
              dirty: true,
            }),
            restoreCommit: async (_cwd, commit) => {
              restored.push(commit);
            },
            changedFiles: async () => ["src/app/denied/page.tsx"],
          },
        },
      );
      expect(result.status).toBe("passed");
      expect(restored.some((commit) => commit.includes("iteration-2"))).toBe(true);
      const builderIds = agentIds.filter((id) => id.includes("builder-builder"));
      expect(builderIds.length).toBeGreaterThanOrEqual(2);
      expect(new Set(builderIds).size).toBe(builderIds.length);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("restores the original baseline when no iteration fully passes", async () => {
    const tmp = mkdtempSync(path.join(os.tmpdir(), "phr-"));
    const restored: string[] = [];
    try {
      const paths = createRunPaths(tmp, "restore-test");
      const store = new ArtifactStore(paths);
      const result = await runHarness(
        { ...requestBase, objective: "Improve keyboard", maxIterations: 1 },
        {
          host: scriptedHost(store, 99),
          store,
          paths,
          isolation: {
            mode: "none",
            repoRoot: tmp,
            agentCwd: tmp,
            branchName: "page-improve/denied-test",
            worktreePath: null,
            created: true,
            baseSha: "abc",
          },
          baseUrl: "http://127.0.0.1:3200",
          log: new Logger(() => {}),
          inspect: inspectStub(),
          verify: async () => [{ name: "typecheck", ok: true, output: "" }],
          git: {
            checkpoint: async (_cwd, message) => ({
              commit: message.includes("start") ? "BASELINE" : "ITER1",
              dirty: true,
            }),
            restoreCommit: async (_cwd, commit) => {
              restored.push(commit);
            },
            changedFiles: async () => ["src/app/denied/page.tsx"],
          },
        },
      );
      expect(result.status).toBe("failed");
      expect(restored).toContain("BASELINE");
      expect(restored.at(-1)).toBe("BASELINE");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("stops before the planner when baseline inspect is the login page", async () => {
    const tmp = mkdtempSync(path.join(os.tmpdir(), "phr-"));
    const opened: string[] = [];
    try {
      const paths = createRunPaths(tmp, "login-baseline");
      const store = new ArtifactStore(paths);
      const host = scriptedHost(store, 1);
      const wrapped: typeof host = {
        async open(options) {
          opened.push(`${options.role}/${options.purpose}`);
          return host.open(options);
        },
      };
      await expect(
        runHarness(
          {
            ...requestBase,
            route: "/settings",
            objective: "Audit settings",
            auditOnly: true,
            inspectRole: "member",
          },
          {
            host: wrapped,
            store,
            paths,
            isolation: {
              mode: "none",
              repoRoot: tmp,
              agentCwd: tmp,
              branchName: null,
              worktreePath: null,
              created: false,
              baseSha: "abc",
            },
            baseUrl: "http://127.0.0.1:3200",
            log: new Logger(() => {}),
            inspect: async (options) =>
              sampleInspect({
                route: options.route,
                baseUrl: options.baseUrl,
                role: "member",
                title: "Sign in · IB Market Data",
                finalUrl: `${options.baseUrl}/login?next=/settings`,
                finalPathname: "/login",
                headings: ["h1: Sign in"],
                routeVerified: false,
                auth: {
                  attempted: true,
                  ok: false,
                  cookiePresent: false,
                  endpointStatus: 200,
                },
              }),
            verify: async () => [],
            git: {
              checkpoint: async () => ({ commit: "aaa", dirty: false }),
              restoreCommit: async () => {},
              changedFiles: async () => [],
            },
          },
        ),
      ).rejects.toThrow(/not verified|login page/i);
      expect(opened).toEqual([]);
      expect(store.readJson("run-status.json")).toMatchObject({ reusable: false });
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("completes a failed-contract audit without treating process success as a product pass", async () => {
    const tmp = mkdtempSync(path.join(os.tmpdir(), "phr-"));
    try {
      const paths = createRunPaths(tmp, "audit-failed-contract");
      const store = new ArtifactStore(paths);
      const result = await runHarness(
        { ...requestBase, objective: "Audit only", auditOnly: true, maxIterations: 1 },
        {
          host: scriptedHost(store, 99),
          store,
          paths,
          isolation: {
            mode: "none",
            repoRoot: tmp,
            agentCwd: tmp,
            branchName: null,
            worktreePath: null,
            created: false,
            baseSha: "abc",
          },
          baseUrl: "http://127.0.0.1:3200",
          log: new Logger(() => {}),
          inspect: inspectStub(),
          verify: async () => [
            {
              name: "playwright-unrelated",
              ok: false,
              output: 'navigating to "http://127.0.0.1:3200/watchlists"',
              scope: "unrelated",
            },
          ],
          git: {
            checkpoint: async () => ({ commit: "aaa", dirty: false }),
            restoreCommit: async () => {},
            changedFiles: async () => [],
            currentHead: async () => "abc",
          },
        },
      );
      expect(result.status).toBe("audit_complete");
      expect(result.contractResult).toBe("failed");
      expect(result.status).toBe("audit_complete");
      const report = readFileSync(result.reportPath, "utf8");
      expect(report).toMatch(/Contract result: \*\*failed\*\*/);
      expect(report).toMatch(/After inspect: \*\*unavailable\*\*/);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("records unknown usage instead of measured zeros", async () => {
    const tmp = mkdtempSync(path.join(os.tmpdir(), "phr-"));
    try {
      const paths = createRunPaths(tmp, "audit-unknown-usage");
      const store = new ArtifactStore(paths);
      const result = await runHarness(
        { ...requestBase, objective: "Audit only", auditOnly: true, maxIterations: 1 },
        {
          host: scriptedHost(store, 1, { usage: "unknown" }),
          store,
          paths,
          isolation: {
            mode: "none",
            repoRoot: tmp,
            agentCwd: tmp,
            branchName: null,
            worktreePath: null,
            created: false,
            baseSha: "abc",
          },
          baseUrl: "http://127.0.0.1:3200",
          log: new Logger(() => {}),
          inspect: inspectStub(),
          verify: async () => [{ name: "typecheck", ok: true, output: "" }],
          git: {
            checkpoint: async () => ({ commit: "aaa", dirty: false }),
            restoreCommit: async () => {},
            changedFiles: async () => [],
            currentHead: async () => "abc",
          },
        },
      );
      expect(result.status).toBe("audit_complete");
      const report = readFileSync(result.reportPath, "utf8");
      expect(report).toMatch(/Usage availability: \*\*unknown\*\*/);
      expect(report).toMatch(/unenforced_usage_unknown/);
      expect(report).not.toMatch(/Input tokens: 0/);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("stamps post-edit inspect evidence with the evaluated worktree SHA, not the base SHA", async () => {
    const tmp = mkdtempSync(path.join(os.tmpdir(), "phr-"));
    const shas: string[] = [];
    try {
      const paths = createRunPaths(tmp, "sha-test");
      const store = new ArtifactStore(paths);
      let head = "BASELINE";
      await runHarness(
        { ...requestBase, objective: "Improve keyboard", maxIterations: 1 },
        {
          host: scriptedHost(store, 1),
          store,
          paths,
          isolation: {
            mode: "none",
            repoRoot: tmp,
            agentCwd: tmp,
            branchName: "page-improve/denied-test",
            worktreePath: null,
            created: true,
            baseSha: "abc",
          },
          baseUrl: "http://127.0.0.1:3200",
          log: new Logger(() => {}),
          inspect: async (options) => {
            shas.push(options.meta?.worktreeSha ?? "");
            return inspectStub()(options);
          },
          verify: async () => [{ name: "typecheck", ok: true, output: "" }],
          git: {
            checkpoint: async (_cwd, message) => {
              if (message.includes("start")) {
                head = "START";
                return { commit: "START", dirty: true };
              }
              head = "ITER1";
              return { commit: "ITER1", dirty: true };
            },
            restoreCommit: async () => {
              head = "ITER1";
            },
            changedFiles: async () => ["src/app/denied/page.tsx"],
            currentHead: async () => head,
          },
        },
      );
      expect(shas.some((sha) => sha === "START" || sha === "ITER1")).toBe(true);
      expect(shas.every((sha) => sha !== "abc")).toBe(true);
      const after = store.readJson("performance/after-1.json") as { meta: { worktreeSha: string } };
      expect(after.meta.worktreeSha).not.toBe("abc");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("treats a post-builder login redirect as a failed iteration, not a pass", async () => {
    const tmp = mkdtempSync(path.join(os.tmpdir(), "phr-"));
    try {
      const paths = createRunPaths(tmp, "login-after-build");
      const store = new ArtifactStore(paths);
      await expect(
        runHarness(
          { ...requestBase, objective: "Improve keyboard", maxIterations: 1 },
          {
            host: scriptedHost(store, 1),
            store,
            paths,
            isolation: {
              mode: "none",
              repoRoot: tmp,
              agentCwd: tmp,
              branchName: "page-improve/denied-test",
              worktreePath: null,
              created: true,
              baseSha: "abc",
            },
            baseUrl: "http://127.0.0.1:3200",
            log: new Logger(() => {}),
            inspect: async (options) => {
              if ((options.meta?.iteration ?? 0) >= 1) {
                return sampleInspect({
                  route: options.route,
                  baseUrl: options.baseUrl,
                  title: "Sign in · IB Market Data",
                  finalUrl: `${options.baseUrl}/login?next=${options.route}`,
                  finalPathname: "/login",
                  headings: ["h1: Sign in"],
                  routeVerified: false,
                  meta: evidenceMeta({
                    runId: options.meta?.runId ?? "test",
                    route: options.route,
                    contractHash: options.meta?.contractHash ?? "pending",
                    iteration: options.meta?.iteration ?? 1,
                    worktreeSha: options.meta?.worktreeSha ?? "abc",
                    serverOrigin: options.baseUrl,
                    browser: "chrome",
                    generatingCommand: "inspectRoute",
                  }),
                });
              }
              return inspectStub()(options);
            },
            verify: async () => [{ name: "typecheck", ok: true, output: "" }],
            git: {
              checkpoint: async () => ({ commit: "START", dirty: true }),
              restoreCommit: async () => {},
              changedFiles: async () => ["src/app/denied/page.tsx"],
              currentHead: async () => "START",
            },
          },
        ),
      ).rejects.toThrow(/login page|not verified|finished at \/login/i);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("refuses invalid --from-audit evidence instead of falling back to a fresh plan", async () => {
    const tmp = mkdtempSync(path.join(os.tmpdir(), "phr-"));
    const opened: string[] = [];
    try {
      const paths = createRunPaths(tmp, "from-audit-invalid");
      const store = new ArtifactStore(paths);
      const host = scriptedHost(store, 1);
      const wrapped: typeof host = {
        async open(options) {
          opened.push(`${options.role}/${options.purpose}`);
          return host.open(options);
        },
      };
      await expect(
        runHarness(
          {
            ...requestBase,
            objective: "Improve keyboard",
            fromAudit: "does-not-exist",
          },
          {
            host: wrapped,
            store,
            paths,
            isolation: {
              mode: "none",
              repoRoot: tmp,
              agentCwd: tmp,
              branchName: null,
              worktreePath: null,
              created: false,
              baseSha: "abc",
            },
            baseUrl: "http://127.0.0.1:3200",
            log: new Logger(() => {}),
            inspect: inspectStub(),
            verify: async () => [{ name: "typecheck", ok: true, output: "" }],
            git: {
              checkpoint: async () => ({ commit: "aaa", dirty: false }),
              restoreCommit: async () => {},
              changedFiles: async () => [],
              currentHead: async () => "abc",
            },
          },
        ),
      ).rejects.toThrow(AuditReuseError);
      expect(opened.some((id) => id.startsWith("planner"))).toBe(false);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("cancels on budget exhaustion, restores the baseline, and reevaluates that state", async () => {
    const tmp = mkdtempSync(path.join(os.tmpdir(), "phr-"));
    const restored: string[] = [];
    const evaluatedShas: string[] = [];
    try {
      const paths = createRunPaths(tmp, "budget-cancel");
      const store = new ArtifactStore(paths);
      let head = "BASELINE";
      const result = await runHarness(
        {
          ...requestBase,
          objective: "Improve keyboard",
          maxIterations: 2,
          maxAgentRuns: 5,
        },
        {
          host: scriptedHost(store, 99),
          store,
          paths,
          isolation: {
            mode: "none",
            repoRoot: tmp,
            agentCwd: tmp,
            branchName: "page-improve/denied-test",
            worktreePath: null,
            created: true,
            baseSha: "abc",
          },
          baseUrl: "http://127.0.0.1:3200",
          log: new Logger(() => {}),
          inspect: async (options) => {
            evaluatedShas.push(options.meta?.worktreeSha ?? "");
            return inspectStub()(options);
          },
          verify: async () => [{ name: "typecheck", ok: true, output: "" }],
          git: {
            checkpoint: async (_cwd, message) => {
              if (message.includes("start")) {
                head = "BASELINE";
                return { commit: "BASELINE", dirty: true };
              }
              head = "ITER1";
              return { commit: "ITER1", dirty: true };
            },
            restoreCommit: async (_cwd, commit) => {
              restored.push(commit);
              head = commit;
            },
            changedFiles: async () => ["src/app/denied/page.tsx"],
            currentHead: async () => head,
          },
        },
      );
      expect(result.status).toBe("cancelled");
      expect(restored).toContain("BASELINE");
      expect(evaluatedShas.at(-1)).toBe("BASELINE");
      const report = readFileSync(result.reportPath, "utf8");
      expect(report).toMatch(/Process status: \*\*cancelled\*\*/);
      expect(report).toMatch(/Integration ready: \*\*no\*\*/);
      expect(result.integrationReady).toBe(false);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("reevaluates the restored checkpoint instead of reusing the last iteration evaluation", async () => {
    const tmp = mkdtempSync(path.join(os.tmpdir(), "phr-"));
    const restored: string[] = [];
    try {
      const paths = createRunPaths(tmp, "restore-reeval");
      const store = new ArtifactStore(paths);
      let evals = 0;
      const host = scriptedHost(store, 2);
      const wrapped: typeof host = {
        async open(options) {
          const session = await host.open(options);
          return {
            ...session,
            async send(prompt: string) {
              const result = await session.send(prompt);
              if (options.role === "evaluator" && options.purpose === "evaluator") {
                evals += 1;
              }
              return result;
            },
          };
        },
      };
      const result = await runHarness(
        { ...requestBase, objective: "Improve keyboard", maxIterations: 2 },
        {
          host: wrapped,
          store,
          paths,
          isolation: {
            mode: "none",
            repoRoot: tmp,
            agentCwd: tmp,
            branchName: "page-improve/denied-test",
            worktreePath: null,
            created: true,
            baseSha: "abc",
          },
          baseUrl: "http://127.0.0.1:3200",
          log: new Logger(() => {}),
          inspect: inspectStub(),
          verify: async () => [{ name: "typecheck", ok: true, output: "" }],
          git: {
            checkpoint: async (_cwd, message) => ({
              commit: message.includes("iteration") ? "PASSING" : "START",
              dirty: true,
            }),
            restoreCommit: async (_cwd, commit) => {
              restored.push(commit);
            },
            changedFiles: async () => ["src/app/denied/page.tsx"],
            currentHead: async () => restored.at(-1) ?? "START",
          },
        },
      );
      expect(result.status).toBe("passed");
      expect(restored.at(-1)).toMatch(/PASSING|iteration/);
      expect(evals).toBeGreaterThanOrEqual(3);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("preserves a passing checkpoint when a later budget check fires", async () => {
    const tmp = mkdtempSync(path.join(os.tmpdir(), "phr-"));
    const restored: string[] = [];
    try {
      const paths = createRunPaths(tmp, "budget-preserve-pass");
      const store = new ArtifactStore(paths);
      let head = "BASELINE";
      const result = await runHarness(
        {
          ...requestBase,
          objective: "Improve keyboard",
          maxIterations: 1,
          maxAgentRuns: 5,
          reviewers: 2,
        },
        {
          host: scriptedHost(store, 1),
          store,
          paths,
          isolation: {
            mode: "none",
            repoRoot: tmp,
            agentCwd: tmp,
            branchName: "page-improve/denied-test",
            worktreePath: null,
            created: true,
            baseSha: "abc",
          },
          baseUrl: "http://127.0.0.1:3200",
          log: new Logger(() => {}),
          inspect: inspectStub(),
          verify: async () => [{ name: "typecheck", ok: true, output: "" }],
          git: {
            checkpoint: async (_cwd, message) => {
              if (message.includes("start")) {
                head = "BASELINE";
                return { commit: "BASELINE", dirty: true };
              }
              head = "PASSING";
              return { commit: "PASSING", dirty: true };
            },
            restoreCommit: async (_cwd, commit) => {
              restored.push(commit);
              head = commit;
            },
            changedFiles: async () => ["src/app/denied/page.tsx"],
            currentHead: async () => head,
          },
        },
      );
      expect(result.status).toBe("cancelled");
      expect(restored.at(-1)).toBe("PASSING");
      expect(result.bestCommit).toBe("PASSING");
      const report = readFileSync(result.reportPath, "utf8");
      expect(report).toMatch(/passing_checkpoint/);
      expect(report).not.toMatch(/Best checkpoint: n\/a/);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

function recordingLease(origin = "http://127.0.0.1:3200") {
  const phases: Array<string | null> = [];
  const lease: ServerLease = {
    origin: () => origin,
    handle: () => null,
    async ensure(phase) {
      phases.push(phase);
      return {
        origin,
        started: phase === "VERIFY" || phase === "EVALUATE" || phase === "OPTIONAL_SKEPTIC" || phase === "BASELINE",
        restarted: false,
        probed: phase === "VERIFY" || phase === "EVALUATE" || phase === "OPTIONAL_SKEPTIC" || phase === "BASELINE",
      };
    },
    async probeAlive() {
      return { ok: true };
    },
    async stop() {},
  };
  return { lease, phases };
}

function seedLockedAudit(tmp: string, runId: string, request: typeof requestBase & { objective: string }) {
  const paths = createRunPaths(tmp, runId);
  const store = new ArtifactStore(paths);
  const contract = sampleContract(request.route);
  const hash = canonicalizeContract(contract).hash;
  const inspect = sampleInspect({
    route: request.route,
    finalUrl: `http://127.0.0.1:3200${request.route}`,
    finalPathname: request.route,
    routeVerified: true,
    meta: evidenceMeta({
      runId,
      route: request.route,
      contractHash: "pending",
      iteration: 0,
      worktreeSha: "abc",
      serverOrigin: "http://127.0.0.1:3200",
      browser: "chrome",
      generatingCommand: "inspectRoute baseline",
    }),
  });
  store.writeJson("performance/before.json", inspect);
  mkdirSync(paths.inspectBefore, { recursive: true });
  writeFileSync(
    path.join(paths.inspectBefore, "inspect.json"),
    `${JSON.stringify(inspect, null, 2)}\n`,
  );
  store.submit("baseline", {
    route: request.route,
    summary: "ok",
    currentWorkflows: ["Use the page"],
    strengths: ["Existing layout"],
    gaps: ["Need evidence"],
    performanceNotes: ["Cheap"],
    dataProvenanceNotes: ["None"],
    testGaps: [],
    doNotBreak: ["Copy"],
  });
  store.submit("page-map", {
    route: request.route,
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
  store.submit("contract", contract);
  store.writeJson("contract-decision-builder-1.json", {
    decision: "accept",
    acceptedHash: hash,
    amendments: [],
    rationale: "ok",
  });
  store.writeJson("contract-decision-evaluator-1.json", {
    decision: "accept",
    acceptedHash: hash,
    amendments: [],
    rationale: "ok",
  });
  const machine = RunMachine.start(
    paths.root,
    createMachine({
      runId,
      request: { ...request, objective: request.objective },
      isolation: {
        mode: "none",
        repoRoot: tmp,
        agentCwd: tmp,
        branchName: null,
        worktreePath: null,
        created: false,
        baseSha: "abc",
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
  ] as const) {
    machine.begin(phase);
    machine.complete(phase);
  }
  machine.lockContract(hash);
  return { paths, store, machine, hash, inspect };
}

describe("audit server lease, skeptic, and identity", () => {
  it("does not start a server at DUAL_REVIEW and acquires one before VERIFY", async () => {
    const tmp = mkdtempSync(path.join(os.tmpdir(), "phr-lease-orch-"));
    try {
      const { lease, phases } = recordingLease();
      const { paths, store, machine } = seedLockedAudit(tmp, "denied-lock", {
        ...requestBase,
        objective: "Audit only",
        auditOnly: true,
      });
      const opened: string[] = [];
      await runHarness(
        { ...requestBase, objective: "Audit only", auditOnly: true },
        {
          host: scriptedHost(store, 1, { opened }),
          store,
          paths,
          isolation: {
            mode: "none",
            repoRoot: tmp,
            agentCwd: tmp,
            branchName: null,
            worktreePath: null,
            created: false,
            baseSha: "abc",
          },
          baseUrl: "http://127.0.0.1:3200",
          log: new Logger(() => {}),
          inspect: inspectStub(),
          verify: async (options) => {
            expect(options.baseUrl).toBe("http://127.0.0.1:3200");
            return [{ name: "typecheck", ok: true, output: "", scope: "static" }];
          },
          git: {
            checkpoint: async () => ({ commit: "aaa", dirty: false }),
            restoreCommit: async () => {},
            changedFiles: async () => [],
            currentHead: async () => "abc",
          },
          machine,
          server: lease,
        },
      );
      expect(phases).not.toContain("DUAL_REVIEW");
      expect(phases).toContain("VERIFY");
      expect(opened.some((row) => row.startsWith("planner/"))).toBe(false);
      expect(opened.some((row) => row.includes("contract_reviewer"))).toBe(false);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("runs an explicit audit skeptic and shares contract/evidence identity with the evaluator", async () => {
    const tmp = mkdtempSync(path.join(os.tmpdir(), "phr-skep-"));
    try {
      const paths = createRunPaths(tmp, "audit-skeptic");
      const store = new ArtifactStore(paths);
      const prompts: string[] = [];
      const opened: string[] = [];
      const result = await runHarness(
        {
          ...requestBase,
          objective: "Audit only",
          auditOnly: true,
          skeptic: true,
          risk: "low",
          maxIterations: 1,
        },
        {
          host: scriptedHost(store, 1, { prompts, opened }),
          store,
          paths,
          isolation: {
            mode: "none",
            repoRoot: tmp,
            agentCwd: tmp,
            branchName: null,
            worktreePath: null,
            created: false,
            baseSha: "abc",
          },
          baseUrl: "http://127.0.0.1:3200",
          log: new Logger(() => {}),
          inspect: inspectStub(),
          verify: async () => [{ name: "typecheck", ok: true, output: "", scope: "static" }],
          git: {
            checkpoint: async () => ({ commit: "aaa", dirty: false }),
            restoreCommit: async () => {},
            changedFiles: async () => [],
            currentHead: async () => "abc",
          },
        },
      );
      expect(result.status).toBe("audit_complete");
      expect(opened).toContain("skeptic/skeptic");
      expect(store.readJson("skeptic.json")).toMatchObject({ role: "skeptic" });
      const evalPrompt = prompts.find((row) => row.includes("independent read-only evaluator"));
      const skepticPrompt = prompts.find((row) => row.includes("adversarial skeptic"));
      expect(evalPrompt).toBeTruthy();
      expect(skepticPrompt).toBeTruthy();
      const hashLine = evalPrompt!.match(/Contract hash: (\S+)/)?.[1];
      expect(skepticPrompt).toContain(`Contract hash: ${hashLine}`);
      expect(evalPrompt).toMatch(/verification: /);
      const verifyLine = evalPrompt!.match(/- verification: (.+)/)?.[1];
      expect(skepticPrompt).toContain(`- verification: ${verifyLine}`);
      const identity = store.readJson("evaluation-evidence.json") as { hash: string };
      expect(identity.hash).toHaveLength(64);
      expect(evalPrompt).toContain(`Evidence identity: ${identity.hash}`);
      expect(skepticPrompt).toContain(`Evidence identity: ${identity.hash}`);
      const report = readFileSync(result.reportPath, "utf8");
      expect(report).toMatch(/Skeptic: \*\*completed/);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("refuses to finalize a critical audit without a skeptic", async () => {
    const tmp = mkdtempSync(path.join(os.tmpdir(), "phr-noskep-"));
    try {
      const paths = createRunPaths(tmp, "audit-critical");
      const store = new ArtifactStore(paths);
      const host = scriptedHost(store, 1);
      const originalOpen = host.open.bind(host);
      host.open = async (options) => {
        const session = await originalOpen(options);
        if (options.role === "skeptic") {
          return {
            ...session,
            async send() {
              return {
                agentId: session.agentId,
                runId: "run-skep-missing",
                status: "finished",
                resultText: "no artifact",
                usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
                durationMs: 1,
                submitted: [],
              };
            },
          };
        }
        return session;
      };
      await expect(
        runHarness(
          {
            ...requestBase,
            objective: "Audit only",
            auditOnly: true,
            risk: "critical",
            maxIterations: 1,
            maxAgentRuns: 20,
          },
          {
            host,
            store,
            paths,
            isolation: {
              mode: "none",
              repoRoot: tmp,
              agentCwd: tmp,
              branchName: null,
              worktreePath: null,
              created: false,
              baseSha: "abc",
            },
            baseUrl: "http://127.0.0.1:3200",
            log: new Logger(() => {}),
            inspect: inspectStub(),
            verify: async () => [{ name: "typecheck", ok: true, output: "", scope: "static" }],
            git: {
              checkpoint: async () => ({ commit: "aaa", dirty: false }),
              restoreCommit: async () => {},
              changedFiles: async () => [],
              currentHead: async () => "abc",
            },
          },
        ),
      ).rejects.toThrow(/skeptic|artifact/i);
      const status = store.readJson("run-status.json") as { reusable?: boolean; processStatus?: string };
      expect(status?.reusable).not.toBe(true);
      expect(status?.processStatus).not.toBe("audit_complete");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("classifies infrastructure-failed target verification as not reusable", async () => {
    const tmp = mkdtempSync(path.join(os.tmpdir(), "phr-infra-"));
    try {
      const paths = createRunPaths(tmp, "audit-infra");
      const store = new ArtifactStore(paths);
      await expect(
        runHarness(
          { ...requestBase, objective: "Audit only", auditOnly: true, maxIterations: 1 },
          {
            host: scriptedHost(store, 1),
            store,
            paths,
            isolation: {
              mode: "none",
              repoRoot: tmp,
              agentCwd: tmp,
              branchName: null,
              worktreePath: null,
              created: false,
              baseSha: "abc",
            },
            baseUrl: "http://127.0.0.1:3200",
            log: new Logger(() => {}),
            inspect: inspectStub(),
            verify: async () => [
              {
                name: "playwright-target",
                ok: false,
                output: "connect ECONNREFUSED 127.0.0.1:3200",
                scope: "target",
              },
            ],
            git: {
              checkpoint: async () => ({ commit: "aaa", dirty: false }),
              restoreCommit: async () => {},
              changedFiles: async () => [],
              currentHead: async () => "abc",
            },
          },
        ),
      ).rejects.toThrow(/ECONNREFUSED|infrastructure/i);
      const status = store.readJson("run-status.json") as { reusable?: boolean };
      expect(status?.reusable).toBe(false);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("counts a failed invocation toward the agent-run budget", async () => {
    const tmp = mkdtempSync(path.join(os.tmpdir(), "phr-failrun-"));
    try {
      const paths = createRunPaths(tmp, "audit-failrun");
      const store = new ArtifactStore(paths);
      const host = scriptedHost(store, 1);
      const originalOpen = host.open.bind(host);
      host.open = async (options) => {
        const session = await originalOpen(options);
        if (options.role === "planner") {
          return {
            ...session,
            async send() {
              throw new AgentInvocationError("planner run failed (run-x): Connection failed repeatedly");
            },
          };
        }
        return session;
      };
      await expect(
        runHarness(
          { ...requestBase, objective: "Audit only", auditOnly: true, maxAgentRuns: 12 },
          {
            host,
            store,
            paths,
            isolation: {
              mode: "none",
              repoRoot: tmp,
              agentCwd: tmp,
              branchName: null,
              worktreePath: null,
              created: false,
              baseSha: "abc",
            },
            baseUrl: "http://127.0.0.1:3200",
            log: new Logger(() => {}),
            inspect: inspectStub(),
            verify: async () => [{ name: "typecheck", ok: true, output: "" }],
            git: {
              checkpoint: async () => ({ commit: "aaa", dirty: false }),
              restoreCommit: async () => {},
              changedFiles: async () => [],
              currentHead: async () => "abc",
            },
          },
        ),
      ).rejects.toThrow(/Connection failed/);
      const budget = store.readJson("budget.json") as { agentRuns: number };
      expect(budget.agentRuns).toBeGreaterThanOrEqual(1);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("locks a conflict-free critical audit after one planner and two reviewers", async () => {
    const tmp = mkdtempSync(path.join(os.tmpdir(), "phr-critical-lock-"));
    try {
      const paths = createRunPaths(tmp, "audit-critical-lock");
      const store = new ArtifactStore(paths);
      const opened: string[] = [];
      const result = await runHarness(
        {
          ...requestBase,
          objective: "Audit only",
          auditOnly: true,
          risk: "critical",
          maxIterations: 1,
          maxContractRounds: 3,
        },
        {
          host: scriptedHost(store, 1, { opened }),
          store,
          paths,
          isolation: {
            mode: "none",
            repoRoot: tmp,
            agentCwd: tmp,
            branchName: null,
            worktreePath: null,
            created: false,
            baseSha: "abc",
          },
          baseUrl: "http://127.0.0.1:3200",
          log: new Logger(() => {}),
          inspect: inspectStub(),
          verify: async () => [{ name: "typecheck", ok: true, output: "", scope: "static" }],
          git: {
            checkpoint: async () => ({ commit: "aaa", dirty: false }),
            restoreCommit: async () => {},
            changedFiles: async () => [],
            currentHead: async () => "abc",
          },
        },
      );
      expect(result.status).toBe("audit_complete");
      expect(opened.filter((row) => row.startsWith("planner/"))).toEqual(["planner/planner"]);
      expect(opened.filter((row) => row.includes("contract_reviewer"))).toEqual([
        "builder/contract_reviewer",
        "evaluator/contract_reviewer",
      ]);
      expect(opened).toContain("evaluator/evaluator");
      expect(opened).toContain("skeptic/skeptic");
      expect(store.readJson("contract-decision-builder-2.json")).toBeNull();
      const finalState = store.readJson("final-state.json") as { skepticStatus?: string };
      expect(finalState.skepticStatus).toBe("completed");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

