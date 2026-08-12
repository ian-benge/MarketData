import { Resend } from "resend";
import type { EmailProvider } from "@/lib/providers/interfaces";
import type {
  DeliveryResult,
  ReportEmailRequest,
} from "@/lib/providers/types";
import { reportPdfFilename } from "@/lib/reports/filenames";

export type ResendEmailOptions = {
  apiKey: string;
  from: string;
  client?: Resend;
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
    const messageIds: string[] = [];
    const errors: DeliveryResult["errors"] = [];
    let succeeded = 0;
    let failed = 0;

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

    for (const recipient of request.recipients) {
      try {
        const attachments =
          request.pdfBytesBase64 != null
            ? [
                {
                  filename: reportPdfFilename(request.tradingDate, request.edition),
                  content: Buffer.from(request.pdfBytesBase64, "base64"),
                },
              ]
            : undefined;

        const result = await this.client.emails.send({
          from: this.from,
          to: recipient.email,
          subject: request.subject,
          html,
          attachments,
        });

        if (result.error) {
          failed += 1;
          errors.push({
            recipient: recipient.email,
            message: result.error.message,
          });
          continue;
        }

        if (result.data?.id) messageIds.push(result.data.id);
        succeeded += 1;
      } catch (err) {
        failed += 1;
        errors.push({
          recipient: recipient.email,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return {
      ok: failed === 0,
      providerName: "resend",
      messageIds,
      attempted: request.recipients.length,
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
