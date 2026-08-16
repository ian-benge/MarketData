import { jsonOk } from "@/lib/api/http";

export async function GET() {
  return jsonOk({
    ok: true,
    service: "ib-market-data",
    time: new Date().toISOString(),
  });
}
