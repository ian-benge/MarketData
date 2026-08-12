import { nanoid } from "nanoid";
import { AiOrchestration } from "@/lib/ai/orchestration";
import { fixturesEnabled } from "@/lib/api/http";
import { getEnv, type Env } from "@/lib/env";
import { createProviders } from "@/lib/providers/registry";
import { persistArchivedReport } from "@/lib/reports/archive-store";
import { DEFAULT_FIRM_UUID, type ReportEdition } from "@/lib/reports/editions";
import { MemoryReportJobStore, type ReportJobStore } from "@/lib/reports/job-store";
import { ReportPipeline } from "@/lib/reports/pipeline";
import { SupabaseReportJobStore } from "@/lib/reports/supabase-job-store";
import { chicagoDateString } from "@/lib/scheduling/chicago-schedule";
import { canCreateAdminClient, createAdminClient } from "@/lib/supabase/admin";

export type FirmRecipient = { userId: string; email: string; name?: string };

export function resolveFirmId(): string {
  return getEnv().FIRM_ID ?? DEFAULT_FIRM_UUID;
}

export function createReportJobStore(): ReportJobStore {
  if (canCreateAdminClient()) {
    return new SupabaseReportJobStore(createAdminClient());
  }
  return new MemoryReportJobStore();
}

export async function loadFirmRecipients(firmId: string): Promise<FirmRecipient[]> {
  if (!canCreateAdminClient()) return [];
  const client = createAdminClient();
  const { data, error } = await client
    .from("team_memberships")
    .select("user_id, profiles(email, display_name)")
    .eq("firm_id", firmId)
    .eq("is_active", true);
  if (error || !data) return [];

  const recipients: FirmRecipient[] = [];
  for (const row of data) {
    const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
    const email =
      profile && typeof profile === "object" && "email" in profile
        ? String((profile as { email?: string }).email ?? "")
        : "";
    if (!email) continue;
    const name =
      profile && typeof profile === "object" && "display_name" in profile
        ? (profile as { display_name?: string | null }).display_name
        : undefined;
    recipients.push({
      userId: String(row.user_id),
      email,
      name: name ?? undefined,
    });
  }
  return recipients;
}

export function hasLiveAiKeys(env: Env = getEnv()): boolean {
  return Boolean(
    env.OPENAI_API_KEY ||
      env.ANTHROPIC_API_KEY ||
      env.GOOGLE_GENERATIVE_AI_API_KEY,
  );
}

export function shouldUseMockAi(
  env: Env = getEnv(),
  usingMocksAi?: boolean,
): boolean {
  return fixturesEnabled() || !hasLiveAiKeys(env) || Boolean(usingMocksAi);
}

export function createConfiguredReportPipeline(options: {
  store: ReportJobStore;
  skipEmail: boolean;
}): { pipeline: ReportPipeline; usedMockAi: boolean } {
  const providers = createProviders();
  const usedMockAi = shouldUseMockAi(getEnv(), providers.usingMocks.ai);
  const persist =
    canCreateAdminClient()
      ? async (input: Parameters<typeof persistArchivedReport>[0]) => {
          const result = await persistArchivedReport(input);
          return { reportId: result.reportId, archivePath: result.storagePath };
        }
      : undefined;

  const pipeline = new ReportPipeline({
    store: options.store,
    providers: {
      marketData: providers.marketData,
      news: providers.news,
      email: providers.email,
      ai: providers.ai,
    },
    orchestration: new AiOrchestration({ useMock: usedMockAi }),
    skipEmail: options.skipEmail,
    persistArchive: persist,
  });

  return { pipeline, usedMockAi };
}

export type OnDemandReportResult = {
  id: string;
  runId: string;
  status: string;
  demo: false;
  archivePath?: string;
  message: string;
};

function onDemandMessage(args: {
  status: string;
  usedMockAi: boolean;
  errorMessage?: string;
}): string {
  if (args.status === "failed") {
    return (
      args.errorMessage ??
      "Report generation failed. The job was recorded so it can be retried."
    );
  }
  if (args.usedMockAi) {
    if (args.status === "completed" || args.status === "partial") {
      return "Brief completed with mock drafting (no live AI keys configured). Prices and archive used the live pipeline.";
    }
    return "Report queued with mock drafting (no live AI keys configured). Prices and archive use the live pipeline.";
  }
  if (args.status === "completed" || args.status === "partial") {
    return "Brief completed and archived.";
  }
  return "Report request accepted and is running through the live pipeline.";
}

export async function runOnDemandReport(input: {
  edition: ReportEdition;
  now?: Date;
}): Promise<OnDemandReportResult> {
  const now = input.now ?? new Date();
  const firmId = resolveFirmId();
  const store = createReportJobStore();
  const tradingDate = chicagoDateString(now);
  const scheduledAt = now.toISOString();
  const recipients = await loadFirmRecipients(firmId);
  const skipEmail =
    recipients.length === 0 || !getEnv().RESEND_API_KEY;
  const { pipeline, usedMockAi } = createConfiguredReportPipeline({
    store,
    skipEmail,
  });

  const result = await pipeline.run({
    firmId,
    edition: input.edition,
    tradingDate,
    idempotencyKey: `on_demand:${firmId}:${tradingDate}:${input.edition}:${nanoid()}`,
    collectAfter: scheduledAt,
    publishAfter: scheduledAt,
    scheduledAt,
    now,
    useFixtures: fixturesEnabled(),
    recipients: skipEmail ? undefined : recipients,
    archiveUrlBase: `${getEnv().NEXT_PUBLIC_APP_URL}/reports`,
  });

  const runId = result.run.id;
  const status = result.run.status;
  const id = result.reportId ?? runId;
  return {
    id,
    runId,
    status,
    demo: false,
    archivePath: result.archivePath,
    message: onDemandMessage({
      status,
      usedMockAi,
      errorMessage: result.run.errorMessage,
    }),
  };
}
