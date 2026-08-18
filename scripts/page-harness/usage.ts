export type TokenUsage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  reasoningTokens?: number;
};

export type UsageAvailability = "measured" | "unknown";

export type TokenLimitStatus =
  | "enforced"
  | "enforced_measured_only"
  | "unenforced_usage_unknown";

export type UsageAccount = {
  availability: UsageAvailability;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  cacheReadTokens: number | null;
  cacheWriteTokens: number | null;
  reasoningTokens: number | null;
  tokenLimitEnforced: boolean;
  tokenLimitStatus: TokenLimitStatus;
  reason?: string;
};

export type UsageTurn = UsageAccount & {
  role: string;
  purpose: string;
};

export type AggregatedUsage = Omit<UsageAccount, "availability"> & {
  availability: "measured" | "unknown" | "partial";
  turns: UsageTurn[];
};

export function unknownUsage(reason: string): UsageAccount {
  return {
    availability: "unknown",
    inputTokens: null,
    outputTokens: null,
    totalTokens: null,
    cacheReadTokens: null,
    cacheWriteTokens: null,
    reasoningTokens: null,
    tokenLimitEnforced: false,
    tokenLimitStatus: "unenforced_usage_unknown",
    reason,
  };
}

export function accountSdkUsage(
  raw: Partial<TokenUsage> | null | undefined,
): UsageAccount {
  if (!raw) return unknownUsage("SDK did not report usage");
  const input = raw.inputTokens;
  const output = raw.outputTokens;
  const total = raw.totalTokens;
  if (input == null && output == null && total == null) {
    return unknownUsage("SDK did not report usage");
  }
  if ((input ?? 0) === 0 && (output ?? 0) === 0 && (total ?? 0) === 0) {
    return unknownUsage(
      "SDK reported zero tokens; treating as unavailable rather than measured zero",
    );
  }
  return {
    availability: "measured",
    inputTokens: input ?? 0,
    outputTokens: output ?? 0,
    totalTokens: total ?? (input ?? 0) + (output ?? 0),
    cacheReadTokens: raw.cacheReadTokens ?? null,
    cacheWriteTokens: raw.cacheWriteTokens ?? null,
    reasoningTokens: raw.reasoningTokens ?? null,
    tokenLimitEnforced: true,
    tokenLimitStatus: "enforced",
  };
}

export function emptyAggregatedUsage(): AggregatedUsage {
  return {
    ...unknownUsage("no SDK usage events observed"),
    availability: "unknown",
    turns: [],
  };
}

/** @deprecated Raw zeros are not measured usage. Prefer emptyAggregatedUsage/unknownUsage. */
export function emptyUsage(): TokenUsage {
  return { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
}

export function addUsage(into: TokenUsage, extra: TokenUsage): TokenUsage {
  into.inputTokens += extra.inputTokens;
  into.outputTokens += extra.outputTokens;
  into.totalTokens += extra.totalTokens;
  if (extra.cacheReadTokens) {
    into.cacheReadTokens = (into.cacheReadTokens ?? 0) + extra.cacheReadTokens;
  }
  if (extra.cacheWriteTokens) {
    into.cacheWriteTokens = (into.cacheWriteTokens ?? 0) + extra.cacheWriteTokens;
  }
  if (extra.reasoningTokens) {
    into.reasoningTokens = (into.reasoningTokens ?? 0) + extra.reasoningTokens;
  }
  return into;
}

export function addTurn(
  into: AggregatedUsage,
  role: string,
  purpose: string,
  account: UsageAccount,
): AggregatedUsage {
  into.turns.push({ ...account, role, purpose });
  recomputeAggregatedUsage(into);
  return into;
}

export function recomputeAggregatedUsage(into: AggregatedUsage): AggregatedUsage {
  const measured = into.turns.filter((turn) => turn.availability === "measured");
  const unknown = into.turns.filter((turn) => turn.availability === "unknown");
  if (measured.length === 0) {
    into.availability = "unknown";
    into.inputTokens = null;
    into.outputTokens = null;
    into.totalTokens = null;
    into.cacheReadTokens = null;
    into.cacheWriteTokens = null;
    into.reasoningTokens = null;
    into.tokenLimitEnforced = false;
    into.tokenLimitStatus = "unenforced_usage_unknown";
    into.reason = unknown[0]?.reason ?? "no measured SDK usage";
    return into;
  }
  into.availability = unknown.length > 0 ? "partial" : "measured";
  into.inputTokens = sumField(measured, "inputTokens");
  into.outputTokens = sumField(measured, "outputTokens");
  into.totalTokens = sumField(measured, "totalTokens");
  into.cacheReadTokens = sumField(measured, "cacheReadTokens");
  into.cacheWriteTokens = sumField(measured, "cacheWriteTokens");
  into.reasoningTokens = sumField(measured, "reasoningTokens");
  into.tokenLimitEnforced = true;
  into.tokenLimitStatus = unknown.length > 0 ? "enforced_measured_only" : "enforced";
  into.reason =
    unknown.length > 0
      ? `Total tokens are a lower bound from ${measured.length} measured turn(s); ${unknown.length} turn(s) from unknown attempt(s). The total-token limit was not fully enforced retrospectively.`
      : undefined;
  return into;
}

function sumField(
  turns: UsageTurn[],
  field: "inputTokens" | "outputTokens" | "totalTokens" | "cacheReadTokens" | "cacheWriteTokens" | "reasoningTokens",
): number {
  return turns.reduce((sum, turn) => sum + (turn[field] ?? 0), 0);
}

export function usageReportLines(usage: AggregatedUsage): string[] {
  if (usage.availability === "unknown") {
    return [
      `- Usage availability: **unknown** (not measured)`,
      `- Token-limit enforcement: **${usage.tokenLimitStatus}**`,
      `- Reason: ${usage.reason ?? "SDK usage was not available"}`,
      `- Agent turns recorded: ${usage.turns.length}`,
    ];
  }
  const unknownTurns = usage.turns.filter((turn) => turn.availability === "unknown").length;
  const partialNote =
    usage.availability === "partial"
      ? [
          `- Total tokens (lower bound): ${usage.totalTokens}`,
          `- Unknown turns: ${unknownTurns}`,
          `- Token-limit enforcement: **${usage.tokenLimitStatus}** (not fully enforced retrospectively)`,
        ]
      : [
          `- Total tokens: ${usage.totalTokens}`,
          `- Token-limit enforcement: **${usage.tokenLimitStatus}**`,
        ];
  return [
    `- Usage availability: **${usage.availability}**`,
    `- Input tokens: ${usage.inputTokens}`,
    `- Output tokens: ${usage.outputTokens}`,
    `- Cache read tokens: ${usage.cacheReadTokens ?? 0}`,
    `- Cache write tokens: ${usage.cacheWriteTokens ?? 0}`,
    `- Reasoning tokens: ${usage.reasoningTokens ?? 0}`,
    ...partialNote,
    `- Token identity: input+output=${(usage.inputTokens ?? 0) + (usage.outputTokens ?? 0)}; input+output+cacheRead+cacheWrite=${(usage.inputTokens ?? 0) + (usage.outputTokens ?? 0) + (usage.cacheReadTokens ?? 0) + (usage.cacheWriteTokens ?? 0)}; reported total=${usage.totalTokens}`,
    usage.reason ? `- Usage note: ${usage.reason}` : "",
    `- Agent turns recorded: ${usage.turns.length}`,
  ].filter(Boolean);
}
