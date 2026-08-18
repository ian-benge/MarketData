import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createMachine, RunMachine } from "./machine";
import type { HarnessRequest } from "./request";

const request: HarnessRequest = {
  route: "/denied",
  objective: "x",
  suppliedObjective: "x",
  auditOnly: false,
  skeptic: false,
  maxIterations: 1,
  maxDurationMinutes: 5,
  maxContractRounds: 1,
  maxAgentRuns: 5,
  maxTotalTokens: 1000,
  inspectRole: "public",
  risk: "low",
  fromAudit: null,
  resumeRunId: null,
  allowNoSandbox: false,
};

describe("resumable state machine", () => {
  it("skips completed phases after reload", () => {
    const tmp = mkdtempSync(path.join(os.tmpdir(), "phr-machine-"));
    try {
      const started = RunMachine.start(
        tmp,
        createMachine({ runId: "r1", request, isolation: {}, model: {} }),
      );
      started.begin("BASELINE", { route: "/denied" });
      started.complete("BASELINE", { ok: true });
      const resumed = RunMachine.resume(tmp);
      expect(resumed.shouldSkip("BASELINE")).toBe(true);
      expect(resumed.shouldSkip("PLAN")).toBe(false);
      expect(resumed.state.currentPhase).toBe("BASELINE");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
