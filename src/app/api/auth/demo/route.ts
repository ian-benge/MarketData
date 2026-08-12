import { NextResponse } from "next/server";
import { z } from "zod";
import { DEMO_ROLE_COOKIE, isDemoAuthEnabled } from "@/lib/auth/demo";

const BodySchema = z.object({
  role: z.enum(["admin", "member"]),
});

export async function POST(request: Request) {
  if (!isDemoAuthEnabled()) {
    return NextResponse.json({ error: "Demo auth disabled" }, { status: 403 });
  }

  const body = BodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const response = NextResponse.json({ ok: true, role: body.data.role });
  response.cookies.set(DEMO_ROLE_COOKIE, body.data.role, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(DEMO_ROLE_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}
