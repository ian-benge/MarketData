import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { EmailProvider } from "@/lib/providers/interfaces";
import type {
  DeliveryResult,
  EmailRecipient,
  ReportEmailRequest,
  TransactionalEmailRequest,
} from "@/lib/providers/types";
import { assertMockProvidersAllowed } from "./assert-mock";

/**
 * Writes each message to tmp/email-outbox/ and logs a console summary.
 */
export class MockEmailProvider implements EmailProvider {
  private readonly outboxDir: string;

  constructor(outboxDir = path.join(process.cwd(), "tmp", "email-outbox")) {
    assertMockProvidersAllowed("MockEmailProvider");
    this.outboxDir = outboxDir;
  }

  async sendReport(request: ReportEmailRequest): Promise<DeliveryResult> {
    return this.writeMessages(request.recipients, {
      subject: request.subject,
      edition: request.edition,
      tradingDate: request.tradingDate,
      archiveUrl: request.archiveUrl,
      headlineSummary: request.headlineSummary,
      status: request.status,
      dataCutoff: request.dataCutoff,
      hasPdf: Boolean(request.pdfPath || request.pdfBytesBase64),
      reportId: request.reportId,
    });
  }

  async sendTransactional(
    request: TransactionalEmailRequest,
  ): Promise<DeliveryResult> {
    return this.writeMessages(request.recipients, {
      subject: request.subject,
      html: request.html,
      text: request.text,
    });
  }

  private async writeMessages(
    recipients: EmailRecipient[],
    payload: Record<string, unknown>,
  ): Promise<DeliveryResult> {
    await mkdir(this.outboxDir, { recursive: true });
    const messageIds: string[] = [];
    const errors: DeliveryResult["errors"] = [];
    let succeeded = 0;
    let failed = 0;

    for (const recipient of recipients) {
      const messageId = `mock-email-${String(payload.reportId ?? "note")}-${recipient.userId}-${Date.now()}`;
      const fileName = `${messageId}.json`;
      try {
        await writeFile(
          path.join(this.outboxDir, fileName),
          JSON.stringify(
            {
              messageId,
              to: recipient.email,
              sourceQuality: "mock",
              coverageNotes: "DEMO email outbox — not delivered externally.",
              ...payload,
            },
            null,
            2,
          ),
          "utf8",
        );
        messageIds.push(messageId);
        succeeded += 1;
        console.info(
          `[MockEmailProvider] wrote ${fileName} → ${recipient.email}`,
        );
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
      providerName: "mock-email",
      messageIds,
      attempted: recipients.length,
      succeeded,
      failed,
      errors,
    };
  }
}
