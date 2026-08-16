import type { SupabaseClient } from "@supabase/supabase-js";
import { getEnv } from "@/lib/env";
import type {
  ReportDocumentModel,
  ReportSourceRef,
} from "@/lib/reports/content-builder";
import type { ReportEdition } from "@/lib/reports/editions";
import { canCreateAdminClient, createAdminClient } from "@/lib/supabase/admin";

export type PersistArchivedReportInput = {
  firmId: string;
  runId: string;
  edition: ReportEdition;
  tradingDate: string;
  document: ReportDocumentModel;
  pdfBytes?: Uint8Array;
  archivePath: string;
  status: "completed" | "partial";
};

export type PersistArchivedReportResult = {
  reportId: string;
  storagePath: string;
  skippedUpload: boolean;
};

function throwIfError(
  error: { message: string } | null,
  context: string,
): void {
  if (error) throw new Error(`${context}: ${error.message}`);
}

/**
 * Upload the PDF and upsert archive rows. Throws only on real DB/storage
 * failures (or when no service-role client can be created and none was passed).
 */
export async function persistArchivedReport(
  input: PersistArchivedReportInput,
  client?: SupabaseClient,
): Promise<PersistArchivedReportResult> {
  const admin =
    client ?? (canCreateAdminClient() ? createAdminClient() : null);
  if (!admin) {
    throw new Error(
      "Archive persist requires a Supabase service-role client (NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY).",
    );
  }

  const storagePath = input.archivePath;
  const pdfBytes = input.pdfBytes;
  const skippedUpload = !pdfBytes || pdfBytes.byteLength === 0;

  if (!skippedUpload && pdfBytes) {
    const bucket = getEnv().STORAGE_BUCKET;
    const { error: uploadError } = await admin.storage
      .from(bucket)
      .upload(storagePath, pdfBytes, {
        contentType: "application/pdf",
        upsert: true,
      });
    throwIfError(uploadError, "Storage upload failed");
  }

  const reportFields = {
    firm_id: input.firmId,
    report_run_id: input.runId,
    edition: input.edition,
    trading_date: input.tradingDate,
    title: input.document.title,
    executive_summary: input.document.executiveSummary,
    status: input.status,
    published_at: new Date().toISOString(),
    canonical_json: input.document,
  };

  const { data: existing, error: lookupError } = await admin
    .from("reports")
    .select("id")
    .eq("report_run_id", input.runId)
    .maybeSingle();
  throwIfError(lookupError, "Failed to look up archived report");

  let reportId: string;
  if (existing?.id) {
    const { error: updateError } = await admin
      .from("reports")
      .update(reportFields)
      .eq("id", existing.id);
    throwIfError(updateError, "Failed to update archived report");
    reportId = String(existing.id);
  } else {
    const { data: inserted, error: insertError } = await admin
      .from("reports")
      .insert(reportFields)
      .select("id")
      .single();
    throwIfError(insertError, "Failed to insert archived report");
    if (!inserted?.id) {
      throw new Error("Failed to insert archived report: missing id");
    }
    reportId = String(inserted.id);
  }

  const sectionRows = input.document.sections.map((section, index) => ({
    report_id: reportId,
    section_key: section.sectionKey,
    title: section.title,
    body_markdown: section.body,
    sort_order: index,
  }));
  if (sectionRows.length > 0) {
    const { error: sectionError } = await admin
      .from("report_sections")
      .upsert(sectionRows, { onConflict: "report_id,section_key" });
    throwIfError(sectionError, "Failed to upsert report sections");
  }

  if (existing?.id) {
    const { error: deleteClaimsError } = await admin
      .from("report_claims")
      .delete()
      .eq("report_id", reportId);
    throwIfError(deleteClaimsError, "Failed to replace report claims");
  }
  const claimRows = input.document.claims.map((claim) => ({
    report_id: reportId,
    claim_text: claim.text,
    causal_status: "unclear" as const,
    materiality: claim.material ? "material" : "immaterial",
  }));
  let insertedClaims: Array<{ id: string; claim_text: string }> = [];
  if (claimRows.length > 0) {
    const { data: claimData, error: claimError } = await admin
      .from("report_claims")
      .insert(claimRows)
      .select("id, claim_text");
    throwIfError(claimError, "Failed to insert report claims");
    insertedClaims = (claimData ?? []) as Array<{
      id: string;
      claim_text: string;
    }>;
  }

  await persistReportCitations(admin, {
    firmId: input.firmId,
    document: input.document,
    insertedClaims,
  });

  if (!skippedUpload && pdfBytes) {
    const { error: fileError } = await admin.from("report_files").upsert(
      {
        report_id: reportId,
        file_type: "pdf",
        storage_path: storagePath,
        content_type: "application/pdf",
        byte_size: pdfBytes.byteLength,
      },
      { onConflict: "report_id,file_type" },
    );
    throwIfError(fileError, "Failed to upsert report file");
  }

  return { reportId, storagePath, skippedUpload };
}

async function resolveSourceDocumentId(
  admin: SupabaseClient,
  firmId: string,
  source: ReportSourceRef,
): Promise<string | null> {
  const url = source.url?.trim() || null;
  if (url) {
    const { data: existing, error: lookupError } = await admin
      .from("source_documents")
      .select("id")
      .eq("firm_id", firmId)
      .eq("url", url)
      .maybeSingle();
    throwIfError(lookupError, "Failed to look up source document");
    if (existing?.id) return String(existing.id);
  }

  const { data: inserted, error: insertError } = await admin
    .from("source_documents")
    .insert({
      firm_id: firmId,
      source_class: "news",
      title: source.title || source.id,
      url,
      metadata: { documentSourceId: source.id, publisher: source.publisher ?? null },
    })
    .select("id")
    .single();
  throwIfError(insertError, "Failed to insert source document");
  return inserted?.id ? String(inserted.id) : null;
}

async function persistReportCitations(
  admin: SupabaseClient,
  input: {
    firmId: string;
    document: ReportDocumentModel;
    insertedClaims: Array<{ id: string; claim_text: string }>;
  },
): Promise<void> {
  if (input.insertedClaims.length === 0) return;
  const sourceById = new Map(
    input.document.sources.map((source) => [source.id, source]),
  );
  const sourceDocIds = new Map<string, string>();
  const rows: Array<{
    claim_id: string;
    source_document_id: string;
    excerpt: string | null;
  }> = [];

  for (let index = 0; index < input.document.claims.length; index += 1) {
    const claim = input.document.claims[index];
    const persisted = input.insertedClaims[index];
    if (!claim || !persisted) continue;
    for (const sourceId of claim.sourceIds) {
      const source = sourceById.get(sourceId);
      if (!source) continue;
      let sourceDocumentId = sourceDocIds.get(source.id);
      if (!sourceDocumentId) {
        sourceDocumentId =
          (await resolveSourceDocumentId(admin, input.firmId, source)) ?? undefined;
        if (!sourceDocumentId) continue;
        sourceDocIds.set(source.id, sourceDocumentId);
      }
      rows.push({
        claim_id: persisted.id,
        source_document_id: sourceDocumentId,
        excerpt: claim.text.slice(0, 280),
      });
    }
  }

  if (rows.length === 0) return;
  const { error } = await admin.from("citations").insert(rows);
  throwIfError(error, "Failed to insert citations");
}
