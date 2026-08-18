import { HARNESS_DEFAULTS } from "./catalog";
import type { EvidenceMeta, ProvenanceManifest } from "./evidence";
import { isEvidenceFresh, isLockedContractHash } from "./evidence";
import type { InspectReport } from "./inspect";
import type {
  ContractResult,
  HarnessRequest,
  HarnessResultStatus,
  RiskLevel,
} from "./request";
import type { EvaluationCompleteness } from "./schemas";
import type { AggregatedUsage } from "./usage";
import type { VerifyResult } from "./verify";
import { classifyVerifyResults, targetRouteVisitedInOutput, verifyHasInfrastructureFailure } from "./verify";

/**
 * Single source of truth for harness invariants. CLI, orchestrator, evaluator
 * scoring, reporter, and audit reuse must import these helpers instead of
 * re-implementing them.
 */

export class CriticalSkepticRequiredError extends Error {
  readonly code = "CRITICAL_SKEPTIC_REQUIRED";
  constructor() {
    super(
      "Critical improvement runs require a skeptic. --no-skeptic is refused unless a separately documented policy explicitly prevents skeptic execution.",
    );
    this.name = "CriticalSkepticRequiredError";
  }
}

export type RiskPolicy = {
  risk: RiskLevel;
  requireSkeptic: boolean;
  allowDisableSkeptic: boolean;
  requireAdjacentRegression: boolean;
  requireTargetRouteVerification: boolean;
  playwrightTimeoutMs: number;
  inspectSamples: number;
  inspectViewports: "baseline" | "full";
  unrelatedSuiteBlocksPass: boolean;
  restorationAgentGrace: number;
};

const RISK_POLICY_BY_LEVEL: Record<RiskLevel, Omit<RiskPolicy, "risk">> = {
  low: {
    requireSkeptic: false,
    allowDisableSkeptic: true,
    requireAdjacentRegression: false,
    requireTargetRouteVerification: true,
    playwrightTimeoutMs: 60_000,
    inspectSamples: 3,
    inspectViewports: "baseline",
    unrelatedSuiteBlocksPass: false,
    restorationAgentGrace: 1,
  },
  medium: {
    requireSkeptic: false,
    allowDisableSkeptic: true,
    requireAdjacentRegression: true,
    requireTargetRouteVerification: true,
    playwrightTimeoutMs: 120_000,
    inspectSamples: 3,
    inspectViewports: "full",
    unrelatedSuiteBlocksPass: false,
    restorationAgentGrace: 1,
  },
  critical: {
    requireSkeptic: true,
    allowDisableSkeptic: false,
    requireAdjacentRegression: true,
    requireTargetRouteVerification: true,
    playwrightTimeoutMs: 180_000,
    inspectSamples: 5,
    inspectViewports: "full",
    unrelatedSuiteBlocksPass: false,
    restorationAgentGrace: 2,
  },
};

export function parseRiskLevel(
  value: string | undefined,
  catalogCritical: boolean,
): RiskLevel {
  if (value === "low" || value === "medium" || value === "critical") return value;
  return catalogCritical ? "critical" : HARNESS_DEFAULTS.risk;
}

export function resolveRiskPolicy(risk: RiskLevel): RiskPolicy {
  return { risk, ...RISK_POLICY_BY_LEVEL[risk] };
}

export function defaultObjectiveFor(route: string, title?: string | null): string {
  return `Improve ${title ?? route} for traders without shallow or disconnected work.`;
}

export function resolveSkeptic(input: {
  risk: RiskLevel;
  auditOnly: boolean;
  requestedSkeptic?: boolean;
  noSkeptic?: boolean;
}): { skeptic: boolean; reason: string } {
  const policy = resolveRiskPolicy(input.risk);
  if (input.noSkeptic) {
    if (!policy.allowDisableSkeptic || policy.requireSkeptic) {
      throw new CriticalSkepticRequiredError();
    }
    return { skeptic: false, reason: "--no-skeptic" };
  }
  if (input.requestedSkeptic === true) {
    return { skeptic: true, reason: "--skeptic" };
  }
  if (input.requestedSkeptic === false) {
    if (!policy.allowDisableSkeptic || policy.requireSkeptic) {
      throw new CriticalSkepticRequiredError();
    }
    return { skeptic: false, reason: "skeptic flag false" };
  }
  return {
    skeptic: policy.requireSkeptic,
    reason: policy.requireSkeptic
      ? "critical risk requires skeptic"
      : "optional for this risk level",
  };
}

export function effectiveHarnessRequest(request: HarnessRequest): HarnessRequest {
  const resolved = resolveSkeptic({
    risk: request.risk,
    auditOnly: request.auditOnly,
    requestedSkeptic: request.skeptic === true ? true : undefined,
  });
  return { ...request, skeptic: resolved.skeptic };
}

export function skepticIsRequired(request: {
  risk: RiskLevel;
  auditOnly: boolean;
  skeptic: boolean;
}): boolean {
  return resolveSkeptic({
    risk: request.risk,
    auditOnly: request.auditOnly,
    requestedSkeptic: request.skeptic === true ? true : undefined,
  }).skeptic;
}

export function buildHarnessRequest(input: {
  route: string;
  pageTitle?: string | null;
  pageCritical: boolean;
  suppliedObjective: string | null;
  auditOnly: boolean;
  skeptic?: boolean;
  noSkeptic?: boolean;
  risk?: string;
  maxIterations: number;
  maxDurationMinutes: number;
  maxContractRounds: number;
  maxAgentRuns: number;
  maxTotalTokens: number;
  inspectRole: HarnessRequest["inspectRole"];
  fromAudit: string | null;
  resumeRunId: string | null;
  allowNoSandbox: boolean;
}): HarnessRequest {
  const risk = parseRiskLevel(input.risk, input.pageCritical);
  const objective =
    input.suppliedObjective ?? defaultObjectiveFor(input.route, input.pageTitle);
  const skeptic = resolveSkeptic({
    risk,
    auditOnly: input.auditOnly,
    requestedSkeptic: input.skeptic,
    noSkeptic: input.noSkeptic,
  });
  return {
    route: input.route,
    objective,
    suppliedObjective: input.suppliedObjective,
    auditOnly: input.auditOnly,
    skeptic: skeptic.skeptic,
    maxIterations: input.maxIterations,
    maxDurationMinutes: input.maxDurationMinutes,
    maxContractRounds: input.maxContractRounds,
    maxAgentRuns: input.maxAgentRuns,
    maxTotalTokens: input.maxTotalTokens,
    inspectRole: input.inspectRole,
    risk,
    fromAudit: input.fromAudit,
    resumeRunId: input.resumeRunId,
    allowNoSandbox: input.allowNoSandbox,
  };
}

export type AfterEvidence =
  | { status: "collected"; report: InspectReport; source?: "final" | "checkpoint" }
  | {
      status: "unavailable";
      reason: "audit_only" | "not_collected" | "inspect_after_missing";
    };

export function auditAfterEvidence(): AfterEvidence {
  return { status: "unavailable", reason: "audit_only" };
}

export function collectedAfterEvidence(
  report: InspectReport,
  source: "final" | "checkpoint" = "final",
): AfterEvidence {
  return { status: "collected", report, source };
}

export function missingAfterEvidence(
  reason: "audit_only" | "not_collected" | "inspect_after_missing" = "not_collected",
): AfterEvidence {
  return { status: "unavailable", reason };
}

export function afterInspectReportLine(after: AfterEvidence, before: InspectReport): string {
  if (after.status !== "collected") {
    return `- After inspect: **unavailable** (${after.reason.replace(/_/g, " ")}; inspect/after was not collected and baseline numbers are not copied)`;
  }
  if (after.report === before) {
    return `- After inspect: **unavailable** (refusing to alias baseline measurements into after fields)`;
  }
  const source =
    after.source === "checkpoint"
      ? " (from passing checkpoint; not re-collected after cancel)"
      : "";
  return `- After inspect${source}: console errors ${after.report.consoleErrors.length}, transfer ${after.report.transferKb}kb, navigation median ${after.report.navigationMsMedian ?? after.report.navigationMs}ms`;
}

export function deriveContractResult(input: {
  evaluation: { allRequiredPassed: boolean } | null;
  completeness: EvaluationCompleteness | null;
  targetRouteVerified: boolean;
}): ContractResult {
  if (!input.evaluation || !input.completeness) return "not_evaluated";
  const structural =
    input.completeness.failed.length > 0 ||
    input.completeness.missing.length > 0 ||
    input.completeness.noEvidence.length > 0 ||
    input.completeness.illegalNotApplicable.length > 0 ||
    input.completeness.unprovenConditional.length > 0 ||
    input.completeness.ineligibleEvidence.length > 0;
  if (!input.targetRouteVerified) return "failed";
  if (input.evaluation.allRequiredPassed && !structural) return "passed";
  return "failed";
}

export function runVerdict(input: {
  processStatus: HarnessResultStatus;
  contractResult: ContractResult;
}): { processStatus: HarnessResultStatus; contractResult: ContractResult } {
  return input;
}

export function targetRouteInspectOk(input: {
  requestedRoute: string;
  inspect: Pick<InspectReport, "routeVerified" | "finalPathname" | "finalUrl" | "auth"> | null;
  expectedOrigin: string;
}): { ok: boolean; reason?: string } {
  if (!input.inspect) return { ok: false, reason: "missing inspect report" };
  if (!input.inspect.routeVerified) {
    return { ok: false, reason: "inspect.routeVerified is false" };
  }
  const requested = input.requestedRoute.split("?")[0] || "/";
  const pathname = input.inspect.finalPathname || pathnameOf(input.inspect.finalUrl);
  if (pathname !== requested && !pathname.startsWith(`${requested}/`)) {
    return { ok: false, reason: `inspect finished at ${pathname}, not ${requested}` };
  }
  try {
    const origin = new URL(input.inspect.finalUrl).origin;
    const expected = new URL(input.expectedOrigin).origin;
    if (origin !== expected) {
      return { ok: false, reason: `inspect origin ${origin} != ${expected}` };
    }
  } catch {
    return { ok: false, reason: "inspect finalUrl is not a valid URL" };
  }
  return { ok: true };
}

function pathnameOf(url: string): string {
  try {
    return new URL(url).pathname || "/";
  } catch {
    return url.split("?")[0] || "/";
  }
}

export function mergeTargetVerification(input: {
  requestedRoute: string;
  inspect: InspectReport | null;
  expectedOrigin: string;
  verify: VerifyResult[];
}): {
  results: VerifyResult[];
  targetOk: boolean;
  targetVisited: boolean;
  unrelatedFailures: VerifyResult[];
  infrastructureFailed: boolean;
} {
  const inspectCheck = targetRouteInspectOk({
    requestedRoute: input.requestedRoute,
    inspect: input.inspect,
    expectedOrigin: input.expectedOrigin,
  });
  const inspectResult: VerifyResult = {
    name: "target-route-inspect",
    ok: inspectCheck.ok,
    output: inspectCheck.ok
      ? `authenticated local origin and route ${input.requestedRoute}`
      : inspectCheck.reason ?? "target route not verified",
    page: input.requestedRoute,
    scope: "target",
    kind: "product",
    targetRouteVisited: inspectCheck.ok,
    visitedRoutes: input.inspect ? [input.inspect.finalPathname] : [],
  };
  const results = [inspectResult, ...input.verify];
  const classified = classifyVerifyResults({
    requestedRoute: input.requestedRoute,
    results,
  });
  const infrastructureFailed =
    classified.infrastructureFailed || verifyHasInfrastructureFailure(results);
  return {
    results,
    targetOk: infrastructureFailed ? false : classified.targetOk,
    targetVisited: classified.targetVisited,
    unrelatedFailures: classified.unrelatedFailures,
    infrastructureFailed,
  };
}

export function verificationCannotSubstituteTarget(input: {
  requestedRoute: string;
  verify: VerifyResult[];
}): boolean {
  const classified = classifyVerifyResults({
    requestedRoute: input.requestedRoute,
    results: input.verify,
  });
  const unrelatedFailed = classified.unrelatedFailures.length > 0;
  const targetVisitedViaUnrelated = input.verify.some(
    (row) =>
      row.scope === "unrelated" &&
      !row.ok &&
      targetRouteVisitedInOutput(row.output, input.requestedRoute),
  );
  return unrelatedFailed && !classified.targetVisited && !targetVisitedViaUnrelated
    ? true
    : !classified.targetOk;
}

export type ReuseValidityInput = {
  processStatus?: HarnessResultStatus | string | null;
  contractResult?: ContractResult | string | null;
  reusableFlag?: boolean | null;
  auditOnly?: boolean;
  contractLocked?: boolean;
  stopReason?: string | null;
  fatal?: boolean;
  invalidBaseline?: boolean;
  fingerprint?: {
    route: string;
    objective: string;
    suppliedObjective?: string | null;
    baseSha: string | null;
    contractHash: string;
    inspectRole: string;
  } | null;
  current?: {
    route: string;
    objective: string;
    suppliedObjective: string | null;
    baseSha: string | null;
    inspectRole: string;
  } | null;
  provenance?: ProvenanceManifest | null;
  baselineInspectMeta?: EvidenceMeta | null;
  baselineInspectPath?: string;
  targetRouteVerified?: boolean;
  targetVerificationExecuted?: boolean;
  infrastructureTargetFailure?: boolean;
  skepticRequired?: boolean;
  skepticCompleted?: boolean;
  afterAliasedFromBaseline?: boolean;
  usage?: AggregatedUsage | null;
};

export function assessAuditReuseValidity(
  input: ReuseValidityInput,
): { ok: true } | { ok: false; reason: string } {
  if (input.fatal || input.reusableFlag === false) {
    return { ok: false, reason: "audit is not reusable (failed or incomplete)." };
  }
  if (input.invalidBaseline) {
    return { ok: false, reason: "audit recorded invalid baseline diagnostics." };
  }
  if (input.auditOnly === false) {
    return { ok: false, reason: "source run is not a read-only audit." };
  }
  if (input.stopReason) {
    return { ok: false, reason: `audit stopped: ${input.stopReason}.` };
  }
  const fingerprint = input.fingerprint;
  const current = input.current;
  if (!fingerprint) {
    return { ok: false, reason: "audit is missing fingerprint." };
  }
  if (current) {
    if (fingerprint.route !== current.route) {
      return { ok: false, reason: "from-audit fingerprint mismatch (route)." };
    }
    const previousObjective = fingerprint.suppliedObjective ?? fingerprint.objective;
    const currentObjective = current.suppliedObjective ?? current.objective;
    if (previousObjective !== currentObjective || fingerprint.objective !== current.objective) {
      return { ok: false, reason: "from-audit fingerprint mismatch (objective)." };
    }
    if (fingerprint.baseSha !== current.baseSha) {
      return { ok: false, reason: "from-audit fingerprint mismatch (base SHA)." };
    }
    if (fingerprint.inspectRole !== current.inspectRole) {
      return { ok: false, reason: "from-audit fingerprint mismatch (inspect role)." };
    }
  }
  if (!input.contractLocked) {
    return { ok: false, reason: "audit did not lock a contract." };
  }
  if (input.processStatus && input.processStatus !== "audit_complete") {
    return { ok: false, reason: `audit process status is ${input.processStatus}, not audit_complete.` };
  }
  if (input.infrastructureTargetFailure) {
    return {
      ok: false,
      reason: "target verification failed for infrastructure reasons; not reusable.",
    };
  }
  if (input.targetVerificationExecuted === false) {
    return {
      ok: false,
      reason: "required target verification never executed; not reusable.",
    };
  }
  if (input.skepticRequired && !input.skepticCompleted) {
    return {
      ok: false,
      reason: "required skeptic is missing; not reusable.",
    };
  }
  if (input.afterAliasedFromBaseline) {
    return {
      ok: false,
      reason: "audit after-evidence aliased baseline measurements; not reusable.",
    };
  }
  if (input.targetRouteVerified !== true) {
    return {
      ok: false,
      reason: "audit did not verify the requested route; not reusable.",
    };
  }
  if (!isLockedContractHash(fingerprint.contractHash)) {
    return { ok: false, reason: "audit fingerprint contract hash is not locked." };
  }
  if (!input.provenance) {
    return {
      ok: false,
      reason: "audit is missing a validated provenance manifest for pre-lock evidence.",
    };
  }
  if (!input.baselineInspectMeta) {
    return { ok: false, reason: "audit is missing baseline inspect metadata." };
  }
  const freshness = isEvidenceFresh({
    meta: input.baselineInspectMeta,
    runId: input.baselineInspectMeta.runId,
    route: fingerprint.route,
    contractHash: fingerprint.contractHash,
    iteration: 0,
    provenance: input.provenance,
    inspectFilePath: input.baselineInspectPath,
    phase: "audit",
  });
  if (!freshness.ok) {
    return {
      ok: false,
      reason: `audit baseline evidence is not eligible: ${freshness.reason}`,
    };
  }
  return { ok: true };
}

export function evaluatedWorktreeSha(input: {
  evaluatedSha: string | null | undefined;
  baseSha: string | null | undefined;
}): string {
  return input.evaluatedSha || input.baseSha || "unknown";
}

export function usageForReport(usage: AggregatedUsage): AggregatedUsage {
  return usage;
}
