import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ArtifactStore, createRunPaths } from "./artifacts";
import type { AgentHost, AgentSession } from "./agents";
import { agreeContract } from "./contract-consensus";
import { RunBudget } from "./budget";
import { Logger } from "./util";
import { canonicalizeContract, type PageContract } from "./schemas";
import { sampleContract } from "./test-fixtures";

function reviewerHost(
  store: ArtifactStore,
  script: Array<"accept" | "amend-a" | "amend-b">,
): AgentHost {
  let i = 0;
  const base = sampleContract();
  const altA: PageContract = { ...base, objective: `${base.objective} A` };
  const altB: PageContract = { ...base, objective: `${base.objective} B` };
  const hash = canonicalizeContract(base).hash;
  return {
    async open({ role, purpose }): Promise<AgentSession> {
      return {
        agentId: `rev-${role}-${i}`,
        role,
        purpose,
        async send() {
          const step = script[i] ?? "accept";
          i += 1;
          if (step === "accept") {
            store.submit("contract-decision", {
              decision: "accept",
              acceptedHash: hash,
              amendments: [],
              rationale: "ok",
            });
          } else {
            store.submit("contract-decision", {
              decision: "amend",
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
  it("locks only when both reviewers accept the same hash", async () => {
    const tmp = mkdtempSync(path.join(os.tmpdir(), "phr-cc-"));
    try {
      const paths = createRunPaths(tmp, "cc");
      const store = new ArtifactStore(paths);
      const agreed = await agreeContract({
        route: "/denied",
        objective: sampleContract().objective,
        contract: sampleContract(),
        maxRounds: 2,
        deps: {
          host: reviewerHost(store, ["accept", "accept"]),
          store,
          isolation: {
            mode: "none",
            repoRoot: tmp,
            agentCwd: tmp,
            branchName: null,
            worktreePath: null,
            created: false,
            baseSha: "x",
          },
          budget: new RunBudget({
            maxDurationMs: 10_000,
            maxAgentRuns: 10,
            maxTotalTokens: 1000,
            maxIterations: 1,
            maxContractRounds: 2,
          }),
          log: new Logger(() => {}),
        },
      });
      expect(agreed.hash).toBe(canonicalizeContract(sampleContract()).hash);
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
            isolation: {
              mode: "none",
              repoRoot: tmp,
              agentCwd: tmp,
              branchName: null,
              worktreePath: null,
              created: false,
              baseSha: "x",
            },
            budget: new RunBudget({
              maxDurationMs: 10_000,
              maxAgentRuns: 10,
              maxTotalTokens: 1000,
              maxIterations: 1,
              maxContractRounds: 1,
            }),
            log: new Logger(() => {}),
          },
        }),
      ).rejects.toThrow(/did not accept the same canonical contract hash/);
      expect(store.readJson("contract-conflict-1.json")).toBeTruthy();
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
