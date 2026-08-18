import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import {
  addTurn,
  recomputeAggregatedUsage,
  unknownUsage,
  type AggregatedUsage,
} from "./usage";

export type InvocationStatus = "completed" | "failed";

export type InvocationRecord = {
  attempt: number;
  role: string;
  purpose: string;
  runId: string | null;
  agentId: string | null;
  status: InvocationStatus;
};

export type InvocationLedger = {
  total: number;
  completed: number;
  failed: number;
  unknownAttemptCount: number;
  byRole: Record<string, number>;
  byPurpose: Record<string, number>;
  byAttempt: Record<string, number>;
  invocations: InvocationRecord[];
};

export function parseHarnessLogInvocations(logText: string): InvocationRecord[] {
  const invocations: InvocationRecord[] = [];
  let attempt = 0;
  let pending: { role: string; purpose: string; agentId: string } | null = null;
  for (const line of logText.split(/\r?\n/)) {
    if (/requested=enabled/.test(line)) {
      attempt += 1;
    }
    const agent = line.match(
      /\b(planner|builder|evaluator|skeptic)\/(\w+) agent=(agent-\S+)/,
    );
    if (agent) {
      pending = { role: agent[1]!, purpose: agent[2]!, agentId: agent[3]! };
    }
    const run = line.match(/\b(planner|builder|evaluator|skeptic) run=(run-\S+)/);
    if (run) {
      invocations.push({
        attempt: Math.max(attempt, 1),
        role: pending?.role ?? run[1]!,
        purpose: pending?.purpose ?? run[1]!,
        runId: run[2]!,
        agentId: pending?.agentId ?? null,
        status: "completed",
      });
    }
    const failed = line.match(
      /ERROR (planner|builder|evaluator|skeptic) run failed \((run-[^)]+)\)/i,
    );
    if (failed) {
      const runId = failed[2]!;
      const existing = [...invocations]
        .reverse()
        .find((row) => row.runId === runId);
      if (existing) existing.status = "failed";
      else {
        invocations.push({
          attempt: Math.max(attempt, 1),
          role: failed[1]!,
          purpose: pending?.purpose ?? failed[1]!,
          runId,
          agentId: pending?.agentId ?? null,
          status: "failed",
        });
      }
    }
  }
  return invocations;
}

export function summarizeInvocations(invocations: InvocationRecord[]): InvocationLedger {
  const byRole: Record<string, number> = {};
  const byPurpose: Record<string, number> = {};
  const byAttempt: Record<string, number> = {};
  let completed = 0;
  let failed = 0;
  for (const row of invocations) {
    byRole[row.role] = (byRole[row.role] ?? 0) + 1;
    byPurpose[row.purpose] = (byPurpose[row.purpose] ?? 0) + 1;
    const attemptKey = String(row.attempt);
    byAttempt[attemptKey] = (byAttempt[attemptKey] ?? 0) + 1;
    if (row.status === "failed") failed += 1;
    else completed += 1;
  }
  return {
    total: invocations.length,
    completed,
    failed,
    unknownAttemptCount: 0,
    byRole,
    byPurpose,
    byAttempt,
    invocations,
  };
}

export function buildInvocationLedger(options: {
  runRoot: string;
  usage?: AggregatedUsage | null;
}): InvocationLedger {
  const logFile = path.join(options.runRoot, "log.txt");
  const fromLog = existsSync(logFile)
    ? parseHarnessLogInvocations(readFileSync(logFile, "utf8"))
    : [];
  const fromRoles = roleFileInvocations(options.runRoot);
  const merged = mergeInvocationSources(fromLog, fromRoles);
  const ledger = summarizeInvocations(merged);
  if (options.usage) {
    alignUsageWithInvocations(options.usage, ledger);
    ledger.unknownAttemptCount = countUnknownAttempts(options.usage, ledger);
  }
  return ledger;
}

export function alignUsageWithInvocations(
  usage: AggregatedUsage,
  ledger: InvocationLedger,
): AggregatedUsage {
  const missing = Math.max(0, ledger.total - usage.turns.length);
  if (missing === 0) {
    recomputeAggregatedUsage(usage);
    return usage;
  }
  const unmatched = ledger.invocations.slice(0, missing);
  const placeholders = unmatched.map((row) => ({
    ...unknownUsage(`attempt ${row.attempt} usage unknown`),
    role: row.role,
    purpose: row.purpose,
  }));
  usage.turns = [...placeholders, ...usage.turns];
  recomputeAggregatedUsage(usage);
  return usage;
}

export function invocationReportLines(ledger: InvocationLedger): string[] {
  const byRole = Object.entries(ledger.byRole)
    .map(([role, count]) => `${role}=${count}`)
    .join(", ");
  const byAttempt = Object.entries(ledger.byAttempt)
    .map(([attempt, count]) => `attempt ${attempt}=${count}`)
    .join(", ");
  return [
    `- Agent invocations (all attempts): **${ledger.total}** total, **${ledger.completed}** completed, **${ledger.failed}** failed`,
    `- Invocations by role: ${byRole || "none"}`,
    `- Invocations by attempt: ${byAttempt || "none"}`,
  ];
}

function roleFileInvocations(runRoot: string): InvocationRecord[] {
  const dir = path.join(runRoot, "artifacts", "roles");
  if (!existsSync(dir)) return [];
  const rows: InvocationRecord[] = [];
  for (const name of readdirSync(dir)) {
    const match = name.match(/^(planner|contract_reviewer|evaluator|skeptic|builder)-(run-\S+)\.md$/);
    if (!match) continue;
    const purpose = match[1]!;
    const role =
      purpose === "contract_reviewer"
        ? "builder"
        : purpose === "planner"
          ? "planner"
          : purpose === "skeptic"
            ? "skeptic"
            : "evaluator";
    rows.push({
      attempt: 0,
      role,
      purpose,
      runId: match[2]!,
      agentId: null,
      status: "completed",
    });
  }
  return rows;
}

function mergeInvocationSources(
  fromLog: InvocationRecord[],
  fromRoles: InvocationRecord[],
): InvocationRecord[] {
  if (fromLog.length === 0) return fromRoles;
  const byRun = new Set(fromLog.map((row) => row.runId).filter(Boolean));
  const extra = fromRoles.filter((row) => row.runId && !byRun.has(row.runId));
  return [...fromLog, ...extra];
}

function countUnknownAttempts(usage: AggregatedUsage, ledger: InvocationLedger): number {
  const unknownTurns = usage.turns.filter((turn) => turn.availability === "unknown").length;
  if (unknownTurns === 0) return 0;
  const attempts = new Set(
    ledger.invocations.slice(0, unknownTurns).map((row) => row.attempt),
  );
  return attempts.size || 1;
}
