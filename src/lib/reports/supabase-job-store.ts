import type { SupabaseClient } from "@supabase/supabase-js";
import type { ReportEdition } from "@/lib/reports/editions";
import { PIPELINE_STAGES, type PipelineStage, type ReportRunStatus } from "@/lib/reports/stages";
import type {
  CreateRunInput,
  ReportJobStore,
  ReportRunRecord,
  StageRecord,
} from "@/lib/reports/job-store";

type RunRow = {
  id: string;
  firm_id: string;
  edition: ReportEdition;
  trading_date: string;
  status: ReportRunStatus;
  idempotency_key: string;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
  stage_metadata: Record<string, unknown>;
  schedule_version: string | null;
  scheduled_at: string | null;
  collect_after: string | null;
  publish_after: string | null;
  session_close_at: string | null;
  calendar_kind: ReportRunRecord["calendarKind"] | null;
};

type StageRow = {
  stage: PipelineStage;
  status: StageRecord["status"];
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
  metrics: Record<string, unknown>;
};

function sanitizeArtifact(artifact: unknown): unknown {
  if (!artifact || typeof artifact !== "object") return artifact;
  const copy = { ...(artifact as Record<string, unknown>) };
  if (copy.pdfBytes instanceof Uint8Array) {
    copy.pdfBytes = {
      omitted: true,
      byteLength: copy.pdfBytes.byteLength,
    };
  }
  return copy;
}

function rowToRun(row: RunRow, stages: StageRow[]): ReportRunRecord {
  const artifacts =
    (row.stage_metadata?.artifacts as Record<string, unknown> | undefined) ?? {};
  return {
    id: row.id,
    firmId: row.firm_id,
    edition: row.edition,
    tradingDate: String(row.trading_date).slice(0, 10),
    status: row.status,
    idempotencyKey: row.idempotency_key,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    startedAt: row.started_at ?? undefined,
    completedAt: row.completed_at ?? undefined,
    errorMessage: row.error_message ?? undefined,
    artifacts,
    scheduleVersion: row.schedule_version ?? undefined,
    scheduledAt: row.scheduled_at ?? undefined,
    collectAfter: row.collect_after ?? undefined,
    publishAfter: row.publish_after ?? undefined,
    sessionCloseAt: row.session_close_at ?? undefined,
    calendarKind: row.calendar_kind ?? undefined,
    stages: PIPELINE_STAGES.map((stage) => {
      const match = stages.find((s) => s.stage === stage);
      return {
        stage,
        status: match?.status ?? "pending",
        startedAt: match?.started_at ?? undefined,
        completedAt: match?.completed_at ?? undefined,
        errorMessage: match?.error_message ?? undefined,
        metrics: match?.metrics,
        artifact: artifacts[stage],
      };
    }),
  };
}

export class SupabaseReportJobStore implements ReportJobStore {
  constructor(private readonly client: SupabaseClient) {}

  private async load(runId: string): Promise<ReportRunRecord> {
    const { data: row, error } = await this.client
      .from("report_runs")
      .select("*")
      .eq("id", runId)
      .single();
    if (error || !row) throw new Error(error?.message ?? `Unknown run ${runId}`);
    const { data: stages } = await this.client
      .from("report_run_stages")
      .select("stage,status,started_at,completed_at,error_message,metrics")
      .eq("report_run_id", runId);
    return rowToRun(row as RunRow, (stages ?? []) as StageRow[]);
  }

  async createRun(input: CreateRunInput): Promise<ReportRunRecord> {
    const { data: existing } = await this.client
      .from("report_runs")
      .select("id")
      .eq("idempotency_key", input.idempotencyKey)
      .maybeSingle();
    if (existing?.id) return this.load(existing.id as string);

    const { data: inserted, error } = await this.client
      .from("report_runs")
      .insert({
        firm_id: input.firmId,
        edition: input.edition,
        trading_date: input.tradingDate,
        status: "queued",
        idempotency_key: input.idempotencyKey,
        schedule_version: input.scheduleVersion ?? "v3-close-postmarket",
        scheduled_at: input.scheduledAt ?? null,
        collect_after: input.collectAfter ?? null,
        publish_after: input.publishAfter ?? null,
        session_close_at: input.sessionCloseAt ?? null,
        calendar_kind: input.calendarKind ?? "regular",
        stage_metadata: { artifacts: {} },
      })
      .select("*")
      .single();

    if (error) {
      if (error.code === "23505") {
        const { data: raced } = await this.client
          .from("report_runs")
          .select("id")
          .eq("idempotency_key", input.idempotencyKey)
          .single();
        if (raced?.id) return this.load(raced.id as string);
      }
      throw new Error(error.message);
    }

    const runId = inserted.id as string;
    await this.client.from("report_run_stages").insert(
      PIPELINE_STAGES.map((stage) => ({
        report_run_id: runId,
        stage,
        status: "pending",
      })),
    );
    return this.load(runId);
  }

  async getRun(runId: string): Promise<ReportRunRecord | null> {
    try {
      return await this.load(runId);
    } catch {
      return null;
    }
  }

  async claimStage(runId: string, stage: PipelineStage) {
    const run = await this.load(runId);
    const record = run.stages.find((s) => s.stage === stage);
    if (!record) throw new Error(`Unknown stage ${stage}`);
    if (record.status === "completed") return { claimed: false, run };

    const now = new Date().toISOString();
    await this.client
      .from("report_run_stages")
      .update({ status: "running", started_at: now, error_message: null })
      .eq("report_run_id", runId)
      .eq("stage", stage);
    await this.client
      .from("report_runs")
      .update({
        status: stage,
        started_at: run.startedAt ?? now,
        updated_at: now,
      })
      .eq("id", runId);
    return { claimed: true, run: await this.load(runId) };
  }

  async completeStage(
    runId: string,
    stage: PipelineStage,
    artifact?: unknown,
    metrics?: Record<string, unknown>,
  ) {
    const run = await this.load(runId);
    const now = new Date().toISOString();
    const artifacts = {
      ...run.artifacts,
      ...(artifact !== undefined ? { [stage]: sanitizeArtifact(artifact) } : {}),
    };
    await this.client
      .from("report_run_stages")
      .update({
        status: "completed",
        completed_at: now,
        metrics: metrics ?? {},
      })
      .eq("report_run_id", runId)
      .eq("stage", stage);
    await this.client
      .from("report_runs")
      .update({
        stage_metadata: { artifacts },
        updated_at: now,
      })
      .eq("id", runId);
    return this.load(runId);
  }

  async failStage(runId: string, stage: PipelineStage, errorMessage: string) {
    const now = new Date().toISOString();
    await this.client
      .from("report_run_stages")
      .update({
        status: "failed",
        completed_at: now,
        error_message: errorMessage,
      })
      .eq("report_run_id", runId)
      .eq("stage", stage);
    await this.client
      .from("report_runs")
      .update({
        status: "failed",
        error_message: errorMessage,
        completed_at: now,
        updated_at: now,
      })
      .eq("id", runId);
    return this.load(runId);
  }

  async setRunStatus(
    runId: string,
    status: ReportRunStatus,
    errorMessage?: string,
  ) {
    const now = new Date().toISOString();
    const terminal = ["completed", "partial", "failed", "cancelled"].includes(
      status,
    );
    await this.client
      .from("report_runs")
      .update({
        status,
        error_message: errorMessage ?? null,
        updated_at: now,
        completed_at: terminal ? now : null,
      })
      .eq("id", runId);
    return this.load(runId);
  }

  async listActiveRuns(): Promise<ReportRunRecord[]> {
    const { data, error } = await this.client
      .from("report_runs")
      .select("id")
      .not("status", "in", "(completed,partial,failed,cancelled)")
      .order("created_at", { ascending: true })
      .limit(20);
    if (error) throw new Error(error.message);
    const runs: ReportRunRecord[] = [];
    for (const row of data ?? []) {
      runs.push(await this.load(row.id as string));
    }
    return runs;
  }

  async getPriorDocument(
    firmId: string,
    tradingDate: string,
    edition: ReportEdition,
  ): Promise<unknown | null> {
    const { data } = await this.client
      .from("report_runs")
      .select("stage_metadata")
      .eq("firm_id", firmId)
      .eq("trading_date", tradingDate)
      .eq("edition", edition)
      .in("status", ["completed", "partial"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const artifacts = data?.stage_metadata as
      | { artifacts?: { analyzing_and_drafting?: { document?: unknown } } }
      | undefined;
    return artifacts?.artifacts?.analyzing_and_drafting?.document ?? null;
  }
}
