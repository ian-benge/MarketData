import { describe, expect, it } from "vitest";
import {
  alignUsageWithInvocations,
  parseHarnessLogInvocations,
  summarizeInvocations,
} from "./invocations";
import { accountSdkUsage, emptyAggregatedUsage } from "./usage";

const SCANNER_LOG = `
[phr 16:14:36] requested=enabled; detected=unsupported
[phr 16:15:22] planner/planner agent=agent-1 tools=read
[phr 16:15:25] planner run=run-01a9f44a
[phr 16:26:01] builder/contract_reviewer agent=agent-2 tools=read
[phr 16:26:01] builder run=run-484aa9ad
[phr 16:34:07] evaluator/contract_reviewer agent=agent-3 tools=read
[phr 16:34:08] evaluator run=run-cd8fc7ec
[phr 16:41:54] builder/contract_reviewer agent=agent-4 tools=read
[phr 16:41:54] builder run=run-38f6f504
[phr 16:50:56] evaluator/contract_reviewer agent=agent-5 tools=read
[phr 16:50:57] evaluator run=run-77977113
[phr 17:01:40] builder/contract_reviewer agent=agent-6 tools=read
[phr 17:01:40] builder run=run-02c7bf59
[phr 17:10:38] ERROR builder run failed (run-02c7bf59): Connection failed repeatedly
[phr 18:29:31] requested=enabled; detected=unsupported
[phr 18:29:35] builder/contract_reviewer agent=agent-7 tools=read
[phr 18:29:37] builder run=run-726250d9
[phr 18:39:21] evaluator/contract_reviewer agent=agent-8 tools=read
[phr 18:39:21] evaluator run=run-15f65abe
[phr 18:46:48] evaluator/evaluator agent=agent-9 tools=read
[phr 18:46:48] evaluator run=run-c983fa65
`;

describe("cross-attempt invocation accounting", () => {
  it("counts completed and failed roles across attempts", () => {
    const rows = parseHarnessLogInvocations(SCANNER_LOG);
    const ledger = summarizeInvocations(rows);
    expect(ledger.total).toBe(9);
    expect(ledger.completed).toBe(8);
    expect(ledger.failed).toBe(1);
    expect(ledger.byRole).toEqual({ planner: 1, builder: 4, evaluator: 4 });
    expect(ledger.byPurpose.contract_reviewer).toBe(7);
    expect(ledger.byAttempt).toEqual({ "1": 6, "2": 3 });
    expect(rows.find((row) => row.runId === "run-02c7bf59")?.status).toBe("failed");
  });

  it("treats prior unknown plus current measured usage as partial", () => {
    const ledger = summarizeInvocations(parseHarnessLogInvocations(SCANNER_LOG));
    const usage = emptyAggregatedUsage();
    usage.availability = "measured";
    usage.turns = [
      { ...accountSdkUsage({ inputTokens: 10, outputTokens: 5, totalTokens: 15 }), role: "builder", purpose: "contract_reviewer" },
      { ...accountSdkUsage({ inputTokens: 8, outputTokens: 4, totalTokens: 12 }), role: "evaluator", purpose: "contract_reviewer" },
      { ...accountSdkUsage({ inputTokens: 20, outputTokens: 10, totalTokens: 30 }), role: "evaluator", purpose: "evaluator" },
    ];
    alignUsageWithInvocations(usage, ledger);
    expect(usage.availability).toBe("partial");
    expect(usage.tokenLimitStatus).toBe("enforced_measured_only");
    expect(usage.totalTokens).toBe(57);
    expect(usage.turns).toHaveLength(9);
    expect(usage.reason).toMatch(/lower bound/i);
    expect(usage.reason).toMatch(/not fully enforced retrospectively/i);
  });
});
