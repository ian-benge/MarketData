import { writeFileSync, readFileSync } from "node:fs";
import path from "node:path";
import type { ArtifactStore, RunPaths } from "./artifacts";
import type { PageCatalogEntry } from "./catalog";
import type { IsolatedWorkspace } from "./isolation";
import type { InspectReport } from "./inspect";
import type { AggregatedUsage } from "./usage";
import { usageReportLines } from "./usage";
import { invocationReportLines } from "./invocations";
import type { VerifyResult } from "./verify";
import { verificationSummary } from "./verify";
import {
  evaluationCompleteness,
  type Baseline,
  type Evaluation,
  type PageContract,
  type PageMap,
} from "./schemas";
import { findShallowSignals } from "./safety";
import { nowIso } from "./util";
import type { ContractResult, HarnessRequest, HarnessResultStatus } from "./request";
import {
  afterInspectReportLine,
  type AfterEvidence,
} from "./policy";

export type VerificationSource = "final" | "checkpoint" | "not_run";
export type RestoreKind = "passing_checkpoint" | "baseline" | "none";

export type FinalRunState = {
  processStatus: HarnessResultStatus;
  contractResult: ContractResult;
  evaluatedSha: string | null;
  bestCommit: string | null;
  restoreKind: RestoreKind;
  integrationReady: boolean;
  after: AfterEvidence;
  verify: VerifyResult[];
  changed: string[];
  compare?: { regressions: string[]; improvements: string[] };
  evaluation: Evaluation | null;
  skeptic: Evaluation | null;
  completeness: ReturnType<typeof evaluationCompleteness> | null;
  usage: AggregatedUsage;
  stopReason: string | null;
  reusable: boolean;
  score: number;
  verificationSource: VerificationSource;
};

export function formatDisplayPath(value: string | null | undefined): string {
  if (!value) return "n/a";
  return value.replace(/\\/g, "/");
}

export function writeReport(options: {
  request: HarnessRequest;
  store: ArtifactStore;
  paths: RunPaths;
  isolation: IsolatedWorkspace;
  page: PageCatalogEntry | null;
  baseline: Baseline | null;
  pageMap: PageMap | null;
  contract: PageContract | null;
  before: InspectReport;
  after: AfterEvidence;
  evaluation: Evaluation | null;
  skeptic: Evaluation | null;
  verify: VerifyResult[];
  status: HarnessResultStatus;
  contractResult: ContractResult;
  score: number;
  bestCommit: string | null;
  changed: string[];
  completeness: ReturnType<typeof evaluationCompleteness> | null;
  usage: AggregatedUsage;
  stopReason?: string | null;
  compare?: { regressions: string[]; improvements: string[] };
  model?: unknown;
  reusable?: boolean;
  evaluatedSha?: string | null;
  integrationReady?: boolean;
  restoreKind?: RestoreKind;
  verificationSource?: VerificationSource;
  skepticRequired?: boolean;
  skepticPath?: string | null;
  invocations?: import("./invocations").InvocationLedger | null;
}): string {
  const state: FinalRunState = {
    processStatus: options.status,
    contractResult: options.contractResult,
    evaluatedSha: options.evaluatedSha ?? options.bestCommit,
    bestCommit: options.bestCommit,
    restoreKind: options.restoreKind ?? "none",
    integrationReady: options.integrationReady ?? false,
    after: options.after,
    verify: options.verify,
    changed: options.changed,
    compare: options.compare,
    evaluation: options.evaluation,
    skeptic: options.skeptic,
    completeness: options.completeness,
    usage: options.usage,
    stopReason: options.stopReason ?? null,
    reusable: options.reusable ?? false,
    score: options.score,
    verificationSource: options.verificationSource ?? (options.verify.length ? "final" : "not_run"),
  };
  options.store.writeJson("final-state.json", {
    processStatus: state.processStatus,
    contractResult: state.contractResult,
    evaluatedSha: state.evaluatedSha,
    bestCommit: state.bestCommit,
    restoreKind: state.restoreKind,
    integrationReady: state.integrationReady,
    verificationSource: state.verificationSource,
    afterStatus: state.after.status,
    verify: verificationSummary(state.verify),
    changed: state.changed,
    stopReason: state.stopReason,
    reusable: state.reusable,
    skepticRequired: options.skepticRequired ?? false,
    skepticPath: options.skepticPath ?? null,
    skepticStatus: options.skepticRequired
      ? options.skeptic
        ? "completed"
        : "missing"
      : "not_required",
  });
  const shallow = options.changed.flatMap((file) => {
    try {
      const abs = path.join(options.isolation.agentCwd, file);
      const text = readFileSync(abs, "utf8");
      return findShallowSignals(text).map((hit) => `${file}: ${hit}`);
    } catch {
      return [];
    }
  });
  const remaining = [
    ...(options.completeness?.failed.map((id) => `failed gate ${id}`) ?? []),
    ...(options.completeness?.missing.map((id) => `unevaluated gate ${id}`) ?? []),
    ...(options.completeness?.noEvidence.map((id) => `no evidence for ${id}`) ?? []),
    ...(options.completeness?.illegalNotApplicable.map(
      (id) => `required gate ${id} used not_applicable`,
    ) ?? []),
    ...(options.completeness?.unprovenConditional.map(
      (id) => `conditional gate ${id} N/A without proven activationCondition=false`,
    ) ?? []),
    ...(options.completeness?.ineligibleEvidence.map(
      (id) => `ineligible evidence for ${id} (pending or mismatched contract hash / SHA)`,
    ) ?? []),
    ...shallow,
    ...(options.stopReason ? [`stop: ${options.stopReason}`] : []),
  ];
  const afterPath =
    options.after.status === "collected"
      ? path.join(options.paths.inspectAfter, "inspect.json")
      : null;
  const report = {
    processStatus: state.processStatus,
    contractResult: state.contractResult,
    reusable: state.reusable,
    integrationReady: state.integrationReady,
    restoreKind: state.restoreKind,
    verificationSource: state.verificationSource,
    status: state.processStatus,
    route: options.request.route,
    objective: options.request.objective,
    suppliedObjective: options.request.suppliedObjective,
    generatedAt: nowIso(),
    score: state.score,
    bestCommit: state.bestCommit,
    evaluatedSha: state.evaluatedSha,
    isolation: {
      ...options.isolation,
      worktreePath: options.isolation.worktreePath
        ? formatDisplayPath(options.isolation.worktreePath)
        : null,
      repoRoot: formatDisplayPath(options.isolation.repoRoot),
      agentCwd: formatDisplayPath(options.isolation.agentCwd),
    },
    model: options.model ?? null,
    whatChanged: state.changed,
    whyBetter: state.evaluation?.summary ?? "",
    evidence: {
      inspectBefore: path.join(options.paths.inspectBefore, "inspect.json"),
      inspectAfter: afterPath,
      afterStatus: state.after.status,
      afterReason: state.after.status === "unavailable" ? state.after.reason : null,
      afterSource: state.after.status === "collected" ? state.after.source ?? "final" : null,
      evaluation: state.evaluation,
      skeptic: state.skeptic,
      verify: verificationSummary(state.verify),
      verificationSource: state.verificationSource,
      compare: state.compare ?? null,
    },
    remainingLimitations: remaining,
    deferred: state.evaluation?.targetedRepair.map((item) => item.requestedFix) ?? [],
    usage: state.usage,
    invocations: options.invocations ?? null,
    skepticRequired: options.skepticRequired ?? false,
    skepticPath: options.skepticPath ?? null,
    catalog: options.page,
    baseline: options.baseline?.summary ?? null,
    pageMap: options.pageMap,
    stopReason: state.stopReason,
    sandbox: options.store.readJson("sandbox.json"),
  };
  options.store.writeJson("report.json", report);
  const verificationLine =
    state.verificationSource === "not_run"
      ? "- Verification: not run"
      : state.verificationSource === "checkpoint"
        ? `- Verification (from passing checkpoint; not re-run after cancel): ${verificationSummary(state.verify) || "none recorded"}`
        : `- Verification: ${verificationSummary(state.verify) || "not run"}`;
  const md = [
    `# Page improvement report: ${options.request.route}`,
    "",
    `- Process status: **${state.processStatus}**`,
    `- Contract result: **${state.contractResult}**`,
    `- Integration ready: **${state.integrationReady ? "yes" : "no"}**`,
    `- Reusable audit: **${report.reusable ? "yes" : "no"}**`,
    `- Skeptic: **${
      options.skepticRequired
        ? options.skeptic
          ? `completed (${formatDisplayPath(options.skepticPath)})`
          : "required, missing"
        : "not required"
    }**`,
    `- Score: ${state.score}`,
    `- Objective: ${options.request.objective}`,
    `- Supplied objective: ${options.request.suppliedObjective ?? "(none; default used)"}`,
    `- Best checkpoint: ${state.bestCommit ?? "n/a"}`,
    `- Evaluated SHA: ${state.evaluatedSha ?? "n/a"}`,
    `- Restore: ${state.restoreKind}`,
    `- Isolation: ${options.isolation.mode} ${options.isolation.branchName ?? ""}`.trim(),
    state.stopReason ? `- Stopped: ${state.stopReason}` : "",
    sandboxLine(options.store.readJson("sandbox.json")),
    "",
    "## What changed",
    state.changed.length
      ? state.changed.map((file) => `- \`${file}\``).join("\n")
      : "- No files changed.",
    "",
    "## Why it is better",
    options.status === "audit_complete"
      ? state.evaluation?.summary ?? "Audit evaluation recorded."
      : state.evaluation?.summary ?? "No evaluation recorded.",
    "",
    "## Evidence",
    `- Baseline inspect: console errors ${options.before.consoleErrors.length}, transfer ${options.before.transferKb}kb, navigation median ${options.before.navigationMsMedian ?? options.before.navigationMs}ms`,
    afterInspectReportLine(state.after, options.before),
    state.compare?.improvements.length
      ? `- Improvements: ${state.compare.improvements.join("; ")}`
      : "",
    state.compare?.regressions.length
      ? `- Regressions: ${state.compare.regressions.join("; ")}`
      : "",
    verificationLine,
    "",
    "## Remaining limitations",
    remaining.length ? remaining.map((row) => `- ${row}`).join("\n") : "- None recorded.",
    "",
    "## Follow-up ideas deferred",
    report.deferred.length ? report.deferred.map((row) => `- ${row}`).join("\n") : "- None.",
    "",
    "## Usage",
    ...usageReportLines(state.usage),
    ...(options.invocations ? invocationReportLines(options.invocations) : []),
    "",
    "## Integration handoff",
    `- Worktree: ${formatDisplayPath(options.isolation.worktreePath)}`,
    `- Branch: ${options.isolation.branchName ?? "n/a"}`,
    `- Base SHA: ${options.isolation.baseSha ?? "n/a"}`,
    `- Final SHA: ${state.bestCommit ?? "n/a"}`,
    `- Evaluated SHA: ${state.evaluatedSha ?? "n/a"}`,
    `- Integration ready: ${state.integrationReady ? "yes" : "no"}`,
    "",
  ]
    .filter((line) => line !== "")
    .join("\n");
  const reportPath = path.join(options.paths.artifacts, "report.md");
  writeFileSync(reportPath, md, "utf8");
  return reportPath;
}

function sandboxLine(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const sandbox = value as {
    requested?: string;
    effective?: string;
    detected?: { supported?: boolean; reason?: string };
    fallbackReason?: string | null;
  };
  const detected = sandbox.detected?.supported ? "supported" : "unsupported";
  const fallback = sandbox.fallbackReason ? `; fallback ${sandbox.fallbackReason}` : "";
  return `- Sandbox: requested ${sandbox.requested ?? "n/a"}, detected ${detected}, effective ${sandbox.effective ?? "n/a"}${fallback}`;
}
