import { after } from "next/server";
import { fixturesEnabled } from "@/lib/api/http";
import type { SessionUser } from "@/lib/auth/session";
import { getEnv, mocksAllowed } from "@/lib/env";
import { createProviders } from "@/lib/providers/registry";
import type {
  DeliveryResult,
  EmailRecipient,
  TransactionalEmailRequest,
} from "@/lib/providers/types";
import { loadFirmRecipients, type FirmRecipient } from "@/lib/email/recipients";
import { loadOwnerTradeEmailsById } from "@/lib/positions/trade-emails";
import {
  formatCurrency,
  formatPrice,
  formatQuantity,
  formatSignedCurrency,
  formatSignedPercent,
} from "@/lib/utils/format";
import { DEFAULT_BOOK_TITLE } from "./books";
import { holdingDays, notional, positionFees, signedPricePnl, signedReturnPercent } from "./math";
import type { PositionAssetType, PositionRecord } from "./types";

const ASSET_LABELS: Record<PositionAssetType, string> = {
  equity: "equity",
  etf: "ETF",
  option: "option",
  future: "future",
  crypto: "crypto",
  other: "position",
};

const UNIT_LABELS: Record<PositionAssetType, string> = {
  equity: "shares",
  etf: "shares",
  option: "contracts",
  future: "contracts",
  crypto: "units",
  other: "units",
};

export type PositionAlertKind = "opened" | "closed";

export type PositionAlertActor = {
  id: string;
  email: string;
  displayName: string | null;
};

export type PositionAlertInput = {
  kind: PositionAlertKind;
  actor: PositionAlertActor;
  position: PositionRecord;
  bookTitle: string;
  firmId: string;
  partial?: boolean;
  /** Fill or close size when it differs from the remaining/open lot. */
  fillQuantity?: number;
};

export type PositionAlertMessage = {
  subject: string;
  html: string;
  text: string;
};

export type PositionAlertNotifyResult = {
  skipped?: string;
  delivery?: DeliveryResult;
};

export type PositionAlertDeps = {
  loadRecipients?: (firmId: string) => Promise<FirmRecipient[]>;
  ownerAllowsTradeEmails?: (ownerId: string | null) => Promise<boolean>;
  send?: (request: TransactionalEmailRequest) => Promise<DeliveryResult>;
  appUrl?: string;
  emailConfigured?: boolean;
};

export function uniqueRecipients(
  recipients: FirmRecipient[],
): EmailRecipient[] {
  const seen = new Set<string>();
  const unique: EmailRecipient[] = [];
  for (const recipient of recipients) {
    const email = recipient.email.trim().toLowerCase();
    if (!email.includes("@") || seen.has(email)) continue;
    seen.add(email);
    unique.push({
      userId: recipient.userId,
      email,
      name: recipient.name?.trim() || undefined,
    });
  }
  return unique;
}

export function actorDisplayName(actor: PositionAlertActor): string {
  return actor.displayName?.trim() || actor.email.trim() || "A teammate";
}

function ownerDisplayName(
  position: PositionRecord,
  actor: PositionAlertActor,
  recipients: EmailRecipient[],
): string {
  const ownerId = position.createdBy;
  if (!ownerId || ownerId === actor.id) return actorDisplayName(actor);
  const owner = recipients.find((row) => row.userId === ownerId);
  return owner?.name?.trim() || owner?.email || "a teammate";
}

function bookLabel(
  input: PositionAlertInput,
  ownerName: string,
): string {
  const title = input.bookTitle.trim() || DEFAULT_BOOK_TITLE;
  if (input.position.createdBy && input.position.createdBy !== input.actor.id) {
    return `${ownerName} / ${title}`;
  }
  return title;
}

function formatLotDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(`${value.slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function unitWord(assetType: PositionAssetType, quantity: number): string {
  const plural = UNIT_LABELS[assetType];
  if (Math.abs(quantity - 1) < 1e-8) {
    if (plural === "shares") return "share";
    if (plural === "contracts") return "contract";
    if (plural === "units") return "unit";
  }
  return plural;
}

function quantityAmount(
  assetType: PositionAssetType,
  quantity: number,
): string {
  return `${formatQuantity(quantity)} ${unitWord(assetType, quantity)}`;
}

function eventQuantity(input: PositionAlertInput): number {
  const fill = input.fillQuantity;
  if (fill != null && Number.isFinite(fill) && fill > 0) return fill;
  return input.position.quantity;
}

function lotHeadline(position: PositionRecord): string {
  return `${position.side.toUpperCase()} ${position.ticker}`;
}

function realizedPnl(position: PositionRecord): number | null {
  if (position.status !== "closed" || position.closePrice == null) return null;
  const gross = signedPricePnl(
    position.closePrice,
    position.entryPrice,
    position.quantity,
    position.multiplier,
    position.side,
  );
  if (gross == null) return null;
  return gross - positionFees(position);
}

function realizedPercent(position: PositionRecord): number | null {
  if (position.status !== "closed" || position.closePrice == null) return null;
  return signedReturnPercent(
    position.closePrice,
    position.entryPrice,
    position.side,
  );
}

function pnlColor(value: number | null): string {
  if (value == null || !Number.isFinite(value) || value === 0) return "#52525b";
  return value > 0 ? "#0f7b3a" : "#b42318";
}

export function buildPositionAlert(
  input: PositionAlertInput,
  options: { appUrl: string; recipients?: EmailRecipient[] } = {
    appUrl: "http://localhost:3000",
  },
): PositionAlertMessage {
  const recipients = options.recipients ?? [];
  const actorName = actorDisplayName(input.actor);
  const ownerName = ownerDisplayName(input.position, input.actor, recipients);
  const book = bookLabel(input, ownerName);
  const asset = ASSET_LABELS[input.position.assetType];
  const qty = eventQuantity(input);
  const qtyLabel = quantityAmount(input.position.assetType, qty);
  const lot = lotHeadline(input.position);
  const blotterUrl = `${options.appUrl.replace(/\/$/, "")}/positions`;
  const opened = input.kind === "opened";
  const verb = opened ? "opened" : input.partial ? "partially closed" : "closed";
  const subjectLot = `${input.position.side.toUpperCase()} ${qtyLabel} ${input.position.ticker}`;
  const subject = opened
    ? `${actorName} — Opened ${subjectLot}`
    : `${actorName} — Closed ${subjectLot}${input.partial ? " (partial)" : ""}`;

  const pnl = opened ? null : realizedPnl(input.position);
  const pnlPct = opened ? null : realizedPercent(input.position);
  const held = opened
    ? null
    : holdingDays(input.position, input.position.closeDate ?? input.position.closedAt ?? "");

  const units = notional(input.position.quantity, input.position.multiplier);
  const cost =
    units != null && Number.isFinite(input.position.entryPrice)
      ? units * input.position.entryPrice
      : null;
  const rows: Array<[string, string, string?]> = [
    ["Lot", lot],
    ["Quantity", qtyLabel],
    ["Book", book],
    ["Asset", asset],
  ];
  if (
    input.fillQuantity != null &&
    Number.isFinite(input.fillQuantity) &&
    Math.abs(input.fillQuantity - input.position.quantity) > 1e-8
  ) {
    rows.push([
      "Position",
      quantityAmount(input.position.assetType, input.position.quantity),
    ]);
  }
  rows.push([
    "Entry",
    `${formatPrice(input.position.entryPrice, input.position.ticker)} on ${formatLotDate(input.position.entryDate)}`,
  ]);
  if (cost != null) {
    rows.push(["Cost basis", formatCurrency(cost)]);
  }
  if (input.position.multiplier !== 1) {
    rows.push(["Multiplier", formatQuantity(input.position.multiplier)]);
  }
  if (!opened) {
    rows.push([
      "Exit",
      `${formatPrice(input.position.closePrice, input.position.ticker)} on ${formatLotDate(input.position.closeDate)}`,
    ]);
    rows.push([
      "Realized",
      `${formatSignedCurrency(pnl)}  (${formatSignedPercent(pnlPct)})`,
      pnlColor(pnl),
    ]);
    if (held != null) {
      rows.push(["Held", held === 1 ? "1 day" : `${held} days`]);
    }
  }
  if (input.position.strategy?.trim()) {
    rows.push(["Strategy", input.position.strategy.trim()]);
  }
  if (input.position.notes?.trim()) {
    rows.push(["Notes", truncate(input.position.notes.trim(), 280)]);
  }

  const positionNote =
    input.fillQuantity != null &&
    Number.isFinite(input.fillQuantity) &&
    Math.abs(input.fillQuantity - input.position.quantity) > 1e-8
      ? ` Position is now ${quantityAmount(input.position.assetType, input.position.quantity)}.`
      : "";
  const summary = `${actorName} ${verb} ${qtyLabel} of ${input.position.ticker} (${input.position.side} ${asset}) in ${book}.${positionNote}`;
  const htmlRows = rows
    .map(
      ([label, value, color]) =>
        `<tr>
          <td style="padding:4px 16px 4px 0;color:#71717a;white-space:nowrap;vertical-align:top">${escapeHtml(label)}</td>
          <td style="padding:4px 0;color:${color ?? "#18181b"};font-variant-numeric:tabular-nums">${escapeHtml(value)}</td>
        </tr>`,
    )
    .join("");

  const html = `<div style="font-family:'IBM Plex Sans',Segoe UI,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.45;color:#18181b">
  <p style="margin:0 0 6px;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#71717a">IB Market Data</p>
  <p style="margin:0 0 16px">${escapeHtml(summary)}</p>
  <table style="border-collapse:collapse;margin:0 0 16px">${htmlRows}</table>
  <p style="margin:0 0 16px"><a href="${escapeHtml(blotterUrl)}">Open blotter</a></p>
  <p style="margin:0;font-size:12px;color:#71717a">Sent to every active member. This is a desk tape alert, not a research briefing.</p>
</div>`;

  const textRows = rows.map(([label, value]) => `${label}: ${value}`).join("\n");
  const text = [
    subject,
    summary,
    textRows,
    `Open blotter: ${blotterUrl}`,
  ].join("\n\n");

  return { subject, html, text };
}

export function shouldSendPositionAlert(
  user: Pick<SessionUser, "isDemo" | "firmId">,
  env = getEnv(),
): string | null {
  if (user.isDemo || fixturesEnabled()) return "demo";
  if (!user.firmId) return "no-firm";
  if (!env.RESEND_API_KEY && !mocksAllowed(env)) return "email-unconfigured";
  return null;
}

export function preparePositionAlert(
  user: SessionUser,
  kind: PositionAlertKind,
  position: PositionRecord,
  extra: {
    partial?: boolean;
    bookTitle?: string | null;
    fillQuantity?: number;
  } = {},
): PositionAlertInput | null {
  if (shouldSendPositionAlert(user)) return null;
  if (!user.firmId) return null;

  return {
    kind,
    actor: {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
    },
    position,
    bookTitle: extra.bookTitle?.trim() || DEFAULT_BOOK_TITLE,
    firmId: user.firmId,
    partial: extra.partial,
    fillQuantity: extra.fillQuantity,
  };
}

export async function notifyPositionChange(
  input: PositionAlertInput,
  deps: PositionAlertDeps = {},
): Promise<PositionAlertNotifyResult> {
  const env = getEnv();
  const emailConfigured =
    deps.emailConfigured ??
    Boolean(env.RESEND_API_KEY || mocksAllowed(env));
  if (!emailConfigured) return { skipped: "email-unconfigured" };

  const ownerAllows =
    deps.ownerAllowsTradeEmails ?? loadOwnerTradeEmailsById;
  const tradeEmailsOn = await ownerAllows(input.position.createdBy);
  if (!tradeEmailsOn) return { skipped: "trade-emails-off" };

  const loadRecipients = deps.loadRecipients ?? loadFirmRecipients;
  const recipients = uniqueRecipients(await loadRecipients(input.firmId));
  if (recipients.length === 0) return { skipped: "no-recipients" };

  const appUrl = deps.appUrl ?? env.NEXT_PUBLIC_APP_URL;
  const message = buildPositionAlert(input, { appUrl, recipients });
  const send =
    deps.send ??
    ((request: TransactionalEmailRequest) =>
      createProviders().email.sendTransactional(request));

  try {
    const delivery = await send({
      subject: message.subject,
      html: message.html,
      text: message.text,
      recipients,
    });
    if (!delivery.ok) {
      console.error("[positions] alert delivery incomplete", {
        kind: input.kind,
        ticker: input.position.ticker,
        failed: delivery.failed,
      });
    } else {
      console.info("[positions] alert sent", {
        kind: input.kind,
        ticker: input.position.ticker,
        recipients: delivery.succeeded,
      });
    }
    return { delivery };
  } catch (error) {
    console.error("[positions] alert failed", error);
    return { skipped: "send-error" };
  }
}

export function schedulePositionAlert(input: PositionAlertInput | null): void {
  if (!input) return;
  const task = async () => {
    const result = await notifyPositionChange(input);
    if (result.skipped) {
      console.info("[positions] alert skipped", {
        reason: result.skipped,
        kind: input.kind,
        ticker: input.position.ticker,
      });
    }
  };
  try {
    after(task);
  } catch {
    void task();
  }
}

function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
