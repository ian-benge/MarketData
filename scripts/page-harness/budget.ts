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
  completedWorkPersisted = false;
  constructor(
    readonly reason: string,
    readonly snapshot: BudgetSnapshot,
  ) {
    super(reason);
    this.name = "BudgetExceededError";
  }
}

export class BudgetExtensionError extends Error {
  readonly code = "BUDGET_EXTENSION_REJECTED";
  constructor(message: string) {
    super(message);
    this.name = "BudgetExtensionError";
  }
}

export type BudgetExtensionRecord = {
  at: string;
  reason: string;
  previous: {
    maxTotalTokens: number;
    maxDurationMinutes: number;
    maxAgentRuns: number;
    maxContractRounds: number;
  };
  next: {
    maxTotalTokens: number;
    maxDurationMinutes: number;
    maxAgentRuns: number;
    maxContractRounds: number;
  };
};

export class RunBudget {
  readonly startedAt: number;
  consumedActiveMs = 0;
  private activeStartedAt: number | null;
  agentRuns = 0;
  usage: AggregatedUsage = emptyAggregatedUsage();
  stopReason: string | null = null;
  restorationGraceRuns = 0;
  restorationRunCeiling: number | null = null;

  constructor(
    readonly limits: BudgetLimits,
    restored?: {
      startedAt?: number;
      consumedActiveMs?: number;
      agentRuns?: number;
      usage?: AggregatedUsage;
      paused?: boolean;
    },
  ) {
    this.startedAt = restored?.startedAt ?? Date.now();
    this.consumedActiveMs = restored?.consumedActiveMs ?? 0;
    this.agentRuns = restored?.agentRuns ?? 0;
    if (restored?.usage) this.usage = restored.usage;
    this.activeStartedAt = restored?.paused ? null : Date.now();
  }

  elapsedActiveMs(now = Date.now()): number {
    const live = this.activeStartedAt != null ? now - this.activeStartedAt : 0;
    return this.consumedActiveMs + live;
  }

  pause(now = Date.now()): void {
    if (this.activeStartedAt == null) return;
    this.consumedActiveMs += now - this.activeStartedAt;
    this.activeStartedAt = null;
  }

  resumeClock(now = Date.now()): void {
    if (this.activeStartedAt != null) return;
    this.activeStartedAt = now;
  }

  snapshot(now = Date.now()): BudgetSnapshot {
    return {
      startedAt: this.startedAt,
      elapsedMs: this.elapsedActiveMs(now),
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

  assertBeforeInvocation(): void {
    this.assert();
  }

  assertAfterInvocation(): void {
    const snap = this.snapshot();
    try {
      this.assert();
    } catch (error) {
      if (error instanceof BudgetExceededError) {
        error.completedWorkPersisted = true;
      }
      throw error;
    }
    void snap;
  }

  extendLimits(input: {
    maxTotalTokens?: number;
    maxDurationMinutes?: number;
    maxAgentRuns?: number;
    maxContractRounds?: number;
    reason: string;
    at?: string;
  }): BudgetExtensionRecord {
    const previous = {
      maxTotalTokens: this.limits.maxTotalTokens,
      maxDurationMinutes: Math.round(this.limits.maxDurationMs / 60_000),
      maxAgentRuns: this.limits.maxAgentRuns,
      maxContractRounds: this.limits.maxContractRounds,
    };
    const next = {
      maxTotalTokens: input.maxTotalTokens ?? previous.maxTotalTokens,
      maxDurationMinutes: input.maxDurationMinutes ?? previous.maxDurationMinutes,
      maxAgentRuns: input.maxAgentRuns ?? previous.maxAgentRuns,
      maxContractRounds: input.maxContractRounds ?? previous.maxContractRounds,
    };
    const increased =
      next.maxTotalTokens > previous.maxTotalTokens ||
      next.maxDurationMinutes > previous.maxDurationMinutes ||
      next.maxAgentRuns > previous.maxAgentRuns ||
      next.maxContractRounds > previous.maxContractRounds;
    if (!increased) {
      throw new BudgetExtensionError(
        `Budget extension rejected: limits must strictly increase (tokens ${previous.maxTotalTokens}→${next.maxTotalTokens}, minutes ${previous.maxDurationMinutes}→${next.maxDurationMinutes}, agentRuns ${previous.maxAgentRuns}→${next.maxAgentRuns}, contractRounds ${previous.maxContractRounds}→${next.maxContractRounds}). Consumed totals were not reset.`,
      );
    }
    if (next.maxTotalTokens < previous.maxTotalTokens) {
      throw new BudgetExtensionError("max-total-tokens may only increase.");
    }
    if (next.maxDurationMinutes < previous.maxDurationMinutes) {
      throw new BudgetExtensionError("max-minutes may only increase.");
    }
    if (next.maxAgentRuns < previous.maxAgentRuns) {
      throw new BudgetExtensionError("max-agent-runs may only increase.");
    }
    if (next.maxContractRounds < previous.maxContractRounds) {
      throw new BudgetExtensionError("max-contract-rounds may only increase.");
    }
    this.limits.maxTotalTokens = next.maxTotalTokens;
    this.limits.maxDurationMs = next.maxDurationMinutes * 60_000;
    this.limits.maxAgentRuns = next.maxAgentRuns;
    this.limits.maxContractRounds = next.maxContractRounds;
    this.stopReason = null;
    return {
      at: input.at ?? new Date().toISOString(),
      reason: input.reason,
      previous,
      next,
    };
  }

  remainingExtensionHint(): {
    tokens: { consumed: number | null; limit: number; minNext: number | null };
    minutes: { consumedMs: number; limitMs: number; minNextMinutes: number };
    agentRuns: { consumed: number; limit: number; minNext: number };
  } {
    const consumedTokens = this.usage.totalTokens;
    return {
      tokens: {
        consumed: consumedTokens,
        limit: this.limits.maxTotalTokens,
        minNext:
          consumedTokens != null && consumedTokens >= this.limits.maxTotalTokens
            ? consumedTokens + 1
            : null,
      },
      minutes: {
        consumedMs: this.elapsedActiveMs(),
        limitMs: this.limits.maxDurationMs,
        minNextMinutes:
          this.elapsedActiveMs() >= this.limits.maxDurationMs
            ? Math.ceil(this.elapsedActiveMs() / 60_000) + 1
            : Math.round(this.limits.maxDurationMs / 60_000),
      },
      agentRuns: {
        consumed: this.agentRuns,
        limit: this.limits.maxAgentRuns,
        minNext: this.agentRuns >= this.limits.maxAgentRuns ? this.agentRuns + 1 : this.limits.maxAgentRuns,
      },
    };
  }
}
