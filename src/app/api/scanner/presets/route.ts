import { handleRouteError, jsonError, jsonOk } from "@/lib/api/http";
import { requirePermission } from "@/lib/auth/authorize";
import {
  deleteUserPreset,
  listUserPresets,
  saveUserPreset,
} from "@/lib/scanner/store";
import type { ScannerLayout, ScannerSystem } from "@/lib/scanner/types";

export async function GET() {
  try {
    const user = await requirePermission("viewDashboard");
    if (!user.firmId) return jsonOk({ presets: [], persistence: "unavailable" });
    const presets = await listUserPresets(user.id, user.firmId);
    return jsonOk({ presets, persistence: "supabase" });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requirePermission("viewDashboard");
    if (!user.firmId) {
      return jsonError("Saved presets require a connected firm workspace.", 503);
    }
    const body = (await request.json().catch(() => null)) as {
      name?: string;
      system?: ScannerSystem;
      layout?: ScannerLayout;
    } | null;
    if (!body?.name || !body.layout || (body.system !== "desk" && body.system !== "momentum")) {
      return jsonError("name, system, and layout are required", 400);
    }
    const preset = await saveUserPreset({
      userId: user.id,
      firmId: user.firmId,
      name: body.name,
      system: body.system,
      layout: body.layout,
    });
    if (!preset) return jsonError("Could not persist the preset.", 503);
    return jsonOk({ preset });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await requirePermission("viewDashboard");
    if (!user.firmId) return jsonError("Saved presets require a connected firm workspace.", 503);
    const id = new URL(request.url).searchParams.get("id");
    if (!id) return jsonError("id is required", 400);
    const ok = await deleteUserPreset({ id, userId: user.id, firmId: user.firmId });
    if (!ok) return jsonError("Could not delete the preset.", 400);
    return jsonOk({ ok: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
