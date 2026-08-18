import {
  appendFileSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
} from "node:fs";
import path from "node:path";
import { canonicalJson, nowIso, redactSecrets } from "./util";
import type { ArtifactName } from "./schemas";
import { parseArtifact } from "./schemas";
import { assertArtifactName, assertArtifactSize, assertPathInside } from "./containment";

export type RunPaths = {
  root: string;
  artifacts: string;
  inspect: string;
  inspectBefore: string;
  inspectAfter: string;
  performance: string;
  roles: string;
  screenshots: string;
  prompts: string;
  failedApproaches: string;
  log: string;
  verboseLog: string;
};

export function createRunPaths(repoRoot: string, runId: string): RunPaths {
  const root = path.join(repoRoot, "tmp", "page-harness", runId);
  const artifacts = path.join(root, "artifacts");
  const inspect = path.join(artifacts, "inspect");
  const paths: RunPaths = {
    root,
    artifacts,
    inspect,
    inspectBefore: path.join(inspect, "before"),
    inspectAfter: path.join(inspect, "after"),
    performance: path.join(artifacts, "performance"),
    roles: path.join(artifacts, "roles"),
    screenshots: path.join(artifacts, "screenshots"),
    prompts: path.join(artifacts, "prompts"),
    failedApproaches: path.join(artifacts, "failed-approaches"),
    log: path.join(root, "log.txt"),
    verboseLog: path.join(root, "verbose.jsonl"),
  };
  for (const dir of [
    root,
    artifacts,
    inspect,
    paths.inspectBefore,
    paths.inspectAfter,
    paths.performance,
    paths.roles,
    paths.screenshots,
    paths.prompts,
    paths.failedApproaches,
    path.join(root, "sdk-store"),
  ]) {
    mkdirSync(dir, { recursive: true });
  }
  return paths;
}

export class ArtifactStore {
  constructor(readonly paths: RunPaths) {}

  writeJson(relative: string, value: unknown): string {
    const full = path.join(this.paths.artifacts, relative);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, `${canonicalJson(value)}\n`, "utf8");
    return full;
  }

  writeText(relative: string, value: string): string {
    const full = path.join(this.paths.artifacts, relative);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, redactSecrets(value), "utf8");
    return full;
  }

  readJson(relative: string): unknown {
    const full = path.join(this.paths.artifacts, relative);
    if (!existsSync(full)) return null;
    return JSON.parse(readFileSync(full, "utf8"));
  }

  submit<K extends ArtifactName>(name: K, payload: unknown) {
    assertArtifactName(name);
    assertArtifactSize(payload);
    const parsed = parseArtifact(name, payload);
    const file = this.writeJson(`${name}.json`, parsed);
    assertPathInside(file, [this.paths.root], "artifact path");
    return { parsed, file };
  }

  appendProgress(event: Record<string, unknown>): void {
    const line = canonicalJson({ ts: nowIso(), ...event });
    appendFileSync(
      path.join(this.paths.artifacts, "progress.jsonl"),
      `${line}\n`,
      "utf8",
    );
  }

  appendLog(line: string): void {
    appendFileSync(this.paths.log, `${redactSecrets(line)}\n`, "utf8");
  }

    appendVerbose(event: unknown): void {
    appendFileSync(
      this.paths.verboseLog,
      `${redactSecrets(canonicalJson(event))}\n`,
      "utf8",
    );
  }

  markUnreusable(input: { failedPhase: string; message: string }): void {
    this.writeJson("run-status.json", {
      processStatus: "failed",
      reusable: false,
      resumable: false,
      failedPhase: input.failedPhase,
      reason: redactSecrets(input.message),
      completedAt: nowIso(),
    });
    this.writeJson("fatal.json", {
      message: redactSecrets(input.message),
      failedPhase: input.failedPhase,
      reusable: false,
      resumable: false,
    });
  }

  writeFailureStatus(input: {
    phase: string;
    message: string;
    resumable: boolean;
    category: string;
    resume?: {
      nextAction?: string | null;
      schemaVersion?: number | null;
    };
  }): void {
    this.writeJson("run-status.json", {
      processStatus: "failed",
      reusable: false,
      resumable: input.resumable,
      failedPhase: input.phase,
      activePhase: input.phase,
      failureCategory: input.category,
      reason: redactSecrets(input.message),
      nextAction: input.resume?.nextAction ?? null,
      schemaVersion: input.resume?.schemaVersion ?? null,
      completedAt: nowIso(),
    });
    this.writeJson("fatal.json", {
      message: redactSecrets(input.message),
      failedPhase: input.phase,
      reusable: false,
      resumable: input.resumable,
      failureCategory: input.category,
    });
  }
}
