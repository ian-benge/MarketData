import { describe, expect, it } from "vitest";
import { RunBudget } from "./budget";
import {
  accountSdkUsage,
  addTurn,
  emptyAggregatedUsage,
  usageReportLines,
} from "./usage";

describe("SDK usage accounting", () => {
  it("aggregates measured usage from every role", () => {
    const usage = emptyAggregatedUsage();
    addTurn(usage, "planner", "planner", accountSdkUsage({ inputTokens: 10, outputTokens: 5, totalTokens: 15 }));
    addTurn(usage, "builder", "contract_reviewer", accountSdkUsage({ inputTokens: 8, outputTokens: 4, totalTokens: 12 }));
    addTurn(usage, "evaluator", "contract_reviewer", accountSdkUsage({ inputTokens: 8, outputTokens: 4, totalTokens: 12 }));
    addTurn(usage, "evaluator", "evaluator", accountSdkUsage({ inputTokens: 20, outputTokens: 10, totalTokens: 30 }));
    expect(usage.availability).toBe("measured");
    expect(usage.inputTokens).toBe(46);
    expect(usage.outputTokens).toBe(23);
    expect(usage.totalTokens).toBe(69);
    expect(usage.tokenLimitEnforced).toBe(true);
    expect(usage.turns).toHaveLength(4);
  });

  it("prints cache read/write fields so total tokens are explainable", () => {
    const usage = emptyAggregatedUsage();
    addTurn(
      usage,
      "planner",
      "planner",
      accountSdkUsage({
        inputTokens: 10,
        outputTokens: 5,
        totalTokens: 40,
        cacheReadTokens: 20,
        cacheWriteTokens: 5,
      }),
    );
    const lines = usageReportLines(usage).join("\n");
    expect(lines).toMatch(/Cache read tokens: 20/);
    expect(lines).toMatch(/Cache write tokens: 5/);
    expect(lines).toMatch(/Token identity:/);
  });

  it("records unknown instead of measured zero when SDK usage is unavailable", () => {
    const unknown = accountSdkUsage({ inputTokens: 0, outputTokens: 0, totalTokens: 0 });
    expect(unknown.availability).toBe("unknown");
    expect(unknown.inputTokens).toBeNull();
    expect(unknown.totalTokens).toBeNull();
    expect(unknown.tokenLimitEnforced).toBe(false);
    expect(unknown.tokenLimitStatus).toBe("unenforced_usage_unknown");
    const aggregated = emptyAggregatedUsage();
    addTurn(aggregated, "planner", "planner", unknown);
    addTurn(aggregated, "evaluator", "evaluator", unknown);
    expect(aggregated.availability).toBe("unknown");
    expect(usageReportLines(aggregated).join("\n")).not.toMatch(/Input tokens: 0/);
    expect(usageReportLines(aggregated).join("\n")).toMatch(/unknown/);
  });

  it("does not enforce the token cap when usage is unknown", () => {
    const budget = new RunBudget({
      maxDurationMs: 60_000,
      maxAgentRuns: 10,
      maxTotalTokens: 10,
      maxIterations: 1,
      maxContractRounds: 1,
    });
    budget.accountTurn("planner", "planner", accountSdkUsage(null));
    expect(() => budget.assert()).not.toThrow();
    expect(budget.usage.tokenLimitStatus).toBe("unenforced_usage_unknown");
  });

  it("marks mixed unknown and measured usage as partial and not fully enforced retrospectively", () => {
    const usage = emptyAggregatedUsage();
    addTurn(usage, "planner", "planner", accountSdkUsage(null));
    addTurn(
      usage,
      "evaluator",
      "evaluator",
      accountSdkUsage({ inputTokens: 10, outputTokens: 5, totalTokens: 15 }),
    );
    expect(usage.availability).toBe("partial");
    expect(usage.tokenLimitStatus).toBe("enforced_measured_only");
    expect(usage.totalTokens).toBe(15);
    expect(usageReportLines(usage).join("\n")).toMatch(/lower bound/i);
    expect(usageReportLines(usage).join("\n")).toMatch(/not fully enforced retrospectively/i);
  });
});
