import {
  handleRouteError,
  jsonError,
  jsonOk,
  fixturesEnabled,
} from "@/lib/api/http";
import { requirePermission } from "@/lib/auth/authorize";
import { getFixtureReport } from "@/lib/fixtures/reports";
import { getLiveReportJob, isLiveReportsAvailable } from "@/lib/reports/live-reports";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    await requirePermission("viewReports");
    const { id } = await context.params;
    if (fixturesEnabled()) {
      const report = getFixtureReport(id);
      if (!report) return jsonError("Report not found", 404);
      return jsonOk(
        report.job ?? {
          id: `job-for-${id}`,
          status: report.status,
          stage: report.status,
          updatedAt: report.completedAt ?? new Date().toISOString(),
        },
      );
    }
    if (!isLiveReportsAvailable()) {
      return jsonError(
        "Report job storage is not connected in this environment.",
        503,
      );
    }
    const job = await getLiveReportJob(id);
    if (!job) return jsonError("Report not found", 404);
    return jsonOk(job);
  } catch (error) {
    return handleRouteError(error);
  }
}
