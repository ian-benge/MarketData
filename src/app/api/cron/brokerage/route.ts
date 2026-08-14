import {
  fixturesEnabled,
  handleRouteError,
  jsonError,
  jsonOk,
  verifyCronSecret,
} from "@/lib/api/http";
import { isSnapTradeConfigured } from "@/lib/brokerage/client";
import { syncAllLinkedBrokerageHoldings } from "@/lib/brokerage/jobs";
import { isUsEquityMonitorWindow } from "@/lib/scheduling/chicago-schedule";

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
      return jsonOk({ ok: true, skipped: "fixtures" });
    }
    if (!isSnapTradeConfigured()) {
      return jsonOk({ ok: true, skipped: "unconfigured" });
    }
    if (!isUsEquityMonitorWindow()) {
      return jsonOk({ ok: true, skipped: "session-closed" });
    }
    const result = await syncAllLinkedBrokerageHoldings();
    return jsonOk({ ok: true, ...result });
  } catch (error) {
    return handleRouteError(error);
  }
}
