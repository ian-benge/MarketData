import { after } from "next/server";
import { fixturesEnabled } from "@/lib/api/http";
import { getEnv, mocksAllowed } from "@/lib/env";
import { loadFirmRecipients } from "@/lib/email/recipients";
import { createProviders } from "@/lib/providers/registry";
import type { DeliveryResult, TransactionalEmailRequest } from "@/lib/providers/types";
import { formatSignedPercent } from "@/lib/utils/format";
import { bookAlertEmailDisabled } from "@/lib/email/policy";
import { uniqueRecipients } from "@/lib/positions/alerts";
import { firmIdFor, loadBrief, saveBrief } from "./store";
import type { BookRisk, DeskIntelEnvelope, EvidencePack } from "./types";

export const BOOK_ALERT_PROMPT_VERSION = "book-alert@v1";
export const BOOK_ALERT_HASH = "unexplained-book";

export type BookAlertDeps = {
  loadRecipients?: typeof loadFirmRecipients;
  send?: (request: TransactionalEmailRequest) => Promise<DeliveryResult>;
  alreadySent?: (subject: string) => Promise<boolean>;
  markSent?: (envelope: DeskIntelEnvelope<BookRisk>) => Promise<void>;
  appUrl?: string;
  now?: Date;
};

export function alertSubjectFor(ticker: string, now = new Date()): string {
  return `alert:${ticker.toUpperCase()}:${now.toISOString().slice(0, 10)}`;
}

export function unexplainedBookItems(risk: BookRisk) {
  return risk.items.filter(
    (item) =>
      item.kind === "unexplained_move" &&
      item.severity === "high" &&
      item.ticker !== "BOOK",
  );
}

export function buildBookAlertMessage(input: {
  ticker: string;
  changePercent: number | null | undefined;
  note: string;
  appUrl: string;
}): { subject: string; html: string; text: string } {
  const pct =
    input.changePercent != null && Number.isFinite(input.changePercent)
      ? formatSignedPercent(input.changePercent)
      : "n/a";
  const subject = `${input.ticker} unexplained book move ${pct}`;
  const whyUrl = `${input.appUrl.replace(/\/$/, "")}/news?q=${encodeURIComponent(`why is ${input.ticker} moving today`)}`;
  const bookUrl = `${input.appUrl.replace(/\/$/, "")}/positions`;
  const html = `<div style="font-family:'IBM Plex Sans',Segoe UI,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.45;color:#18181b">
  <p style="margin:0 0 6px;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#71717a">IB Market Data · Desk intelligence</p>
  <p style="margin:0 0 16px">${escapeHtml(input.ticker)} is in the book and ${escapeHtml(pct)} with no verified catalyst in the current evidence window.</p>
  <p style="margin:0 0 16px;color:#52525b">${escapeHtml(input.note)}</p>
  <p style="margin:0 0 16px"><a href="${escapeHtml(whyUrl)}">Why is ${escapeHtml(input.ticker)} moving?</a> · <a href="${escapeHtml(bookUrl)}">Open blotter</a></p>
  <p style="margin:0;font-size:12px;color:#71717a">This is a tape alert, not a research briefing. Unknown stays unknown — do not invent a story.</p>
</div>`;
  const text = [
    subject,
    `${input.ticker} is in the book and ${pct} with no verified catalyst.`,
    input.note,
    `Why: ${whyUrl}`,
    `Blotter: ${bookUrl}`,
  ].join("\n\n");
  return { subject, html, text };
}

export async function notifyUnexplainedBookMoves(input: {
  firmId?: string | null;
  pack: EvidencePack;
  risk: BookRisk;
  deps?: BookAlertDeps;
}): Promise<{ sent: string[]; skipped: string[] }> {
  const env = getEnv();
  const sent: string[] = [];
  const skipped: string[] = [];
  if (bookAlertEmailDisabled()) return { sent, skipped: ["disabled"] };
  if (fixturesEnabled() && !input.deps?.send) return { sent, skipped: ["demo"] };
  if (!input.deps?.send && !env.RESEND_API_KEY && !mocksAllowed(env)) {
    return { sent, skipped: ["email-unconfigured"] };
  }
  const firmId = firmIdFor(input.firmId);
  const items = unexplainedBookItems(input.risk);
  if (!items.length) return { sent, skipped: ["none"] };

  const deps = input.deps ?? {};
  const now = deps.now ?? new Date();
  const loadRecipients = deps.loadRecipients ?? loadFirmRecipients;
  const recipients = uniqueRecipients(await loadRecipients(firmId));
  if (recipients.length === 0) return { sent, skipped: ["no-recipients"] };

  const send =
    deps.send ??
    ((request: TransactionalEmailRequest) =>
      createProviders().email.sendTransactional(request));
  const appUrl = deps.appUrl ?? env.NEXT_PUBLIC_APP_URL;

  for (const item of items) {
    const subject = alertSubjectFor(item.ticker, now);
    const already =
      deps.alreadySent ??
      (async (key: string) => {
        const row = await loadBrief({
          firmId,
          kind: "book_risk",
          subject: key,
          evidenceHash: BOOK_ALERT_HASH,
          promptVersion: BOOK_ALERT_PROMPT_VERSION,
        });
        return Boolean(row);
      });
    if (await already(subject)) {
      skipped.push(`${item.ticker}:already`);
      continue;
    }
    const message = buildBookAlertMessage({
      ticker: item.ticker,
      changePercent: item.changePercent,
      note: item.note,
      appUrl,
    });
    try {
      const delivery = await send({
        subject: message.subject,
        html: message.html,
        text: message.text,
        recipients,
      });
      if (!delivery.ok) {
        skipped.push(`${item.ticker}:send-failed`);
        continue;
      }
      const envelope: DeskIntelEnvelope<BookRisk> = {
        kind: "book_risk",
        subject,
        method: "rules",
        model: null,
        providerName: null,
        promptVersion: BOOK_ALERT_PROMPT_VERSION,
        evidenceHash: BOOK_ALERT_HASH,
        generatedAt: now.toISOString(),
        cached: false,
        warnings: [],
        sources: input.pack.sources,
        data: {
          headline: message.subject,
          items: [item],
          gaps: [],
        },
      };
      if (deps.markSent) await deps.markSent(envelope);
      else await saveBrief(firmId, envelope, null);
      sent.push(item.ticker);
    } catch (error) {
      console.error("[desk-intel] book alert failed", item.ticker, error);
      skipped.push(`${item.ticker}:error`);
    }
  }
  return { sent, skipped };
}

export function scheduleUnexplainedBookAlerts(input: {
  firmId?: string | null;
  pack: EvidencePack;
  risk: BookRisk;
}): void {
  if (bookAlertEmailDisabled()) return;
  const task = async () => {
    const result = await notifyUnexplainedBookMoves(input);
    if (result.sent.length || result.skipped.some((row) => !row.endsWith("none") && !row.endsWith("already"))) {
      console.info("[desk-intel] book alerts", result);
    }
  };
  try {
    after(task);
  } catch {
    void task();
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
