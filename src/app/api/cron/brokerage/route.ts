import {
  fixturesEnabled,
  handleRouteError,
  jsonError,
  jsonOk,
} from "@/lib/api/http";
import { isSnapTradeConfigured } from "@/lib/brokerage/client";
import { authorizeBrokerageCron } from "@/lib/brokerage/cron-auth";
import { syncAllLinkedBrokerageHoldings } from "@/lib/brokerage/jobs";
import { isUsEquityMonitorWindow } from "@/lib/scheduling/chicago-schedule";

export const maxDuration = 120;

export async function GET(request: Request) {
  return POST(request);
}

export async function POST(request: Request) {
  try {
    if (!(await authorizeBrokerageCron(request))) {
      return jsonError("Unauthorized", 401);
    }
    if (fixturesEnabled()) {
      return jsonOk({ ok: true, skipped: "fixtures" });
    }
    if (!isSnapTradeConfigured()) {
      return jsonOk({ ok: true, skipped: "unconfigured" });
    }
    if (!isUsEquityMonitorWindow()) {
      return jsonOk({ ok: true, skipped: "session-closed" });
    }
    const result = await syncAllLinkedBrokerageHoldings({ refresh: true });
    console.info("[brokerage] cron sync", result);
    return jsonOk({ ok: true, ...result });
  } catch (error) {
    return handleRouteError(error);
  }
}
