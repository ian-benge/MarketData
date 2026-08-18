import { describe, expect, it } from "vitest";
import { inspectAuditReuse, loadAuditReuse } from "./audit-reuse";
import { ArtifactStore, createRunPaths } from "./artifacts";
import { sampleContract } from "./test-fixtures";
import { canonicalizeContract } from "./schemas";
import { auditFingerprint } from "./audit-reuse";
import { existsSync, writeFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

describe("from-audit reuse", () => {
  it("rejects reuse when the base SHA no longer matches", () => {
    const tmp = mkdtempSync(path.join(os.tmpdir(), "phr-audit-"));
    try {
      const auditId = "settings-old";
      const auditPaths = createRunPaths(tmp, auditId);
      const contract = sampleContract("/settings");
      const store = new ArtifactStore(auditPaths);
      store.writeJson("contract.json", contract);
      store.writeJson(
        "audit-fingerprint.json",
        auditFingerprint({
          request: {
            route: "/settings",
            objective: "Audit",
            suppliedObjective: "Audit",
            auditOnly: true,
            skeptic: false,
            maxIterations: 1,
            maxDurationMinutes: 5,
            maxContractRounds: 1,
            maxAgentRuns: 5,
            maxTotalTokens: 1000,
            inspectRole: "member",
            risk: "medium",
            fromAudit: null,
            resumeRunId: null,
            allowNoSandbox: false,
          },
          isolation: {
            mode: "none",
            repoRoot: tmp,
            agentCwd: tmp,
            branchName: null,
            worktreePath: null,
            created: false,
            baseSha: "OLDSHA",
          },
          contract,
        }),
      );
      const current = new ArtifactStore(createRunPaths(tmp, "improve-new"));
      const result = loadAuditReuse({
        repoRoot: tmp,
        fromAudit: auditId,
        request: {
          route: "/settings",
          objective: "Audit",
            suppliedObjective: "Audit",
            auditOnly: false,
          skeptic: false,
          maxIterations: 1,
          maxDurationMinutes: 5,
          maxContractRounds: 1,
          maxAgentRuns: 5,
          maxTotalTokens: 1000,
          inspectRole: "member",
          risk: "medium",
          fromAudit: auditId,
          resumeRunId: null,
          allowNoSandbox: false,
        },
        isolation: {
          mode: "none",
          repoRoot: tmp,
          agentCwd: tmp,
          branchName: null,
          worktreePath: null,
          created: false,
          baseSha: "NEWSHA",
        },
        store: current,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toMatch(/base SHA|fingerprint|Fresh baseline/i);
      expect(canonicalizeContract(contract).hash).toHaveLength(64);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("rejects a failed or incomplete audit as non-reusable", () => {
    const tmp = mkdtempSync(path.join(os.tmpdir(), "phr-audit-"));
    try {
      const auditId = "settings-cafe11f7";
      const auditPaths = createRunPaths(tmp, auditId);
      const store = new ArtifactStore(auditPaths);
      store.markUnreusable({
        failedPhase: "PLAN",
        message: "Local SDK sandboxing was requested, but sandboxing is not supported",
      });
      writeFileSync(
        path.join(auditPaths.root, "machine.json"),
        JSON.stringify({
          request: { auditOnly: true, route: "/settings" },
          currentPhase: "PLAN",
          contractLocked: false,
          stopReason: null,
          phases: { CONTRACT_LOCK: { status: "pending" } },
        }),
        "utf8",
      );
      mkdirSync(path.join(auditPaths.inspectBefore), { recursive: true });
      writeFileSync(
        path.join(auditPaths.inspectBefore, "diagnostics.json"),
        JSON.stringify({ kind: "baseline-invalid" }),
        "utf8",
      );
      const current = new ArtifactStore(createRunPaths(tmp, "improve-new"));
      const result = loadAuditReuse({
        repoRoot: tmp,
        fromAudit: auditId,
        request: {
          route: "/settings",
          objective: "Audit",
            suppliedObjective: "Audit",
            auditOnly: false,
          skeptic: false,
          maxIterations: 1,
          maxDurationMinutes: 5,
          maxContractRounds: 1,
          maxAgentRuns: 5,
          maxTotalTokens: 1000,
          inspectRole: "member",
          risk: "medium",
          fromAudit: auditId,
          resumeRunId: null,
          allowNoSandbox: false,
        },
        isolation: {
          mode: "none",
          repoRoot: tmp,
          agentCwd: tmp,
          branchName: null,
          worktreePath: null,
          created: false,
          baseSha: "NEWSHA",
        },
        store: current,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toMatch(/not reusable|invalid baseline/i);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("marks the diagnostic 20260817-76262336 Settings audit as non-reusable", () => {
    const auditRoot = path.join(
      process.cwd(),
      "tmp",
      "page-harness",
      "settings-20260817-76262336",
    );
    if (!existsSync(auditRoot)) {
      expect(existsSync(auditRoot)).toBe(false);
      return;
    }
    const result = inspectAuditReuse(
      auditRoot,
      {
        route: "/settings",
        objective: "Improve Settings for traders without shallow or disconnected work.",
        suppliedObjective: null,
        auditOnly: false,
        skeptic: false,
        maxIterations: 1,
        maxDurationMinutes: 5,
        maxContractRounds: 1,
        maxAgentRuns: 5,
        maxTotalTokens: 1000,
        inspectRole: "member",
        risk: "medium",
        fromAudit: "settings-20260817-76262336",
        resumeRunId: null,
        allowNoSandbox: false,
      },
      {
        mode: "none",
        repoRoot: process.cwd(),
        agentCwd: process.cwd(),
        branchName: null,
        worktreePath: null,
        created: false,
        baseSha: "2f9da92c1d3fe9664168327782804ee9f9bc477b",
      },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(
        /alias|provenance|requested route|pending|not reusable|fingerprint/i,
      );
    }
  });
});
