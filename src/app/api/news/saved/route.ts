import { handleRouteError, jsonError, jsonOk } from "@/lib/api/http";
import { requirePermission } from "@/lib/auth/authorize";
import {
  deleteSavedNewsSearch,
  listSavedNewsSearches,
  saveNewsSearch,
} from "@/lib/intelligence/saved-searches";

export async function GET() {
  try {
    const user = await requirePermission("viewDashboard");
    if (!user.firmId) {
      return jsonOk({ searches: [], persistence: "unavailable" });
    }
    const searches = await listSavedNewsSearches(user.id, user.firmId);
    return jsonOk({ searches, persistence: "supabase" });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requirePermission("viewDashboard");
    if (!user.firmId) {
      return jsonError("Saved searches require a connected firm workspace.", 503);
    }
    const body = (await request.json().catch(() => null)) as {
      name?: string;
      query?: string;
      filters?: Record<string, unknown>;
    } | null;
    const name = body?.name?.trim();
    const query = body?.query?.trim();
    if (!name || !query) return jsonError("name and query are required", 400);
    const saved = await saveNewsSearch({
      userId: user.id,
      firmId: user.firmId,
      name,
      query,
      filters: body?.filters,
    });
    if (!saved) return jsonError("Could not persist the saved search.", 503);
    return jsonOk({ search: saved });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await requirePermission("viewDashboard");
    if (!user.firmId) return jsonError("Saved searches require a connected firm workspace.", 503);
    const url = new URL(request.url);
    const id = url.searchParams.get("id");
    if (!id) return jsonError("id is required", 400);
    const ok = await deleteSavedNewsSearch({
      id,
      userId: user.id,
      firmId: user.firmId,
    });
    if (!ok) return jsonError("Could not delete the saved search.", 400);
    return jsonOk({ ok: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
