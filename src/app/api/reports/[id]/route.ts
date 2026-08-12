import {
  handleRouteError,
  jsonError,
  jsonOk,
  fixturesEnabled,
} from "@/lib/api/http";
import { requirePermission } from "@/lib/auth/authorize";
import { getFixtureReport } from "@/lib/fixtures/reports";
import { getLiveReport, isLiveReportsAvailable } from "@/lib/reports/live-reports";

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
      return jsonOk(report);
    }
    if (!isLiveReportsAvailable()) {
      return jsonError(
        "Report storage is not connected in this environment.",
        503,
      );
    }
    const report = await getLiveReport(id);
    if (!report) return jsonError("Report not found", 404);
    return jsonOk(report);
  } catch (error) {
    return handleRouteError(error);
  }
}
