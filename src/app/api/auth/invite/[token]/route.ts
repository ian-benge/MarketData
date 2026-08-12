import { NextResponse } from "next/server";
import { isDemoAuthEnabled } from "@/lib/auth/demo";

/**
 * Invite acceptance — demo stub. Live path will validate token_hash via Supabase.
 */
export async function POST(
  _request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;
  if (isDemoAuthEnabled()) {
    const url = new URL(
      "/login",
      process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
    );
    url.searchParams.set("invited", token);
    return NextResponse.redirect(url, 303);
  }
  return NextResponse.json(
    { error: "Invite acceptance not configured" },
    { status: 501 },
  );
}
