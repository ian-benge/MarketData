import { handleRouteError, jsonError, jsonOk } from "@/lib/api/http";
import { requirePermission } from "@/lib/auth/authorize";
import { resolvePersistenceMode } from "@/lib/positions/store";
import { loadBrokerageSnapshot } from "@/lib/brokerage/sync";
import { FEATURED_BROKERS } from "@/lib/brokerage/types";

export async function GET() {
  try {
    const user = await requirePermission("viewDashboard");
    const persistence = resolvePersistenceMode(user);
    const snapshot = await loadBrokerageSnapshot(user, user.id);
    return jsonOk({
      ...snapshot,
      persistence,
      brokers: FEATURED_BROKERS,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST() {
  return jsonError(
    "Use /api/brokerage/connect, /api/brokerage/sync, or /api/brokerage/history.",
    405,
  );
}
