import {
  fixturesEnabled,
  handleRouteError,
  jsonError,
  jsonOk,
  verifyCronSecret,
} from "@/lib/api/http";
import { getEnv } from "@/lib/env";
import { generateBookRisk, generateSessionBrief } from "@/lib/desk-intel/generate";
import { loadCronDeskPack } from "@/lib/desk-intel/context";
import { scheduleUnexplainedBookAlerts } from "@/lib/desk-intel/book-alerts";
import { DEFAULT_FIRM_UUID } from "@/lib/reports/editions";
import { saveBrief } from "@/lib/desk-intel/store";

export const maxDuration = 60;

export async function GET(request: Request) {
  return POST(request);
}

export async function POST(request: Request) {
  try {
    if (!verifyCronSecret(request)) {
      return jsonError("Unauthorized", 401);
    }
    if (fixturesEnabled()) {
      return jsonOk({ ok: true, mode: "demo", brief: "skipped" });
    }
    const env = getEnv();
    const pack = await loadCronDeskPack(env);
    const envelope = await generateSessionBrief(pack, { env });
    const firmId = env.FIRM_ID ?? DEFAULT_FIRM_UUID;
    await saveBrief(firmId, envelope, null);
    const risk = await generateBookRisk(pack, { env });
    await saveBrief(firmId, risk, null);
    scheduleUnexplainedBookAlerts({ firmId, pack, risk: risk.data });
    return jsonOk({
      ok: true,
      method: envelope.method,
      evidenceHash: envelope.evidenceHash,
      warnings: envelope.warnings.map((row) => row.code),
      newsEvents: pack.events.length,
      calendarItems: pack.calendar.length,
      bookUnexplained: risk.data.items.filter((item) => item.kind === "unexplained_move")
        .length,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
