import { z } from "zod";

const boolFromEnv = z
  .union([z.boolean(), z.enum(["true", "false", "1", "0"])])
  .optional()
  .transform((value) => {
    if (value === undefined) return false;
    if (typeof value === "boolean") return value;
    return value === "true" || value === "1";
  });

/** Treat blank env strings as unset (Playwright overrides .env.local this way). */
const emptyToUndefined = (value: unknown) =>
  value === "" || value === null || value === undefined ? undefined : value;

const optionalUrl = z.preprocess(emptyToUndefined, z.string().url().optional());
const optionalString = z.preprocess(emptyToUndefined, z.string().optional());
const optionalEmail = z.preprocess(
  emptyToUndefined,
  z.string().email().optional(),
);

export const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  CRON_SECRET: optionalString,
  /** HMAC for teammate-unlock cookies. Do not reuse CRON_SECRET or the service role. */
  OWNER_UNLOCK_SIGNING_SECRET: optionalString,
  /** Desk unlock secret. Never the teammate login password. */
  OWNER_UNLOCK_SECRET: optionalString,

  ALLOW_MOCK_PROVIDERS: boolFromEnv,
  DEMO_MODE: boolFromEnv,

  NEXT_PUBLIC_SUPABASE_URL: optionalUrl,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: optionalString,
  SUPABASE_SERVICE_ROLE_KEY: optionalString,
  BOOTSTRAP_ADMIN_EMAIL: optionalEmail,

  FINNHUB_API_KEY: optionalString,
  /** Free Alpha Vantage key — secondary earnings calendar only. */
  ALPHA_VANTAGE_API_KEY: optionalString,
  FRED_API_KEY: optionalString,
  /**
   * Optional CME FedWatch REST bearer (OAuth). When set, /forecasts/latest is
   * preferred over the public ZQ-implied path. Host is allowlisted.
   */
  CME_FEDWATCH_ACCESS_TOKEN: optionalString,
  CME_FEDWATCH_API_BASE: optionalUrl,
  NEWS_RSS_FEEDS: optionalString,
  EDGAR_USER_AGENT: optionalString,

  /** Market-data routing / licensing (realtime core). */
  MARKET_DATA_PRIMARY: z
    .enum(["alpaca", "massive", "finnhub", "mock"])
    .default("alpaca"),
  MARKET_DATA_FALLBACK: z
    .enum(["massive", "finnhub", "none"])
    .default("none"),
  MARKET_DATA_LICENSE_SCOPE: z
    .enum([
      "single_user_development",
      "internal_team",
      "redistributable",
    ])
    .default("single_user_development"),
  MARKET_DATA_LICENSE_ACKNOWLEDGED: boolFromEnv,
  MARKET_DATA_REFRESH_OPEN_SECONDS: z.coerce.number().int().positive().default(60),
  MARKET_DATA_REFRESH_EXTENDED_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(120),
  MARKET_DATA_REFRESH_CLOSED_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(300),
  MARKET_DATA_STALE_AFTER_SECONDS: z.coerce.number().int().positive().default(180),
  MARKET_DATA_MAX_UNIVERSE_SIZE: z.coerce.number().int().positive().default(80),

  ALPACA_DATA_KEY_ID: optionalString,
  ALPACA_DATA_SECRET_KEY: optionalString,
  ALPACA_STOCK_FEED: z.enum(["iex", "sip"]).default("iex"),
  /** Fixed Alpaca Market Data API host — do not override to arbitrary URLs in callers. */
  ALPACA_DATA_BASE_URL: z
    .string()
    .url()
    .default("https://data.alpaca.markets"),

  MASSIVE_API_KEY: optionalString,
  /**
   * Massive (formerly Polygon.io) REST host.
   * Documented stock endpoints live under https://api.massive.com (e.g. /v2/snapshot/...).
   * Override only for approved mirrors; keep SSRF-safe fixed host in adapters.
   */
  MASSIVE_API_BASE_URL: z.string().url().default("https://api.massive.com"),

  OPENAI_API_KEY: optionalString,
  OPENAI_MODEL: z.string().default("gpt-4.1-mini"),
  ANTHROPIC_API_KEY: optionalString,
  ANTHROPIC_MODEL: z.string().default("claude-sonnet-4-20250514"),
  GOOGLE_GENERATIVE_AI_API_KEY: optionalString,
  GEMINI_MODEL: z.string().default("gemini-2.0-flash"),
  AI_DEFAULT_PROVIDER: z
    .enum(["openai", "anthropic", "gemini"])
    .default("openai"),
  AI_GATEWAY_API_KEY: optionalString,
  DESK_INTEL_MODEL_FAST: z.string().default("google/gemini-3.7-flash"),
  DESK_INTEL_MODEL_STRONG: z.string().default("anthropic/claude-sonnet-5"),
  DESK_INTEL_ENABLED: z
    .union([z.boolean(), z.enum(["true", "false", "1", "0"])])
    .optional()
    .transform((value) => {
      if (value === undefined) return true;
      if (typeof value === "boolean") return value;
      return value === "true" || value === "1";
    }),
  DESK_INTEL_IN_FIXTURES: boolFromEnv,

  RESEND_API_KEY: optionalString,
  EMAIL_FROM: optionalString,

  /** SnapTrade Commercial API — read-only brokerage linking. Never expose to the client. */
  SNAPTRADE_CLIENT_ID: optionalString,
  SNAPTRADE_CONSUMER_KEY: optionalString,

  STORAGE_BUCKET: z.string().default("reports"),

  FIRM_ID: z.preprocess(emptyToUndefined, z.string().uuid().optional()),
});

export type Env = z.infer<typeof envSchema>;

let cachedEnv: Env | null = null;

export function getEnv(overrides?: NodeJS.ProcessEnv): Env {
  if (cachedEnv && !overrides) {
    return cachedEnv;
  }
  const parsed = envSchema.parse(overrides ?? process.env);
  if (!overrides) {
    cachedEnv = parsed;
  }
  return parsed;
}

/** Test helper — clears the cached env between cases. */
export function resetEnvCache(): void {
  cachedEnv = null;
}

export function mocksAllowed(env: Env = getEnv()): boolean {
  return env.NODE_ENV !== "production" && env.ALLOW_MOCK_PROVIDERS === true;
}
