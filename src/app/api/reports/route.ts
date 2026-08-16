import { nanoid } from "nanoid";
import { z } from "zod";
import {
  handleRouteError,
  jsonError,
  jsonOk,
  fixturesEnabled,
} from "@/lib/api/http";
import { requirePermission } from "@/lib/auth/authorize";
import { listFixtureReports } from "@/lib/fixtures/reports";
import { ReportEditionSchema } from "@/lib/reports/editions";
import { isLiveReportsAvailable, listLiveReports } from "@/lib/reports/live-reports";
import { resolveFirmId, runOnDemandReport } from "@/lib/reports/run-on-demand";
import { onDemandBriefsAllowed } from "@/lib/scheduling/chicago-schedule";
import { canCreateAdminClient } from "@/lib/supabase/admin";

const PostSchema = z.object({
  edition: ReportEditionSchema.default("midday"),
  reason: z.string().optional(),
});

export async function GET(request: Request) {
  try {
    const user = await requirePermission("viewReports");
    const url = new URL(request.url);
    const filters = {
      q: url.searchParams.get("q") ?? undefined,
      edition: url.searchParams.get("edition") ?? undefined,
      from: url.searchParams.get("from") ?? undefined,
      to: url.searchParams.get("to") ?? undefined,
    };
    if (fixturesEnabled()) {
      return jsonOk({ reports: listFixtureReports(filters) });
    }
    if (isLiveReportsAvailable()) {
      return jsonOk({
        reports: await listLiveReports(filters, resolveFirmId(user.firmId)),
      });
    }
    return jsonOk({ reports: [] });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    await requirePermission("generateOnDemandReport");
    if (fixturesEnabled()) {
      const parsed = PostSchema.safeParse(
        await request.json().catch(() => ({})),
      );
      if (!parsed.success) return jsonError("Invalid body", 400);

      const id = `rpt-demo-ondemand-${nanoid(10)}`;
      return jsonOk({
        id,
        status: "queued",
        edition: parsed.data.edition,
        demo: true,
        message: "Demo report request accepted for this fixture session only.",
      });
    }

    if (!canCreateAdminClient()) {
      return jsonError(
        "Report generation is not connected in this environment.",
        503,
      );
    }

    if (!onDemandBriefsAllowed(new Date())) {
      return jsonError(
        "On-demand briefs are disabled when the US equity session is closed (weekend or holiday). Use the next session’s scheduled editions.",
        409,
      );
    }

    const parsed = PostSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) return jsonError("Invalid body", 400);

    const result = await runOnDemandReport({ edition: parsed.data.edition });
    const payload = {
      id: result.id,
      runId: result.runId,
      status: result.status,
      edition: parsed.data.edition,
      demo: false as const,
      archivePath: result.archivePath,
      message: result.message,
    };
    if (result.status === "failed") {
      return jsonError(result.message, 500, payload);
    }
    return jsonOk(payload);
  } catch (error) {
    return handleRouteError(error);
  }
}
