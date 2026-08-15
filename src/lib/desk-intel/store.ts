import {
  canCreateAdminClient,
  createAdminClient,
} from "@/lib/supabase/admin";
import { DEFAULT_FIRM_UUID } from "@/lib/reports/editions";
import type { DeskIntelEnvelope, DeskIntelKind } from "./types";

type BriefRow = {
  firm_id: string;
  kind: DeskIntelKind;
  subject: string;
  evidence_hash: string;
  prompt_version: string;
  method: string;
  model: string | null;
  provider_name: string | null;
  output: unknown;
  grounding: unknown;
  sources: unknown;
  created_at: string;
};

export function firmIdFor(userFirmId?: string | null): string {
  return userFirmId || DEFAULT_FIRM_UUID;
}

export async function loadBrief<T>(input: {
  firmId: string;
  kind: DeskIntelKind;
  subject: string;
  evidenceHash: string;
  promptVersion?: string;
}): Promise<DeskIntelEnvelope<T> | null> {
  if (!canCreateAdminClient()) return null;
  try {
    const supabase = createAdminClient();
    let query = supabase
      .from("desk_intelligence_briefs")
      .select(
        "kind, subject, evidence_hash, prompt_version, method, model, provider_name, output, grounding, sources, created_at",
      )
      .eq("firm_id", input.firmId)
      .eq("kind", input.kind)
      .eq("subject", input.subject)
      .eq("evidence_hash", input.evidenceHash);
    if (input.promptVersion) {
      query = query.eq("prompt_version", input.promptVersion);
    }
    const { data, error } = await query.maybeSingle();
    if (error || !data) return null;
    const row = data as BriefRow;
    const grounding = (row.grounding ?? {}) as { warnings?: DeskIntelEnvelope<T>["warnings"] };
    return {
      kind: row.kind,
      subject: row.subject,
      method: row.method === "model" ? "model" : "rules",
      model: row.model,
      providerName: row.provider_name,
      promptVersion: row.prompt_version,
      evidenceHash: row.evidence_hash,
      generatedAt: row.created_at,
      cached: true,
      warnings: grounding.warnings ?? [],
      sources: Array.isArray(row.sources)
        ? (row.sources as DeskIntelEnvelope<T>["sources"])
        : [],
      data: row.output as T,
    };
  } catch (error) {
    console.error("[desk-intel] loadBrief", error);
    return null;
  }
}

export async function saveBrief<T>(
  firmId: string,
  envelope: DeskIntelEnvelope<T>,
  createdBy?: string | null,
): Promise<void> {
  if (!canCreateAdminClient()) return;
  try {
    const supabase = createAdminClient();
    const { error } = await supabase.from("desk_intelligence_briefs").upsert(
      {
        firm_id: firmId,
        kind: envelope.kind,
        subject: envelope.subject,
        evidence_hash: envelope.evidenceHash,
        prompt_version: envelope.promptVersion,
        method: envelope.method,
        model: envelope.model,
        provider_name: envelope.providerName,
        output: envelope.data,
        grounding: { warnings: envelope.warnings },
        sources: envelope.sources,
        created_by: createdBy ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "firm_id,kind,subject,evidence_hash" },
    );
    if (error) {
      console.error("[desk-intel] saveBrief", error.message);
    }
  } catch (error) {
    console.error("[desk-intel] saveBrief", error);
  }
}

export async function recordUsage(input: {
  firmId: string;
  purpose: string;
  providerName: string;
  model: string | null;
  ok: boolean;
  latencyMs?: number;
  inputTokens?: number;
  outputTokens?: number;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  if (!canCreateAdminClient()) return;
  try {
    const supabase = createAdminClient();
    const { error } = await supabase.from("ai_usage_events").insert({
      firm_id: input.firmId,
      provider_name: input.providerName,
      model: input.model,
      purpose: input.purpose,
      input_tokens: input.inputTokens ?? null,
      output_tokens: input.outputTokens ?? null,
      latency_ms: input.latencyMs ?? null,
      metadata: {
        ok: input.ok,
        ...(input.metadata ?? {}),
      },
    });
    if (error) console.error("[desk-intel] recordUsage", error.message);
  } catch (error) {
    console.error("[desk-intel] recordUsage", error);
  }
}
