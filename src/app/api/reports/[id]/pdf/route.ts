import { handleRouteError, jsonError, fixturesEnabled } from "@/lib/api/http";
import { requirePermission } from "@/lib/auth/authorize";
import { demoReportDocument } from "@/lib/fixtures/demo-report";
import { getFixtureReport } from "@/lib/fixtures/reports";
import { reportPdfFilename } from "@/lib/reports/filenames";
import { getLiveReportPdf, isLiveReportsAvailable } from "@/lib/reports/live-reports";
import { renderReportPdf } from "@/lib/reports/pdf/render-pdf";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    await requirePermission("downloadReports");
    const { id } = await context.params;
    if (fixturesEnabled()) {
      const report = getFixtureReport(id);
      if (!report || !report.pdfAvailable) {
        return jsonError("PDF not available", 404);
      }

      const document = demoReportDocument(report.edition, report.tradingDate);
      const body = await renderReportPdf(document);

      return new Response(Buffer.from(body), {
        status: 200,
        headers: {
          "cache-control": "private, no-store",
          "content-type": "application/pdf",
          "content-disposition": `attachment; filename="${reportPdfFilename(report.tradingDate, report.edition)}"`,
        },
      });
    }

    if (!isLiveReportsAvailable()) {
      return jsonError(
        "Report storage is not connected in this environment.",
        503,
      );
    }

    const pdf = await getLiveReportPdf(id);
    if (!pdf) return jsonError("PDF not available", 404);

    return new Response(Buffer.from(pdf.bytes), {
      status: 200,
      headers: {
        "cache-control": "private, no-store",
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="${reportPdfFilename(pdf.tradingDate, pdf.edition)}"`,
      },
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
