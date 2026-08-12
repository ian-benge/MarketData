import {
  createConfiguredReportPipeline,
  createReportJobStore,
  loadFirmRecipients,
  resolveFirmId,
} from "@/lib/reports/run-on-demand";
import { SupabaseReportJobStore } from "@/lib/reports/supabase-job-store";
import { canCreateAdminClient, createAdminClient } from "@/lib/supabase/admin";
import { getEnv } from "@/lib/env";
import { fixturesEnabled } from "@/lib/api/http";
import {
  getDueEditions,
  type DueEdition,
} from "@/lib/scheduling/chicago-schedule";

export { createReportJobStore, loadFirmRecipients, resolveFirmId };

export async function enqueueDueReportRuns(now = new Date()) {
  const due = getDueEditions(now, { firmId: resolveFirmId() });
  if (fixturesEnabled()) {
    return {
      considered: due.length || 3,
      enqueued: 0,
      skipped: due.length || 3,
      editions: [] as DueEdition["edition"][],
      notes: ["Demo cron tick — no live enqueue"],
      due,
    };
  }

  if (!canCreateAdminClient()) {
    return {
      considered: due.length,
      enqueued: 0,
      skipped: 0,
      editions: [] as DueEdition["edition"][],
      notes: ["Scheduler service not wired — missing Supabase service role"],
      due,
    };
  }

  const store = new SupabaseReportJobStore(createAdminClient());
  const notes: string[] = [];
  const editions: DueEdition["edition"][] = [];
  let enqueued = 0;
  let skipped = 0;

  for (const item of due) {
    const before = await store.createRun({
      firmId: resolveFirmId(),
      edition: item.edition,
      tradingDate: item.tradingDate,
      idempotencyKey: item.idempotencyKey,
      scheduleVersion: item.scheduleVersion,
      scheduledAt: item.scheduledAt.toISOString(),
      collectAfter: item.collectAt.toISOString(),
      publishAfter: item.publishAfter.toISOString(),
      sessionCloseAt: item.sessionCloseAt.toISOString(),
      calendarKind: item.calendarKind,
    });
    const createdNow =
      Date.parse(before.createdAt) >= now.getTime() - 5_000 &&
      before.status === "queued" &&
      !before.startedAt;
    if (createdNow) {
      enqueued += 1;
      editions.push(item.edition);
      notes.push(`enqueue ${item.idempotencyKey} (${item.phase})`);
    } else {
      skipped += 1;
      notes.push(`skip duplicate ${item.idempotencyKey}`);
    }
  }

  if (due.length === 0) {
    notes.push("no editions due (weekend/holiday or outside grace window)");
  }

  return {
    considered: due.length,
    enqueued,
    skipped,
    editions,
    notes,
    due,
  };
}

export async function advanceActiveReportRuns(now = new Date()) {
  if (fixturesEnabled()) {
    return {
      continued: 0,
      completed: 0,
      failed: 0,
      heldForPublish: 0,
      notes: ["Demo worker — no active jobs"],
    };
  }
  if (!canCreateAdminClient()) {
    return {
      continued: 0,
      completed: 0,
      failed: 0,
      heldForPublish: 0,
      notes: ["Worker service not wired — missing Supabase service role"],
    };
  }

  const store = createReportJobStore();
  const active = (await store.listActiveRuns?.()) ?? [];
  if (active.length === 0) {
    return {
      continued: 0,
      completed: 0,
      failed: 0,
      heldForPublish: 0,
      notes: ["no active report runs"],
    };
  }

  const recipients = await loadFirmRecipients(resolveFirmId());
  const skipEmail =
    recipients.length === 0 || !getEnv().RESEND_API_KEY;
  const { pipeline } = createConfiguredReportPipeline({ store, skipEmail });
  let continued = 0;
  let completed = 0;
  let failed = 0;
  let heldForPublish = 0;
  const notes: string[] = [];
  if (skipEmail) {
    notes.push("no active team recipients — PDF/archive only, email skipped");
  }

  for (const run of active) {
    continued += 1;
    const result = await pipeline.run({
      firmId: run.firmId,
      edition: run.edition,
      tradingDate: run.tradingDate,
      idempotencyKey: run.idempotencyKey,
      publishAfter: run.publishAfter,
      collectAfter: run.collectAfter,
      scheduledAt: run.scheduledAt,
      sessionCloseAt: run.sessionCloseAt,
      calendarKind: run.calendarKind,
      scheduleVersion: run.scheduleVersion,
      now,
      recipients: skipEmail ? undefined : recipients,
      archiveUrlBase: `${getEnv().NEXT_PUBLIC_APP_URL}/reports`,
    });
    if (
      result.run.status === "completed" ||
      result.run.status === "partial"
    ) {
      completed += 1;
    } else if (result.run.status === "failed") {
      failed += 1;
    } else {
      heldForPublish += 1;
      notes.push(`held ${run.idempotencyKey} until publish_after`);
    }
  }

  return { continued, completed, failed, heldForPublish, notes };
}
