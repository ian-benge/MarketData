import type { ReportEdition } from "@/lib/providers/types";
import type { PipelineStage, ReportRunStatus } from "@/lib/reports/stages";
import { PIPELINE_STAGES } from "@/lib/reports/stages";

export type StageRecordStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "skipped";

export type StageRecord = {
  stage: PipelineStage;
  status: StageRecordStatus;
  startedAt?: string;
  completedAt?: string;
  errorMessage?: string;
  artifact?: unknown;
  metrics?: Record<string, unknown>;
};

export type ReportRunRecord = {
  id: string;
  firmId: string;
  edition: ReportEdition;
  tradingDate: string;
  status: ReportRunStatus;
  idempotencyKey: string;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
  errorMessage?: string;
  stages: StageRecord[];
  artifacts: Record<string, unknown>;
  scheduleVersion?: string;
  scheduledAt?: string;
  collectAfter?: string;
  publishAfter?: string;
  sessionCloseAt?: string;
  calendarKind?: "regular" | "early_close" | "holiday_skip";
};

export type CreateRunInput = {
  firmId: string;
  edition: ReportEdition;
  tradingDate: string;
  idempotencyKey: string;
  scheduleVersion?: string;
  scheduledAt?: string;
  collectAfter?: string;
  publishAfter?: string;
  sessionCloseAt?: string;
  calendarKind?: "regular" | "early_close" | "holiday_skip";
};

export interface ReportJobStore {
  createRun(input: CreateRunInput): Promise<ReportRunRecord>;
  claimStage(
    runId: string,
    stage: PipelineStage,
  ): Promise<{ claimed: boolean; run: ReportRunRecord }>;
  completeStage(
    runId: string,
    stage: PipelineStage,
    artifact?: unknown,
    metrics?: Record<string, unknown>,
  ): Promise<ReportRunRecord>;
  failStage(
    runId: string,
    stage: PipelineStage,
    errorMessage: string,
  ): Promise<ReportRunRecord>;
  setRunStatus(
    runId: string,
    status: ReportRunStatus,
    errorMessage?: string,
  ): Promise<ReportRunRecord>;
  getRun(runId: string): Promise<ReportRunRecord | null>;
  listActiveRuns?(): Promise<ReportRunRecord[]>;
  getPriorDocument?(
    firmId: string,
    tradingDate: string,
    edition: ReportEdition,
  ): Promise<unknown | null>;
}

function nowIso(): string {
  return new Date().toISOString();
}

function newId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
}

/**
 * In-memory ReportJobStore for unit tests and local dry-runs.
 */
export class MemoryReportJobStore implements ReportJobStore {
  private readonly runs = new Map<string, ReportRunRecord>();

  async createRun(input: CreateRunInput): Promise<ReportRunRecord> {
    for (const existing of this.runs.values()) {
      if (existing.idempotencyKey === input.idempotencyKey) {
        return structuredClone(existing);
      }
    }

    const createdAt = nowIso();
    const run: ReportRunRecord = {
      id: newId("run"),
      firmId: input.firmId,
      edition: input.edition,
      tradingDate: input.tradingDate,
      status: "queued",
      idempotencyKey: input.idempotencyKey,
      createdAt,
      updatedAt: createdAt,
      stages: PIPELINE_STAGES.map((stage) => ({
        stage,
        status: "pending",
      })),
      artifacts: {},
      scheduleVersion: input.scheduleVersion,
      scheduledAt: input.scheduledAt,
      collectAfter: input.collectAfter,
      publishAfter: input.publishAfter,
      sessionCloseAt: input.sessionCloseAt,
      calendarKind: input.calendarKind,
    };
    this.runs.set(run.id, run);
    return structuredClone(run);
  }

  async getRun(runId: string): Promise<ReportRunRecord | null> {
    const run = this.runs.get(runId);
    return run ? structuredClone(run) : null;
  }

  private require(runId: string): ReportRunRecord {
    const run = this.runs.get(runId);
    if (!run) throw new Error(`Unknown report run: ${runId}`);
    return run;
  }

  async claimStage(
    runId: string,
    stage: PipelineStage,
  ): Promise<{ claimed: boolean; run: ReportRunRecord }> {
    const run = this.require(runId);
    const record = run.stages.find((s) => s.stage === stage);
    if (!record) throw new Error(`Unknown stage ${stage} on run ${runId}`);

    if (record.status === "completed") {
      return { claimed: false, run: structuredClone(run) };
    }

    record.status = "running";
    record.startedAt = nowIso();
    record.errorMessage = undefined;
    run.status = stage;
    run.startedAt = run.startedAt ?? record.startedAt;
    run.updatedAt = nowIso();
    return { claimed: true, run: structuredClone(run) };
  }

  async completeStage(
    runId: string,
    stage: PipelineStage,
    artifact?: unknown,
    metrics?: Record<string, unknown>,
  ): Promise<ReportRunRecord> {
    const run = this.require(runId);
    const record = run.stages.find((s) => s.stage === stage);
    if (!record) throw new Error(`Unknown stage ${stage} on run ${runId}`);

    record.status = "completed";
    record.completedAt = nowIso();
    record.artifact = artifact;
    record.metrics = metrics;
    if (artifact !== undefined) {
      run.artifacts[stage] = artifact;
    }
    run.updatedAt = nowIso();
    return structuredClone(run);
  }

  async failStage(
    runId: string,
    stage: PipelineStage,
    errorMessage: string,
  ): Promise<ReportRunRecord> {
    const run = this.require(runId);
    const record = run.stages.find((s) => s.stage === stage);
    if (!record) throw new Error(`Unknown stage ${stage} on run ${runId}`);
    record.status = "failed";
    record.completedAt = nowIso();
    record.errorMessage = errorMessage;
    run.status = "failed";
    run.errorMessage = errorMessage;
    run.completedAt = record.completedAt;
    run.updatedAt = nowIso();
    return structuredClone(run);
  }

  async setRunStatus(
    runId: string,
    status: ReportRunStatus,
    errorMessage?: string,
  ): Promise<ReportRunRecord> {
    const run = this.require(runId);
    run.status = status;
    run.errorMessage = errorMessage;
    run.updatedAt = nowIso();
    if (
      status === "completed" ||
      status === "partial" ||
      status === "failed" ||
      status === "cancelled"
    ) {
      run.completedAt = nowIso();
    }
    return structuredClone(run);
  }

  async listActiveRuns(): Promise<ReportRunRecord[]> {
    return [...this.runs.values()]
      .filter(
        (run) =>
          run.status !== "completed" &&
          run.status !== "partial" &&
          run.status !== "failed" &&
          run.status !== "cancelled",
      )
      .map((run) => structuredClone(run));
  }

  async getPriorDocument(
    firmId: string,
    tradingDate: string,
    edition: ReportEdition,
  ): Promise<unknown | null> {
    for (const run of this.runs.values()) {
      if (
        run.firmId === firmId &&
        run.tradingDate === tradingDate &&
        run.edition === edition
      ) {
        const drafted = run.artifacts.analyzing_and_drafting as
          | { document?: unknown }
          | undefined;
        if (drafted?.document) return structuredClone(drafted.document);
      }
    }
    return null;
  }
}
