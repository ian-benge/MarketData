import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { classifyFailure } from "./failure";
import { nowIso, redactSecrets } from "./util";

let installed = false;

function persistCrash(message: string): void {
  const runDir = process.env.PAGE_HARNESS_RUN_DIR;
  if (!runDir) return;
  const classified = classifyFailure(message);
  const artifacts = path.join(runDir, "artifacts");
  try {
    mkdirSync(artifacts, { recursive: true });
    const payload = {
      processStatus: "failed",
      reusable: false,
      resumable: classified.retryable,
      failedPhase: process.env.PAGE_HARNESS_PHASE ?? "BUILD",
      failureCategory: classified.category,
      reason: redactSecrets(message),
      completedAt: nowIso(),
    };
    writeFileSync(path.join(artifacts, "run-status.json"), `${JSON.stringify(payload)}\n`);
    writeFileSync(
      path.join(artifacts, "fatal.json"),
      `${JSON.stringify({
        message: payload.reason,
        failedPhase: payload.failedPhase,
        failureCategory: classified.category,
        reusable: false,
        resumable: classified.retryable,
      })}\n`,
    );
    const log = path.join(runDir, "log.txt");
    if (existsSync(path.dirname(log))) {
      writeFileSync(log, `[phr crash] ${payload.reason}\n`, { flag: "a" });
    }
  } catch {
    // last-chance persist; do not throw from the crash guard
  }
}

export function installHarnessCrashGuard(): void {
  if (installed) return;
  installed = true;

  const halt = (error: unknown) => {
    const message = error instanceof Error ? error.stack || error.message : String(error);
    console.error(message);
    persistCrash(message);
    process.exitCode = 1;
    const timer = setTimeout(() => process.exit(1), 150);
    timer.unref();
  };

  process.on("uncaughtException", halt);
  process.on("unhandledRejection", halt);
}
