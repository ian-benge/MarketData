import { describe, expect, it } from "vitest";
import { BudgetExceededError, RunBudget } from "./budget";

describe("budgets and cancellation", () => {
  it("stops when agent-run or token caps are crossed", () => {
    const budget = new RunBudget({
      maxDurationMs: 60_000,
      maxAgentRuns: 1,
      maxTotalTokens: 20,
      maxIterations: 1,
      maxContractRounds: 1,
    });
    budget.recordAgentRun();
    budget.assert();
    budget.recordAgentRun();
    expect(() => budget.assert()).toThrow(BudgetExceededError);
    const tokens = new RunBudget({
      maxDurationMs: 60_000,
      maxAgentRuns: 10,
      maxTotalTokens: 10,
      maxIterations: 1,
      maxContractRounds: 1,
    });
    tokens.addUsage({ inputTokens: 8, outputTokens: 8, totalTokens: 16 });
    expect(() => tokens.assert()).toThrow(/max-total-tokens/);
  });

  it("allows restoration-grace agent runs after the cap is already crossed", () => {
    const budget = new RunBudget({
      maxDurationMs: 60_000,
      maxAgentRuns: 1,
      maxTotalTokens: 1000,
      maxIterations: 1,
      maxContractRounds: 1,
    });
    budget.recordAgentRun();
    budget.assert();
    budget.recordAgentRun();
    expect(() => budget.assert()).toThrow(BudgetExceededError);
    budget.beginRestoration(1);
    budget.recordAgentRun();
    expect(() => budget.assert()).not.toThrow();
    budget.recordAgentRun();
    expect(() => budget.assert()).toThrow(BudgetExceededError);
  });
});
