import {
  accountSdkUsage,
  emptyAggregatedUsage,
  addTurn,
  type AggregatedUsage,
  type TokenUsage,
  type UsageAccount,
} from "./usage";

export type BudgetLimits = {
  maxDurationMs: number;
  maxAgentRuns: number;
  maxTotalTokens: number;
  maxIterations: number;
  maxContractRounds: number;
};

export type BudgetSnapshot = {
  startedAt: number;
  elapsedMs: number;
  agentRuns: number;
  usage: AggregatedUsage;
  stopReason: string | null;
  tokenLimitStatus: AggregatedUsage["tokenLimitStatus"];
};

export class BudgetExceededError extends Error {
  readonly code = "BUDGET_EXCEEDED";
  constructor(
    readonly reason: string,
    readonly snapshot: BudgetSnapshot,
  ) {
    super(reason);
    this.name = "BudgetExceededError";
  }
}

export class RunBudget {
  readonly startedAt = Date.now();
  agentRuns = 0;
  usage: AggregatedUsage = emptyAggregatedUsage();
  stopReason: string | null = null;
  restorationGraceRuns = 0;
  restorationRunCeiling: number | null = null;

  constructor(readonly limits: BudgetLimits) {}

  snapshot(): BudgetSnapshot {
    return {
      startedAt: this.startedAt,
      elapsedMs: Date.now() - this.startedAt,
      agentRuns: this.agentRuns,
      usage: {
        ...this.usage,
        turns: [...this.usage.turns],
      },
      stopReason: this.stopReason,
      tokenLimitStatus: this.usage.tokenLimitStatus,
    };
  }

  addUsage(usage: TokenUsage): void {
    this.accountTurn("unknown", "unknown", accountSdkUsage(usage));
  }

  accountTurn(role: string, purpose: string, account: UsageAccount): void {
    addTurn(this.usage, role, purpose, account);
  }

  recordAgentRun(): void {
    this.agentRuns += 1;
  }

  beginRestoration(extraAgentRuns: number): void {
    this.restorationGraceRuns = Math.max(0, extraAgentRuns);
    this.restorationRunCeiling = this.agentRuns + this.restorationGraceRuns;
  }

  assert(): void {
    const snap = this.snapshot();
    if (snap.elapsedMs > this.limits.maxDurationMs) {
      this.stopReason = `max-minutes exceeded (${Math.round(snap.elapsedMs / 1000)}s)`;
      throw new BudgetExceededError(this.stopReason, snap);
    }
    const allowedRuns =
      this.restorationRunCeiling ?? this.limits.maxAgentRuns;
    if (this.agentRuns > allowedRuns) {
      this.stopReason = `max-agent-runs exceeded (${this.agentRuns} > ${this.limits.maxAgentRuns})`;
      throw new BudgetExceededError(this.stopReason, snap);
    }
    if (
      this.usage.tokenLimitEnforced &&
      this.usage.totalTokens != null &&
      this.usage.totalTokens > this.limits.maxTotalTokens
    ) {
      this.stopReason = `max-total-tokens exceeded (${this.usage.totalTokens} > ${this.limits.maxTotalTokens})`;
      throw new BudgetExceededError(this.stopReason, snap);
    }
  }

  wouldExceedTokens(additional: number): boolean {
    if (!this.usage.tokenLimitEnforced || this.usage.totalTokens == null) return false;
    return this.usage.totalTokens + additional > this.limits.maxTotalTokens;
  }
}
