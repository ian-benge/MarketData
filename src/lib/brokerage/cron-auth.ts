import { verifyCronSecret } from "@/lib/api/http";
import { canCreateAdminClient, createAdminClient } from "@/lib/supabase/admin";

function bearerToken(request: Request): string {
  const header = request.headers.get("authorization")?.trim() ?? "";
  if (/^Bearer\s+/i.test(header)) return header.replace(/^Bearer\s+/i, "").trim();
  return request.headers.get("x-cron-secret")?.trim() ?? "";
}

export async function authorizeBrokerageCron(request: Request): Promise<boolean> {
  if (verifyCronSecret(request)) return true;
  const provided = bearerToken(request);
  if (!provided || !canCreateAdminClient()) return false;
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("verify_brokerage_cron_secret", {
    provided,
  });
  return !error && data === true;
}
