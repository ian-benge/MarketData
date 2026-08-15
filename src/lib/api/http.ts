import { NextResponse } from "next/server";
import { AuthError } from "@/lib/auth/session";
import { TeamAccessError } from "@/lib/auth/team-error";
import { getEnv } from "@/lib/env";
import { isDemoAuthEnabled } from "@/lib/auth/demo";
import { PositionBookError } from "@/lib/positions/books";
import { CoverageError } from "@/lib/watchlists/symbols";
import { BrokerageError } from "@/lib/brokerage/errors";

export function jsonOk<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, { status: 200, ...init });
}

export function jsonError(message: string, status: number, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: message, ...extra }, { status });
}

export function handleRouteError(error: unknown) {
  if (error instanceof AuthError) {
    return jsonError(error.message, error.status);
  }
  if (error instanceof PositionBookError) {
    return jsonError(error.message, error.status);
  }
  if (error instanceof CoverageError) {
    return jsonError(error.message, error.status);
  }
  if (error instanceof BrokerageError) {
    return jsonError(error.message, error.status);
  }
  if (error instanceof TeamAccessError) {
    return jsonError(error.message, error.status);
  }
  console.error(error);
  return jsonError("Internal server error", 500);
}

/** True when demo/mock mode should serve fixture payloads (not a React hook). */
export function fixturesEnabled(): boolean {
  return isDemoAuthEnabled();
}

export function verifyCronSecret(request: Request): boolean {
  const env = getEnv();
  const expected = env.CRON_SECRET;
  if (!expected) {
    // In demo/local without CRON_SECRET, allow only when mocks/demo enabled.
    return fixturesEnabled();
  }
  const header = request.headers.get("authorization");
  if (header === `Bearer ${expected}`) return true;
  const cronHeader = request.headers.get("x-cron-secret");
  return cronHeader === expected;
}
