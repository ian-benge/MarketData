import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ArtifactStore, createRunPaths } from "./artifacts";
import { writeAuthoritativeState } from "./final-state";
import { auditAfterEvidence } from "./policy";
import { sampleEvaluation } from "./test-fixtures";
import { emptyAggregatedUsage } from "./usage";

describe("authoritative final state", () => {
  it("clears stale infrastructure failure text after a successful audit", () => {
    const tmp = mkdtempSync(path.join(os.tmpdir(), "phr-final-"));
    try {
      const paths = createRunPaths(tmp, "final-state");
      const store = new ArtifactStore(paths);
      store.writeJson("fatal.json", {
        message: "connect ECONNREFUSED 127.0.0.1:3200",
        category: "infrastructure",
      });
      store.writeJson("run-status.json", {
        processStatus: "failed",
        reusable: false,
        failureCategory: "infrastructure",
        stopReason: "connect ECONNREFUSED 127.0.0.1:3200",
      });
      const state = writeAuthoritativeState({
        store,
        request: {
          route: "/scanner",
          objective: "Audit scanner",
          suppliedObjective: "Audit scanner",
          auditOnly: true,
          skeptic: true,
          maxIterations: 1,
          maxDurationMinutes: 5,
          maxContractRounds: 3,
          maxAgentRuns: 20,
          maxTotalTokens: 1000,
          inspectRole: "member",
          risk: "critical",
          fromAudit: null,
          resumeRunId: null,
          allowNoSandbox: false,
        },
        processStatus: "audit_complete",
        contractResult: "passed",
        reusable: true,
        integrationReady: false,
        contractLocked: true,
        contractHash: "a".repeat(64),
        verificationSource: "final",
        skepticRequired: true,
        skeptic: { ...sampleEvaluation(true, "a".repeat(64)), role: "skeptic" },
        after: auditAfterEvidence(),
        restoreKind: "none",
        evaluatedSha: "abc",
        bestCommit: null,
        stopReason: "connect ECONNREFUSED 127.0.0.1:3200",
        failureCategory: "infrastructure",
        usage: emptyAggregatedUsage(),
      });
      expect(state.stopReason).toBeNull();
      expect(state.failureCategory).toBeNull();
      expect(state.skepticStatus).toBe("completed");
      expect(store.readJson("fatal.json")).toBeNull();
      const status = store.readJson("run-status.json") as {
        stopReason: string | null;
        failureCategory: string | null;
        reusable: boolean;
      };
      expect(status.stopReason).toBeNull();
      expect(status.failureCategory).toBeNull();
      expect(status.reusable).toBe(true);
      expect(store.readJson("final-state.json")).toMatchObject({
        processStatus: "audit_complete",
        reusable: true,
        skepticStatus: "completed",
      });
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
