import { existsSync, readFileSync, copyFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { environmentFingerprint } from "./config-snapshot";
import type { IsolatedWorkspace } from "./isolation";
import type { HarnessRequest } from "./request";
import { canonicalizeContract, type PageContract } from "./schemas";
import type { ArtifactStore } from "./artifacts";
import type { EvidenceMeta, ProvenanceManifest } from "./evidence";
import { assessAuditReuseValidity } from "./policy";
import type { InspectReport } from "./inspect";
import { classifyVerifyResults, type VerifyResult } from "./verify";
import type { AggregatedUsage } from "./usage";

export class AuditReuseError extends Error {
  readonly code = "AUDIT_REUSE_INVALID";
  constructor(readonly reason: string) {
    super(
      `Invalid --from-audit evidence: ${reason} Refusing to fall back to a fresh plan.`,
    );
    this.name = "AuditReuseError";
  }
}

export type AuditFingerprint = {
  route: string;
  objective: string;
  suppliedObjective: string | null;
  baseSha: string | null;
  contractHash: string;
  inspectRole: string;
  environment: ReturnType<typeof environmentFingerprint>;
};

export function auditFingerprint(input: {
  request: HarnessRequest;
  isolation: IsolatedWorkspace;
  contract: PageContract;
}): AuditFingerprint {
  return {
    route: input.request.route,
    objective: input.request.objective,
    suppliedObjective: input.request.suppliedObjective,
    baseSha: input.isolation.baseSha,
    contractHash: canonicalizeContract(input.contract).hash,
    inspectRole: input.request.inspectRole,
    environment: environmentFingerprint(),
  };
}

export function fingerprintsMatch(a: AuditFingerprint, b: AuditFingerprint): boolean {
  const previousObjective = a.suppliedObjective ?? a.objective;
  const currentObjective = b.suppliedObjective ?? b.objective;
  return (
    a.route === b.route &&
    previousObjective === currentObjective &&
    a.objective === b.objective &&
    a.baseSha === b.baseSha &&
    a.contractHash === b.contractHash &&
    a.inspectRole === b.inspectRole &&
    a.environment.demoMode === b.environment.demoMode &&
    a.environment.nodeEnv === b.environment.nodeEnv &&
    a.environment.allowMockProviders === b.environment.allowMockProviders
  );
}

export function loadAuditReuse(options: {
  repoRoot: string;
  fromAudit: string;
  request: HarnessRequest;
  isolation: IsolatedWorkspace;
  store: ArtifactStore;
}): { ok: true; contract: PageContract; hash: string } | { ok: false; reason: string } {
  const auditRoot = path.join(options.repoRoot, "tmp", "page-harness", options.fromAudit);
  const verdict = inspectAuditReuse(auditRoot, options.request, options.isolation);
  if (!verdict.ok) {
    options.store.writeJson("from-audit-rejected.json", {
      fromAudit: options.fromAudit,
      reason: verdict.reason,
    });
    return verdict;
  }
  const contractFile = path.join(auditRoot, "artifacts", "contract.json");
  const contract = JSON.parse(readFileSync(contractFile, "utf8")) as PageContract;
  const hash = canonicalizeContract(contract).hash;
  for (const name of [
    "contract.json",
    "baseline.json",
    "page-map.json",
    "audit-fingerprint.json",
    "provenance.json",
  ]) {
    const src = path.join(auditRoot, "artifacts", name);
    if (existsSync(src)) {
      const dest = path.join(options.store.paths.artifacts, name);
      mkdirSync(path.dirname(dest), { recursive: true });
      copyFileSync(src, dest);
    }
  }
  return { ok: true, contract, hash };
}

export function inspectAuditReuse(
  auditRoot: string,
  request: HarnessRequest,
  isolation: IsolatedWorkspace,
): { ok: true } | { ok: false; reason: string } {
  const fingerprintFile = path.join(auditRoot, "artifacts", "audit-fingerprint.json");
  const contractFile = path.join(auditRoot, "artifacts", "contract.json");
  const statusFile = path.join(auditRoot, "artifacts", "run-status.json");
  const fatalFile = path.join(auditRoot, "artifacts", "fatal.json");
  const reportFile = path.join(auditRoot, "artifacts", "report.json");
  const reportMd = path.join(auditRoot, "artifacts", "report.md");
  const invalidFile = path.join(auditRoot, "artifacts", "inspect", "before", "diagnostics.json");
  const machineFile = path.join(auditRoot, "machine.json");
  const provenanceFile = path.join(auditRoot, "artifacts", "provenance.json");
  const inspectFile = path.join(auditRoot, "artifacts", "inspect", "before", "inspect.json");
  const afterInspectFile = path.join(auditRoot, "artifacts", "inspect", "after", "inspect.json");
  const verifyFile = path.join(auditRoot, "artifacts", "verify-baseline.json");

  const status = existsSync(statusFile)
    ? (JSON.parse(readFileSync(statusFile, "utf8")) as {
        reusable?: boolean;
        processStatus?: string;
        contractResult?: string;
      })
    : null;
  const report = existsSync(reportFile)
    ? (JSON.parse(readFileSync(reportFile, "utf8")) as {
        processStatus?: string;
        contractResult?: string;
        reusable?: boolean;
        evidence?: { afterStatus?: string };
      })
    : null;
  const machine = existsSync(machineFile)
    ? (JSON.parse(readFileSync(machineFile, "utf8")) as {
        request?: { auditOnly?: boolean };
        contractLocked?: boolean;
        stopReason?: string | null;
        phases?: Record<string, { status?: string }>;
      })
    : null;
  const provenance = existsSync(provenanceFile)
    ? (JSON.parse(readFileSync(provenanceFile, "utf8")) as ProvenanceManifest)
    : null;
  const inspect = existsSync(inspectFile)
    ? (JSON.parse(readFileSync(inspectFile, "utf8")) as InspectReport)
    : null;
  const verify = existsSync(verifyFile)
    ? (JSON.parse(readFileSync(verifyFile, "utf8")) as VerifyResult[])
    : [];
  const classified = classifyVerifyResults({
    requestedRoute: request.route,
    results: Array.isArray(verify) ? verify.map(normalizeLegacyVerify) : [],
  });
  const afterAliasedFromBaseline =
    !existsSync(afterInspectFile) &&
    (report?.evidence?.afterStatus === "collected" ||
      (existsSync(reportMd) &&
        /After inspect: console errors/i.test(readFileSync(reportMd, "utf8"))));

  const fingerprint = existsSync(fingerprintFile)
    ? (JSON.parse(readFileSync(fingerprintFile, "utf8")) as AuditFingerprint)
    : null;

  const targetRouteVerified =
    inspect?.routeVerified === true &&
    (inspect.finalPathname === request.route ||
      inspect.finalPathname?.startsWith(`${request.route}/`)) &&
    (classified.targetOk || inspect.routeVerified === true);

  const validity = assessAuditReuseValidity({
    processStatus: report?.processStatus ?? status?.processStatus ?? "audit_complete",
    contractResult: (report?.contractResult ?? status?.contractResult) as never,
    reusableFlag: status?.reusable ?? report?.reusable,
    auditOnly: machine?.request?.auditOnly ?? true,
    contractLocked:
      machine?.contractLocked === true ||
      machine?.phases?.CONTRACT_LOCK?.status === "completed" ||
      (machine == null &&
        Boolean(fingerprint && fingerprint.contractHash && fingerprint.contractHash !== "pending")),
    stopReason: machine?.stopReason ?? null,
    fatal: existsSync(fatalFile),
    invalidBaseline: existsSync(invalidFile),
    fingerprint: fingerprint
      ? {
          route: fingerprint.route,
          objective: fingerprint.objective,
          suppliedObjective: fingerprint.suppliedObjective ?? null,
          baseSha: fingerprint.baseSha,
          contractHash: fingerprint.contractHash,
          inspectRole: fingerprint.inspectRole,
        }
      : null,
    current: {
      route: request.route,
      objective: request.objective,
      suppliedObjective: request.suppliedObjective,
      baseSha: isolation.baseSha ?? null,
      inspectRole: request.inspectRole,
    },
    provenance,
    baselineInspectMeta: inspect?.meta as EvidenceMeta | undefined,
    baselineInspectPath: existsSync(inspectFile) ? inspectFile : undefined,
    targetRouteVerified,
    afterAliasedFromBaseline,
    usage: existsSync(reportFile)
      ? ((JSON.parse(readFileSync(reportFile, "utf8")) as { usage?: AggregatedUsage }).usage ??
        null)
      : null,
  });
  if (!validity.ok) return validity;
  if (!existsSync(contractFile) || !fingerprint) {
    return { ok: false, reason: "audit is missing fingerprint or contract" };
  }
  if (!existsSync(fingerprintFile)) {
    return { ok: false, reason: "audit is missing fingerprint or contract" };
  }
  const previous = fingerprint;
  if (!existsSync(contractFile)) {
    return { ok: false, reason: "audit is missing fingerprint or contract" };
  }
  const contract = JSON.parse(readFileSync(contractFile, "utf8")) as PageContract;
  const current = auditFingerprint({
    request,
    isolation,
    contract,
  });
  if (!fingerprintsMatch(previous, current)) {
    return {
      ok: false,
      reason:
        "from-audit fingerprint mismatch (route/objective/base SHA/contract hash/environment).",
    };
  }
  return { ok: true };
}

function normalizeLegacyVerify(row: VerifyResult | Record<string, unknown>): VerifyResult {
  const record = row as VerifyResult;
  return {
    name: String(record.name ?? "unknown"),
    ok: Boolean(record.ok),
    output: String(record.output ?? ""),
    page: record.page,
    scope: record.scope ?? "static",
    visitedRoutes: record.visitedRoutes,
    targetRouteVisited: record.targetRouteVisited,
  };
}
