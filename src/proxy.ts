import { NextResponse, type NextRequest } from "next/server";
import {
  DEMO_ROLE_COOKIE,
  isDemoAuthEnabled,
  parseDemoRole,
} from "@/lib/auth/demo";
import { updateSession } from "@/lib/supabase/middleware";

/**
 * Next.js 16 file convention: `proxy` (replaces deprecated `middleware.ts`).
 * Protects authenticated app routes. Public: /login, /invite, /api/cron,
 * /api/health, /api/auth/demo, /api/brokerage/webhook, /denied
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isPublic =
    pathname.startsWith("/login") ||
    pathname.startsWith("/auth") ||
    pathname.startsWith("/invite") ||
    pathname.startsWith("/api/cron") ||
    pathname.startsWith("/api/health") ||
    pathname.startsWith("/api/brokerage/webhook") ||
    pathname.startsWith("/api/auth/demo") ||
    pathname.startsWith("/api/auth/invite") ||
    pathname.startsWith("/denied") ||
    pathname === "/";

  const isAppRoute =
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/archive") ||
    pathname.startsWith("/reports") ||
    pathname.startsWith("/watchlists") ||
    pathname.startsWith("/positions") ||
    pathname.startsWith("/proposals") ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/api/");

  if (isDemoAuthEnabled()) {
    const demoRole = parseDemoRole(request.cookies.get(DEMO_ROLE_COOKIE)?.value);
    if (isAppRoute && !isPublic && !demoRole) {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("next", pathname);
      return NextResponse.redirect(url);
    }
    return NextResponse.next({ request });
  }

  const { response, user } = await updateSession(request);

  if (isAppRoute && !isPublic && !user) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
