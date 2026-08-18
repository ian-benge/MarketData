import type { IsolatedWorkspace } from "./isolation";
import type { PageRole } from "./catalog";

export type RiskLevel = "low" | "medium" | "critical";

export type HarnessRequest = {
  route: string;
  objective: string;
  /** Exact CLI/file objective, or null when the caller omitted one. Never a silent default. */
  suppliedObjective: string | null;
  auditOnly: boolean;
  skeptic: boolean;
  maxIterations: number;
  maxDurationMinutes: number;
  maxContractRounds: number;
  maxAgentRuns: number;
  maxTotalTokens: number;
  inspectRole: PageRole;
  risk: RiskLevel;
  fromAudit: string | null;
  resumeRunId: string | null;
  allowNoSandbox: boolean;
};

export type HarnessResultStatus =
  | "passed"
  | "failed"
  | "audit_complete"
  | "cancelled"
  | "stopped";

export type ContractResult = "passed" | "failed" | "not_evaluated";

export type IsolationSnapshot = Pick<
  IsolatedWorkspace,
  "mode" | "repoRoot" | "agentCwd" | "branchName" | "worktreePath" | "created"
> & { baseSha?: string | null };
