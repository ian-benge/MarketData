import { jsonOk } from "@/lib/api/http";

export async function GET() {
  return jsonOk({
    ok: true,
    service: "fnip",
    time: new Date().toISOString(),
  });
}
