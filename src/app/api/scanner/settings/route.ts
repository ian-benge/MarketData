import { handleRouteError, jsonError, jsonOk } from "@/lib/api/http";
import { requirePermission } from "@/lib/auth/authorize";
import { loadAlertSettings, saveAlertSettings } from "@/lib/scanner/store";
import { DEFAULT_ALERT_SETTINGS, type ScannerAlertSettings } from "@/lib/scanner/types";

export async function GET() {
  try {
    const user = await requirePermission("viewDashboard");
    if (!user.firmId) return jsonOk({ settings: DEFAULT_ALERT_SETTINGS, persistence: "unavailable" });
    const settings = await loadAlertSettings(user.id, user.firmId);
    return jsonOk({ settings, persistence: "supabase" });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PUT(request: Request) {
  try {
    const user = await requirePermission("viewDashboard");
    if (!user.firmId) return jsonError("Alert settings require a connected firm workspace.", 503);
    const body = (await request.json().catch(() => null)) as { settings?: ScannerAlertSettings } | null;
    if (!body?.settings) return jsonError("settings are required", 400);
    const settings = { ...DEFAULT_ALERT_SETTINGS, ...body.settings };
    const ok = await saveAlertSettings({
      userId: user.id,
      firmId: user.firmId,
      settings,
    });
    if (!ok) return jsonError("Could not persist alert settings.", 503);
    return jsonOk({ settings });
  } catch (error) {
    return handleRouteError(error);
  }
}
