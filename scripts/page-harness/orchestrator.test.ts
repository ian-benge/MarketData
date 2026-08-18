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

function scriptedHost(
  store: ArtifactStore,
  evaluatorPassOn: number,
  options: {
    acceptedHash?: string;
    agentIds?: string[];
    usage?: { inputTokens: number; outputTokens: number; totalTokens: number } | "unknown";
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
      return {
        agentId,
        role,
        purpose,
        async send(prompt: string) {
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
      expect(usage.usage.turns.length).toBeGreaterThanOrEqual(4);
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
