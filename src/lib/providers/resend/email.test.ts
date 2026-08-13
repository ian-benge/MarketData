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

  it("sends transactional alerts without a PDF", async () => {
    const send = vi.fn().mockResolvedValue({
      data: { id: "email-2" },
      error: null,
    });
    const client = { emails: { send } } as unknown as Resend;
    const provider = new ResendEmailProvider({
      apiKey: "test-key",
      from: "IB Market Data <reports@example.com>",
      client,
    });

    const result = await provider.sendTransactional({
      subject: "IB Market Data — Opened LONG 100 AAPL",
      html: "<p>Opened</p>",
      text: "Opened",
      recipients: [
        { userId: "user-1", email: "a@example.com" },
        { userId: "user-2", email: "b@example.com" },
      ],
    });

    expect(result.ok).toBe(true);
    expect(result.succeeded).toBe(2);
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[0]![0]).toMatchObject({
      subject: "IB Market Data — Opened LONG 100 AAPL",
      html: "<p>Opened</p>",
      text: "Opened",
      to: "a@example.com",
    });
    expect(send.mock.calls[0]![0].attachments).toBeUndefined();
  });

  it("keeps sending remaining recipients when one Resend call fails", async () => {
    const send = vi
      .fn()
      .mockResolvedValueOnce({
        error: { message: "bounce" },
      })
      .mockResolvedValueOnce({
        data: { id: "email-ok" },
        error: null,
      });
    const client = { emails: { send } } as unknown as Resend;
    const provider = new ResendEmailProvider({
      apiKey: "test-key",
      from: "IB Market Data <reports@example.com>",
      client,
    });

    const result = await provider.sendTransactional({
      subject: "IB Market Data — Closed LONG 50 AAPL",
      html: "<p>Closed</p>",
      recipients: [
        { userId: "user-1", email: "bad@example.com" },
        { userId: "user-2", email: "ok@example.com" },
      ],
    });

    expect(result.ok).toBe(false);
    expect(result.succeeded).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.errors[0]?.recipient).toBe("bad@example.com");
  });
});
