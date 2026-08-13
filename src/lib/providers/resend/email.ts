import { Resend } from "resend";
import type { EmailProvider } from "@/lib/providers/interfaces";
import type {
  DeliveryResult,
  EmailRecipient,
  ReportEmailRequest,
  TransactionalEmailRequest,
} from "@/lib/providers/types";
import { reportPdfFilename } from "@/lib/reports/filenames";

export type ResendEmailOptions = {
  apiKey: string;
  from: string;
  client?: Resend;
};

type HtmlMail = {
  subject: string;
  html: string;
  text?: string;
  recipients: EmailRecipient[];
  attachments?: Array<{ filename: string; content: Buffer }>;
};

export class ResendEmailProvider implements EmailProvider {
  private readonly client: Resend;
  private readonly from: string;

  constructor(options: ResendEmailOptions) {
    if (!options.apiKey) {
      throw new Error("ResendEmailProvider requires apiKey");
    }
    if (!options.from) {
      throw new Error("ResendEmailProvider requires from address");
    }
    this.client = options.client ?? new Resend(options.apiKey);
    this.from = options.from;
  }

  async sendReport(request: ReportEmailRequest): Promise<DeliveryResult> {
    const statusLabel =
      request.status === "partial" ? "PARTIAL" : "COMPLETED";
    const html = [
      `<p><strong>${statusLabel}</strong> — ${request.edition} edition for ${request.tradingDate}</p>`,
      request.headlineSummary
        ? `<p>${escapeHtml(request.headlineSummary)}</p>`
        : "",
      request.dataCutoff
        ? `<p>Data cutoff: ${escapeHtml(request.dataCutoff)}</p>`
        : "",
      `<p><a href="${escapeHtml(request.archiveUrl)}">Open archive report</a></p>`,
      `<p style="color:#666;font-size:12px">IB Market Data</p>`,
    ].join("\n");

    return this.sendHtmlMail({
      subject: request.subject,
      html,
      recipients: request.recipients,
      attachments:
        request.pdfBytesBase64 != null
          ? [
              {
                filename: reportPdfFilename(
                  request.tradingDate,
                  request.edition,
                ),
                content: Buffer.from(request.pdfBytesBase64, "base64"),
              },
            ]
          : undefined,
    });
  }

  async sendTransactional(
    request: TransactionalEmailRequest,
  ): Promise<DeliveryResult> {
    return this.sendHtmlMail(request);
  }

  private async sendHtmlMail(mail: HtmlMail): Promise<DeliveryResult> {
    const outcomes = await Promise.all(
      mail.recipients.map(async (recipient) => {
        try {
          const result = await this.client.emails.send({
            from: this.from,
            to: recipient.email,
            subject: mail.subject,
            html: mail.html,
            text: mail.text,
            attachments: mail.attachments,
          });
          if (result.error) {
            return {
              ok: false as const,
              recipient: recipient.email,
              message: result.error.message,
            };
          }
          return {
            ok: true as const,
            recipient: recipient.email,
            messageId: result.data?.id,
          };
        } catch (err) {
          return {
            ok: false as const,
            recipient: recipient.email,
            message: err instanceof Error ? err.message : String(err),
          };
        }
      }),
    );

    const messageIds: string[] = [];
    const errors: DeliveryResult["errors"] = [];
    let succeeded = 0;
    let failed = 0;
    for (const outcome of outcomes) {
      if (outcome.ok) {
        succeeded += 1;
        if (outcome.messageId) messageIds.push(outcome.messageId);
      } else {
        failed += 1;
        errors.push({
          recipient: outcome.recipient,
          message: outcome.message,
        });
      }
    }

    return {
      ok: failed === 0,
      providerName: "resend",
      messageIds,
      attempted: mail.recipients.length,
      succeeded,
      failed,
      errors,
    };
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
