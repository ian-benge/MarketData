import type { SupabaseClient } from "@supabase/supabase-js";
import type { ReportDocumentModel } from "@/lib/reports/content-builder";
import {
  normalizeReportEdition,
  type ReportEdition,
} from "@/lib/reports/editions";
import { resolveFirmId } from "@/lib/reports/run-on-demand";
import { canCreateAdminClient, createAdminClient } from "@/lib/supabase/admin";
import { getEnv } from "@/lib/env";
import type {
  FixtureReportDetail,
  FixtureReportSummary,
} from "@/lib/fixtures/reports";

export type LiveReportFilters = {
  q?: string;
  edition?: string;
  from?: string;
  to?: string;
};

export type LiveReportJob = {
  id: string;
  status: string;
  stage: string;
  updatedAt: string;
};

export type LiveReportPdf = {
  bytes: Uint8Array;
  tradingDate: string;
  edition: ReportEdition;
};

type ReportRow = {
  id: string;
  firm_id: string;
  report_run_id: string | null;
  edition: string;
  trading_date: string;
  title: string;
  executive_summary: string | null;
  status: string;
  published_at: string | null;
  canonical_json: unknown;
};

type SectionRow = {
  title: string;
  body_markdown: string;
  sort_order: number;
};

type FileRow = {
  storage_path: string;
  file_type: string;
};

type RunRow = {
  id: string;
  status: string;
  updated_at: string;
};

type StageRow = {
  stage: string;
  status: string;
};

export function isLiveReportsAvailable(): boolean {
  return canCreateAdminClient();
}

function asDocument(value: unknown): ReportDocumentModel | undefined {
  if (!value || typeof value !== "object") return undefined;
  if ("sections" in value && "title" in value) {
    return value as ReportDocumentModel;
  }
  return undefined;
}

function tickersFromDocument(document: ReportDocumentModel | undefined): string[] {
  if (!document) return [];
  const tickers = [
    ...document.movers.map((mover) => mover.ticker),
    ...document.claims.flatMap((claim) => claim.tickers ?? []),
  ];
  return [...new Set(tickers)];
}

function toSummary(row: ReportRow): FixtureReportSummary | null {
  const edition = normalizeReportEdition(row.edition);
  if (!edition) return null;
  const document = asDocument(row.canonical_json);
  return {
    id: row.id,
    edition,
    tradingDate: String(row.trading_date).slice(0, 10),
    status: row.status,
    headlineSummary:
      row.executive_summary ?? document?.executiveSummary ?? row.title,
    completedAt: row.published_at,
    tickers: tickersFromDocument(document),
  };
}

function currentStage(run: RunRow, stages: StageRow[]): string {
  if (
    run.status === "completed" ||
    run.status === "partial" ||
    run.status === "failed" ||
    run.status === "cancelled"
  ) {
    return run.status;
  }
  const running = stages.find((stage) => stage.status === "running");
  if (running) return running.stage;
  const completed = [...stages]
    .reverse()
    .find((stage) => stage.status === "completed");
  return completed?.stage ?? run.status ?? "queued";
}

async function findReportRow(
  client: SupabaseClient,
  firmId: string,
  id: string,
): Promise<ReportRow | null> {
  const { data, error } = await client
    .from("reports")
    .select(
      "id, firm_id, report_run_id, edition, trading_date, title, executive_summary, status, published_at, canonical_json",
    )
    .eq("firm_id", firmId)
    .or(`id.eq.${id},report_run_id.eq.${id}`)
    .maybeSingle();
  if (!error && data) return data as ReportRow;

  const { data: run } = await client
    .from("report_runs")
    .select("id")
    .eq("firm_id", firmId)
    .eq("id", id)
    .maybeSingle();
  if (!run?.id) return null;

  const { data: byRun } = await client
    .from("reports")
    .select(
      "id, firm_id, report_run_id, edition, trading_date, title, executive_summary, status, published_at, canonical_json",
    )
    .eq("report_run_id", run.id)
    .maybeSingle();
  return (byRun as ReportRow | null) ?? null;
}

export async function listLiveReports(
  filters: LiveReportFilters = {},
  firmId = resolveFirmId(),
): Promise<FixtureReportSummary[]> {
  const client = createAdminClient();
  let query = client
    .from("reports")
    .select(
      "id, firm_id, report_run_id, edition, trading_date, title, executive_summary, status, published_at, canonical_json",
    )
    .eq("firm_id", firmId)
    .order("trading_date", { ascending: false })
    .limit(100);

  const edition = normalizeReportEdition(filters.edition);
  if (edition) query = query.eq("edition", edition);
  if (filters.from) query = query.gte("trading_date", filters.from);
  if (filters.to) query = query.lte("trading_date", filters.to);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  let rows = ((data ?? []) as ReportRow[])
    .map(toSummary)
    .filter((row): row is FixtureReportSummary => row !== null);

  if (filters.q?.trim()) {
    const q = filters.q.trim().toLowerCase();
    rows = rows.filter(
      (row) =>
        row.headlineSummary.toLowerCase().includes(q) ||
        row.tickers.some((ticker) => ticker.toLowerCase().includes(q)) ||
        row.id.toLowerCase().includes(q),
    );
  }
  return rows;
}

export async function getLiveReport(
  id: string,
  firmId = resolveFirmId(),
): Promise<FixtureReportDetail | null> {
  const client = createAdminClient();
  let row: ReportRow | null;
  try {
    row = await findReportRow(client, firmId, id);
  } catch {
    return null;
  }
  if (!row) return null;
  const summary = toSummary(row);
  if (!summary) return null;

  const document = asDocument(row.canonical_json);
  const { data: sectionRows } = await client
    .from("report_sections")
    .select("title, body_markdown, sort_order")
    .eq("report_id", row.id)
    .order("sort_order", { ascending: true });
  const fromTable = (sectionRows as SectionRow[] | null) ?? [];
  const sections =
    fromTable.length > 0
      ? fromTable.map((section) => ({
          title: section.title,
          body: section.body_markdown,
        }))
      : (document?.sections.map((section) => ({
          title: section.title,
          body: section.body,
        })) ?? []);

  const { data: fileRows } = await client
    .from("report_files")
    .select("storage_path, file_type")
    .eq("report_id", row.id)
    .eq("file_type", "pdf")
    .limit(1);
  const pdfAvailable = Boolean((fileRows as FileRow[] | null)?.length);

  const job = row.report_run_id
    ? await getLiveReportJob(row.report_run_id, firmId)
    : undefined;

  return {
    ...summary,
    htmlBody: "",
    pdfAvailable,
    sections,
    citations:
      document?.sources.map((source) => ({
        id: source.id,
        label: source.title,
        url: source.url,
      })) ?? [],
    job: job ?? undefined,
    document,
  };
}

export async function getLiveReportJob(
  id: string,
  firmId = resolveFirmId(),
): Promise<LiveReportJob | null> {
  const client = createAdminClient();
  let runId = id;
  try {
    const report = await findReportRow(client, firmId, id);
    if (report?.report_run_id) runId = report.report_run_id;
  } catch {
    runId = id;
  }

  const { data: run, error } = await client
    .from("report_runs")
    .select("id, status, updated_at")
    .eq("firm_id", firmId)
    .eq("id", runId)
    .maybeSingle();
  if (error || !run) return null;

  const { data: stages } = await client
    .from("report_run_stages")
    .select("stage, status")
    .eq("report_run_id", run.id);

  const runRow = run as RunRow;
  return {
    id: runRow.id,
    status: runRow.status,
    stage: currentStage(runRow, (stages ?? []) as StageRow[]),
    updatedAt: runRow.updated_at,
  };
}

export async function getLiveReportPdf(
  id: string,
  firmId = resolveFirmId(),
): Promise<LiveReportPdf | null> {
  const client = createAdminClient();
  let row: ReportRow | null;
  try {
    row = await findReportRow(client, firmId, id);
  } catch {
    return null;
  }
  if (!row) return null;
  const edition = normalizeReportEdition(row.edition);
  if (!edition) return null;

  const { data: file, error: fileError } = await client
    .from("report_files")
    .select("storage_path, file_type")
    .eq("report_id", row.id)
    .eq("file_type", "pdf")
    .maybeSingle();
  if (fileError || !file?.storage_path) return null;

  const bucket = getEnv().STORAGE_BUCKET;
  const { data: blob, error: downloadError } = await client.storage
    .from(bucket)
    .download(String(file.storage_path));
  if (downloadError || !blob) return null;

  const bytes =
    blob instanceof Uint8Array
      ? blob
      : new Uint8Array(await blob.arrayBuffer());

  return {
    bytes,
    tradingDate: String(row.trading_date).slice(0, 10),
    edition,
  };
}
