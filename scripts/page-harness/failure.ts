export const FAILURE_CATEGORIES = [
  "infrastructure",
  "retryable_network",
  "retryable_process",
  "retryable_server",
  "budget_exhausted",
  "permission",
  "provenance",
  "corrupted_artifact",
  "contract_exhausted",
  "security_policy",
  "incompatible_worktree",
  "application_edit",
  "unknown_fatal",
] as const;

export type FailureCategory = (typeof FAILURE_CATEGORIES)[number];

export type ClassifiedFailure = {
  category: FailureCategory;
  retryable: boolean;
  message: string;
};

export class InfrastructureFailure extends Error {
  readonly code = "INFRASTRUCTURE";
  readonly category = "infrastructure" as const;
  constructor(message: string) {
    super(message);
    this.name = "InfrastructureFailure";
  }
}

const RETRYABLE_NETWORK =
  /connection failed|econnreset|etimedout|enotfound|enetunreach|socket hang up|fetch failed|network|disconnected|und_err_|econnaborted|ehostunreach|temporarily unavailable/i;

const RETRYABLE_PROCESS =
  /sigterm|sigkill|killed|process terminated|uv_handle_closing|ePIPE|broken pipe|stdin.*end/i;

const INFRASTRUCTURE =
  /econnrefused|err_connection_refused|timed out waiting for demo server|does not match harness origin|server-readiness|infrastructure failure|base-url mismatch/i;

const RETRYABLE_ROLE = /required skeptic is missing|skeptic did not produce/i;

const RETRYABLE_SERVER =
  /\b(502|503|504)\b|service unavailable|gateway timeout|recoverable server/i;

const PERMISSION =
  /permission|not authorised|not authorized|401|403|access denied|denied by (project )?hooks|api key|unauthor/i;

const PROVENANCE =
  /provenance|fingerprint mismatch|aliased baseline|requested route|not verified/i;

const CORRUPTED =
  /corrupted|invalid json|unexpected end of json|parseartifact|parse failed|schema/i;

const BUDGET_EXHAUSTED =
  /max-total-tokens exceeded|max-minutes exceeded|max-agent-runs exceeded|budget_exhausted|budget exceeded/i;

const CONTRACT_EXHAUSTED =
  /did not accept the same canonical contract hash|contract-exhausted|contract_exhausted|max-contract-rounds|refusing to (edit|BUILD)|unresolved normative/i;

const SECURITY =
  /sandbox required|security-policy|hooks.*fail|mutating tools blocked|PAGE_HARNESS/i;

const WORKTREE =
  /worktree .* (gone|missing)|cannot resume: worktree|sha mismatch|incompatible source/i;

const APP_EDIT =
  /application edit|worktree is dirty|unexpected source change/i;

export function isRetryableCategory(category: FailureCategory): boolean {
  return (
    category === "infrastructure" ||
    category === "retryable_network" ||
    category === "retryable_process" ||
    category === "retryable_server" ||
    category === "budget_exhausted"
  );
}

export function classifyFailure(message: string): ClassifiedFailure {
  const text = message.trim() || "unknown failure";
  const category = categoryOf(text);
  return {
    category,
    retryable: isRetryableCategory(category),
    message: text,
  };
}

function categoryOf(text: string): FailureCategory {
  if (BUDGET_EXHAUSTED.test(text)) return "budget_exhausted";
  if (CONTRACT_EXHAUSTED.test(text)) return "contract_exhausted";
  if (WORKTREE.test(text)) return "incompatible_worktree";
  if (APP_EDIT.test(text)) return "application_edit";
  if (PROVENANCE.test(text)) return "provenance";
  if (CORRUPTED.test(text)) return "corrupted_artifact";
  if (SECURITY.test(text) && !RETRYABLE_NETWORK.test(text)) return "security_policy";
  if (PERMISSION.test(text) && !RETRYABLE_NETWORK.test(text)) return "permission";
  if (INFRASTRUCTURE.test(text)) return "infrastructure";
  if (RETRYABLE_ROLE.test(text)) return "retryable_process";
  if (RETRYABLE_PROCESS.test(text)) return "retryable_process";
  if (RETRYABLE_SERVER.test(text)) return "retryable_server";
  if (RETRYABLE_NETWORK.test(text)) return "retryable_network";
  return "unknown_fatal";
}
