import type { Env } from "@/lib/env";

export const DEFAULT_GATEWAY_FAST = "google/gemini-3.7-flash";
export const DEFAULT_GATEWAY_STRONG = "anthropic/claude-sonnet-5";
export const DEFAULT_GATEWAY_FALLBACKS = [
  "anthropic/claude-sonnet-5",
  "google/gemini-3.7-flash",
] as const;

export function gatewayConfigured(env?: Pick<Env, "AI_GATEWAY_API_KEY">): boolean {
  if (env?.AI_GATEWAY_API_KEY) return true;
  // OIDC is valid on Vercel runtimes. A leftover local VERCEL_OIDC_TOKEN from
  // `vercel env pull` is not a working credential and just burns latency.
  return Boolean(
    process.env.VERCEL === "1" && process.env.VERCEL_OIDC_TOKEN,
  );
}

export function fastGatewayModel(env: Env): string {
  return env.DESK_INTEL_MODEL_FAST || DEFAULT_GATEWAY_FAST;
}

export function strongGatewayModel(env: Env): string {
  return env.DESK_INTEL_MODEL_STRONG || DEFAULT_GATEWAY_STRONG;
}

export function hasProviderAiKeys(env: Env): boolean {
  return Boolean(env.ANTHROPIC_API_KEY || env.GOOGLE_GENERATIVE_AI_API_KEY);
}

export function hasAnyAiCredentials(env: Env): boolean {
  return gatewayConfigured(env) || hasProviderAiKeys(env);
}

export function deskIntelEnabled(env: Env): boolean {
  return env.DESK_INTEL_ENABLED !== false;
}
