import { existsSync, readFileSync } from "node:fs";
import { nowIso, sha256Text } from "./util";

export const PENDING_CONTRACT_HASH = "pending";

export type EvidenceMeta = {
  runId: string;
  route: string;
  contractHash: string;
  iteration: number;
  worktreeSha: string;
  timestamp: string;
  serverOrigin: string;
  browser: string;
  viewport?: string;
  generatingCommand: string;
};

export type PreLockArtifactBinding = {
  relativePath: string;
  originalContractHash: string;
  worktreeSha: string;
  timestamp: string;
  digestSha256: string;
};

export type ProvenanceManifest = {
  version: 1;
  runId: string;
  route: string;
  objective: string;
  suppliedObjective: string | null;
  lockedContractHash: string;
  lockedAt: string;
  baseSha: string | null;
  preLockArtifacts: PreLockArtifactBinding[];
  rebound: true;
  eligibleFor: "pre_lock_baseline_evaluation";
};

export function evidenceMeta(
  input: Omit<EvidenceMeta, "timestamp"> & { timestamp?: string },
): EvidenceMeta {
  return {
    ...input,
    timestamp: input.timestamp ?? nowIso(),
  };
}

export function isLockedContractHash(hash: string): boolean {
  return hash !== PENDING_CONTRACT_HASH && hash.length >= 16;
}

export function digestFile(filePath: string): string | null {
  if (!existsSync(filePath)) return null;
  return sha256Text(readFileSync(filePath, "utf8"));
}

export function bindPreLockProvenance(input: {
  runId: string;
  route: string;
  objective: string;
  suppliedObjective: string | null;
  lockedContractHash: string;
  baseSha: string | null;
  inspectFilePath: string;
  inspectMeta: EvidenceMeta;
  relativeInspectPath?: string;
}): ProvenanceManifest {
  if (!isLockedContractHash(input.lockedContractHash)) {
    throw new Error("Cannot bind provenance until the contract hash is locked.");
  }
  const digest = digestFile(input.inspectFilePath);
  if (!digest) {
    throw new Error(
      `Cannot bind provenance; missing baseline inspect at ${input.inspectFilePath}`,
    );
  }
  return {
    version: 1,
    runId: input.runId,
    route: input.route,
    objective: input.objective,
    suppliedObjective: input.suppliedObjective,
    lockedContractHash: input.lockedContractHash,
    lockedAt: nowIso(),
    baseSha: input.baseSha,
    preLockArtifacts: [
      {
        relativePath: input.relativeInspectPath ?? "inspect/before/inspect.json",
        originalContractHash: input.inspectMeta.contractHash,
        worktreeSha: input.inspectMeta.worktreeSha,
        timestamp: input.inspectMeta.timestamp,
        digestSha256: digest,
      },
    ],
    rebound: true,
    eligibleFor: "pre_lock_baseline_evaluation",
  };
}

export function provenanceBindsInspect(options: {
  provenance: ProvenanceManifest | null | undefined;
  meta: EvidenceMeta;
  inspectFilePath?: string;
  lockedContractHash: string;
}): { ok: boolean; reason?: string } {
  const { provenance, meta } = options;
  if (!provenance) {
    return { ok: false, reason: "no provenance manifest" };
  }
  if (!provenance.rebound) {
    return { ok: false, reason: "provenance is not a validated rebound" };
  }
  if (provenance.runId !== meta.runId) {
    return { ok: false, reason: "provenance runId mismatch" };
  }
  if (provenance.route !== meta.route) {
    return { ok: false, reason: "provenance route mismatch" };
  }
  if (provenance.lockedContractHash !== options.lockedContractHash) {
    return { ok: false, reason: "provenance locked hash mismatch" };
  }
  const binding = provenance.preLockArtifacts.find(
    (row) =>
      row.originalContractHash === meta.contractHash &&
      row.worktreeSha === meta.worktreeSha &&
      row.timestamp === meta.timestamp,
  );
  if (!binding) {
    return { ok: false, reason: "inspect metadata is not listed in provenance" };
  }
  if (options.inspectFilePath) {
    const digest = digestFile(options.inspectFilePath);
    if (!digest || digest !== binding.digestSha256) {
      return {
        ok: false,
        reason: "baseline inspect digest does not match provenance (file changed or missing)",
      };
    }
  }
  return { ok: true };
}

export function isEvidenceFresh(options: {
  meta: EvidenceMeta | undefined;
  runId: string;
  route: string;
  contractHash: string;
  iteration: number;
  notBeforeIso?: string;
  requiredWorktreeSha?: string;
  provenance?: ProvenanceManifest | null;
  inspectFilePath?: string;
  phase?: "audit" | "post_edit";
}): { ok: boolean; reason?: string } {
  const { meta } = options;
  if (!meta) return { ok: false, reason: "missing evidence metadata" };
  if (meta.runId !== options.runId) {
    return { ok: false, reason: `runId mismatch ${meta.runId} != ${options.runId}` };
  }
  if (meta.route !== options.route) {
    return { ok: false, reason: `route mismatch ${meta.route} != ${options.route}` };
  }
  if (meta.iteration !== options.iteration) {
    return { ok: false, reason: `iteration mismatch ${meta.iteration} != ${options.iteration}` };
  }
  if (options.notBeforeIso && meta.timestamp < options.notBeforeIso) {
    return { ok: false, reason: `stale evidence ${meta.timestamp} < ${options.notBeforeIso}` };
  }
  if (
    options.requiredWorktreeSha &&
    meta.worktreeSha !== options.requiredWorktreeSha
  ) {
    return {
      ok: false,
      reason: `worktree SHA mismatch ${meta.worktreeSha} != ${options.requiredWorktreeSha}`,
    };
  }

  const phase = options.phase ?? (options.iteration === 0 ? "audit" : "post_edit");
  if (phase === "post_edit") {
    if (options.contractHash === PENDING_CONTRACT_HASH) {
      return { ok: false, reason: "post-edit evidence requires a locked contract hash" };
    }
    if (meta.contractHash === PENDING_CONTRACT_HASH) {
      return {
        ok: false,
        reason: "post-edit evidence still has contractHash=pending; pre-lock rebound is not eligible after edits",
      };
    }
    if (meta.contractHash !== options.contractHash) {
      return { ok: false, reason: "contract hash mismatch" };
    }
    return { ok: true };
  }

  if (meta.contractHash === options.contractHash && isLockedContractHash(options.contractHash)) {
    return { ok: true };
  }
  if (meta.contractHash === PENDING_CONTRACT_HASH && isLockedContractHash(options.contractHash)) {
    const rebound = provenanceBindsInspect({
      provenance: options.provenance,
      meta,
      inspectFilePath: options.inspectFilePath,
      lockedContractHash: options.contractHash,
    });
    if (!rebound.ok) {
      return {
        ok: false,
        reason: `pre-lock evidence is ineligible for contract gates: ${rebound.reason}`,
      };
    }
    return { ok: true };
  }
  if (options.contractHash !== PENDING_CONTRACT_HASH && meta.contractHash !== options.contractHash) {
    return { ok: false, reason: "contract hash mismatch" };
  }
  return { ok: true };
}
