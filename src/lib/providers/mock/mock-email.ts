import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { EmailProvider } from "@/lib/providers/interfaces";
import type {
  DeliveryResult,
  ReportEmailRequest,
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
    await mkdir(this.outboxDir, { recursive: true });
    const messageIds: string[] = [];
    const errors: DeliveryResult["errors"] = [];
    let succeeded = 0;
    let failed = 0;

    for (const recipient of request.recipients) {
      const messageId = `mock-email-${request.reportId}-${recipient.userId}-${Date.now()}`;
      const fileName = `${messageId}.json`;
      const payload = {
        messageId,
        to: recipient.email,
        subject: request.subject,
        edition: request.edition,
        tradingDate: request.tradingDate,
        archiveUrl: request.archiveUrl,
        headlineSummary: request.headlineSummary,
        status: request.status,
        dataCutoff: request.dataCutoff,
        hasPdf: Boolean(request.pdfPath || request.pdfBytesBase64),
        sourceQuality: "mock" as const,
        coverageNotes: "DEMO email outbox — not delivered externally.",
      };

      try {
        await writeFile(
          path.join(this.outboxDir, fileName),
          JSON.stringify(payload, null, 2),
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
      attempted: request.recipients.length,
      succeeded,
      failed,
      errors,
    };
  }
}
