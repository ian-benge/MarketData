import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { demoReportDocument } from "@/lib/fixtures/demo-report";
import { persistArchivedReport } from "@/lib/reports/archive-store";

type Row = Record<string, unknown>;

function createMockClient() {
  const state = {
    reports: [] as Row[],
    sections: [] as Row[],
    claims: [] as Row[],
    files: [] as Row[],
    uploads: [] as Array<{
      path: string;
      body: unknown;
      options: unknown;
    }>,
  };
  let nextId = 1;

  const upload = vi.fn(
    async (path: string, body: unknown, options?: unknown) => {
      state.uploads.push({ path, body, options });
      return { data: { path }, error: null };
    },
  );

  function builder(table: string) {
    let op: "select" | "insert" | "update" | "upsert" | "delete" = "select";
    let payload: unknown;
    const filters: Row = {};

    const execute = () => {
      const match = (row: Row) =>
        Object.entries(filters).every(([key, value]) => row[key] === value);

      if (table === "reports") {
        if (op === "select") {
          return { data: state.reports.find(match) ?? null, error: null };
        }
        if (op === "insert") {
          const row = { id: `rpt-${nextId++}`, ...(payload as Row) };
          state.reports.push(row);
          return { data: { id: row.id }, error: null };
        }
        if (op === "update") {
          const row = state.reports.find(match);
          if (row) Object.assign(row, payload as Row);
          return { data: row ?? null, error: null };
        }
      }

      if (table === "report_sections") {
        if (op === "upsert") {
          const rows = Array.isArray(payload) ? payload : [payload];
          for (const incoming of rows) {
            const row = incoming as Row;
            const existing = state.sections.find(
              (item) =>
                item.report_id === row.report_id &&
                item.section_key === row.section_key,
            );
            if (existing) Object.assign(existing, row);
            else state.sections.push({ ...row });
          }
          return { data: null, error: null };
        }
      }

      if (table === "report_claims") {
        if (op === "delete") {
          state.claims = state.claims.filter((row) => !match(row));
          return { data: null, error: null };
        }
        if (op === "insert") {
          const rows = Array.isArray(payload) ? payload : [payload];
          for (const incoming of rows) {
            state.claims.push({ id: `clm-${nextId++}`, ...(incoming as Row) });
          }
          return { data: null, error: null };
        }
      }

      if (table === "report_files") {
        if (op === "upsert") {
          const row = payload as Row;
          const existing = state.files.find(
            (item) =>
              item.report_id === row.report_id &&
              item.file_type === row.file_type,
          );
          if (existing) Object.assign(existing, row);
          else state.files.push({ ...row });
          return { data: null, error: null };
        }
      }

      return { data: null, error: null };
    };

    const api: Record<string, unknown> = {};
    api.select = vi.fn(() => api);
    api.insert = vi.fn((value: unknown) => {
      op = "insert";
      payload = value;
      return api;
    });
    api.update = vi.fn((value: unknown) => {
      op = "update";
      payload = value;
      return api;
    });
    api.upsert = vi.fn((value: unknown) => {
      op = "upsert";
      payload = value;
      return api;
    });
    api.delete = vi.fn(() => {
      op = "delete";
      return api;
    });
    api.eq = vi.fn((column: string, value: unknown) => {
      filters[column] = value;
      return api;
    });
    api.maybeSingle = vi.fn(async () => execute());
    api.single = vi.fn(async () => execute());
    api.then = (
      resolve: (value: unknown) => unknown,
      reject?: (reason: unknown) => unknown,
    ) => Promise.resolve(execute()).then(resolve, reject);
    return api;
  }

  const client = {
    storage: {
      from: vi.fn(() => ({ upload })),
    },
    from: vi.fn((table: string) => builder(table)),
  };

  return { client: client as unknown as SupabaseClient, state, upload };
}

const document = demoReportDocument("midday", "2026-08-10");
const baseInput = {
  firmId: "a0000000-0000-4000-8000-000000000001",
  runId: "run-1",
  edition: "midday" as const,
  tradingDate: "2026-08-10",
  document,
  archivePath:
    "reports/2026-08-10/midday/IB_Market_Data_2026-08-10_Midday.pdf",
  status: "completed" as const,
};

describe("persistArchivedReport", () => {
  it("uploads the PDF and inserts report, sections, claims, and file rows", async () => {
    const { client, state, upload } = createMockClient();
    const pdfBytes = new Uint8Array([37, 80, 68, 70]);

    const result = await persistArchivedReport(
      { ...baseInput, pdfBytes },
      client,
    );

    expect(result).toEqual({
      reportId: "rpt-1",
      storagePath: baseInput.archivePath,
      skippedUpload: false,
    });
    expect(upload).toHaveBeenCalledWith(
      baseInput.archivePath,
      pdfBytes,
      expect.objectContaining({
        contentType: "application/pdf",
        upsert: true,
      }),
    );
    expect(state.reports).toHaveLength(1);
    expect(state.reports[0]).toMatchObject({
      firm_id: baseInput.firmId,
      report_run_id: "run-1",
      edition: "midday",
      title: document.title,
      status: "completed",
    });
    expect(state.reports[0]?.canonical_json).toBe(document);
    expect(state.sections.length).toBe(document.sections.length);
    expect(state.sections[0]).toMatchObject({
      report_id: "rpt-1",
      section_key: document.sections[0]?.sectionKey,
      body_markdown: document.sections[0]?.body,
      sort_order: 0,
    });
    expect(state.claims.length).toBe(document.claims.length);
    expect(state.claims[0]).toMatchObject({
      report_id: "rpt-1",
      causal_status: "unclear",
      materiality: document.claims[0]?.material ? "material" : "immaterial",
    });
    expect(state.files).toEqual([
      expect.objectContaining({
        report_id: "rpt-1",
        file_type: "pdf",
        storage_path: baseInput.archivePath,
        content_type: "application/pdf",
        byte_size: 4,
      }),
    ]);
  });

  it("updates an existing reports row for the same run instead of inserting a duplicate", async () => {
    const { client, state } = createMockClient();
    const pdfBytes = new Uint8Array([37, 80, 68, 70]);

    const first = await persistArchivedReport(
      { ...baseInput, pdfBytes, status: "partial" },
      client,
    );
    const second = await persistArchivedReport(
      {
        ...baseInput,
        pdfBytes,
        status: "completed",
        document: { ...document, title: "Updated title" },
      },
      client,
    );

    expect(first.reportId).toBe(second.reportId);
    expect(state.reports).toHaveLength(1);
    expect(state.reports[0]).toMatchObject({
      id: first.reportId,
      title: "Updated title",
      status: "completed",
    });
    expect(state.claims.length).toBe(document.claims.length);
    expect(state.files).toHaveLength(1);
  });

  it("skips storage upload when PDF bytes are missing", async () => {
    const { client, state, upload } = createMockClient();

    const result = await persistArchivedReport(baseInput, client);

    expect(result.skippedUpload).toBe(true);
    expect(upload).not.toHaveBeenCalled();
    expect(state.reports).toHaveLength(1);
    expect(state.files).toHaveLength(0);
  });
});
