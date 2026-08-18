import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ArtifactStore, createRunPaths } from "./artifacts";
import { auditAfterEvidence } from "./policy";
import { writeReport } from "./report";
import { sampleContract, sampleEvaluation, sampleInspect } from "./test-fixtures";
import { emptyAggregatedUsage } from "./usage";

describe("audit report after-evidence", () => {
  it("does not copy baseline measurements into after fields", () => {
    const tmp = mkdtempSync(path.join(os.tmpdir(), "phr-report-"));
    try {
      const paths = createRunPaths(tmp, "report-test");
      const store = new ArtifactStore(paths);
      const before = sampleInspect();
      const reportPath = writeReport({
        request: {
          route: "/settings",
          objective: "Exact objective text",
          suppliedObjective: "Exact objective text",
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
        page: null,
        baseline: null,
        pageMap: null,
        contract: sampleContract("/settings"),
        before,
        after: auditAfterEvidence(),
        evaluation: sampleEvaluation(false),
        skeptic: null,
        verify: [],
        status: "audit_complete",
        contractResult: "failed",
        score: 33.3,
        bestCommit: null,
        changed: [],
        completeness: {
          missing: [],
          failed: ["ui_ux.core"],
          noEvidence: [],
          illegalNotApplicable: [],
          unprovenConditional: [],
          ineligibleEvidence: [],
        },
        usage: emptyAggregatedUsage(),
        reusable: false,
      });
      const md = readFileSync(reportPath, "utf8");
      expect(md).toMatch(/Process status: \*\*audit_complete\*\*/);
      expect(md).toMatch(/Contract result: \*\*failed\*\*/);
      expect(md).toMatch(/After inspect: \*\*unavailable\*\*/);
      expect(md).not.toMatch(/After inspect: console errors 0, transfer 80kb/);
      expect(md).toMatch(/Exact objective text/);
      expect(md).toMatch(/Usage availability: \*\*unknown\*\*/);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
