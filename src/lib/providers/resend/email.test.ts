import { describe, expect, it, vi } from "vitest";
import type { Resend } from "resend";
import { ResendEmailProvider } from "@/lib/providers/resend/email";

describe("ResendEmailProvider", () => {
  it("uses IB Market Data branding in the email footer and PDF filename", async () => {
    const send = vi.fn().mockResolvedValue({
      data: { id: "email-1" },
      error: null,
    });
    const client = { emails: { send } } as unknown as Resend;
    const provider = new ResendEmailProvider({
      apiKey: "test-key",
      from: "IB Market Data <reports@example.com>",
      client,
    });

    const result = await provider.sendReport({
      reportId: "report-1",
      edition: "close_postmarket",
      tradingDate: "2026-08-10",
      subject: "IB Market Data — Close Market Intelligence — 2026-08-10",
      recipients: [
        {
          userId: "user-1",
          email: "member@example.com",
        },
      ],
      archiveUrl: "https://example.com/archive/report-1",
      pdfBytesBase64: Buffer.from("fixture-pdf").toString("base64"),
      status: "completed",
    });

    expect(result.ok).toBe(true);
    expect(send).toHaveBeenCalledOnce();

    const message = send.mock.calls[0]![0] as {
      html: string;
      subject: string;
      attachments?: Array<{ filename: string }>;
    };
    expect(message.subject).toBe(
      "IB Market Data — Close Market Intelligence — 2026-08-10",
    );
    expect(message.html).toContain(">IB Market Data</p>");
    expect(message.attachments?.[0]?.filename).toBe(
      "IB_Market_Data_2026-08-10_Close_Postmarket.pdf",
    );
  });
});
