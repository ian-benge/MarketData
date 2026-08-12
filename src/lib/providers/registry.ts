import type { Env } from "@/lib/env";
import { getEnv, mocksAllowed } from "@/lib/env";
import type {
  AiProvider,
  CorporateEventsProvider,
  EmailProvider,
  MacroDataProvider,
  MarketDataProvider,
  NewsProvider,
  SchedulerAdapter,
} from "@/lib/providers/interfaces";
import {
  MockAiProvider,
  MockCorporateEventsProvider,
  MockEmailProvider,
  MockMacroDataProvider,
  MockMarketDataProvider,
  MockNewsProvider,
  MockSchedulerAdapter,
} from "@/lib/providers/mock";
import { FinnhubMarketDataProvider } from "@/lib/providers/finnhub/market-data";
import { FinnhubNewsProvider } from "@/lib/providers/finnhub/news";
import { FredMacroDataProvider } from "@/lib/providers/fred/macro";
import {
  createEdgarUserAgent,
  EdgarCorporateEventsProvider,
} from "@/lib/providers/edgar/corporate";
import { ResendEmailProvider } from "@/lib/providers/resend/email";
import { RssNewsProvider } from "@/lib/providers/rss/news";
import { CompositeNewsProvider } from "@/lib/providers/rss/composite-news";
import { InProcessSchedulerAdapter } from "@/lib/scheduling/in-process-scheduler";
import { createAiOrchestration } from "@/lib/ai/orchestration";
import { createRoutedMarketDataProvider } from "@/lib/market-data/router";

export type ProviderCategory =
  "market_data" | "news" | "macro" | "corporate" | "ai" | "email" | "scheduler";

export type SourceClass = "primary" | "secondary";

export type ProviderHealthStatus =
  "healthy" | "degraded" | "down" | "unknown" | "disabled";

export type RateLimitConfig = {
  maxRequestsPerMinute: number;
  maxRequestsPerDay?: number;
  burst?: number;
};

export type RetryPolicy = {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
};

export type SourceRegistryEntry = {
  id: string;
  name: string;
  category: ProviderCategory;
  enabled: boolean;
  priority: number;
  sourceClass: SourceClass;
  health: ProviderHealthStatus;
  latencyMsP50?: number;
  lastSuccessAt?: string | null;
  lastErrorAt?: string | null;
  lastErrorMessage?: string | null;
  rateLimit: RateLimitConfig;
  retry: RetryPolicy;
  requiresEnv?: string[];
  notes?: string;
};

const DEFAULT_RETRY: RetryPolicy = {
  maxAttempts: 3,
  baseDelayMs: 500,
  maxDelayMs: 8_000,
};

export function createDefaultSourceRegistry(): SourceRegistryEntry[] {
  return [
    {
      id: "alpaca",
      name: "Alpaca Market Data",
      category: "market_data",
      enabled: true,
      priority: 5,
      sourceClass: "primary",
      health: "unknown",
      rateLimit: { maxRequestsPerMinute: 200, maxRequestsPerDay: 200_000 },
      retry: DEFAULT_RETRY,
      requiresEnv: ["ALPACA_DATA_KEY_ID", "ALPACA_DATA_SECRET_KEY"],
      notes:
        "Realtime IEX (default) or SIP when entitled — never label IEX as SIP/NBBO/full_market",
    },
    {
      id: "massive",
      name: "Massive",
      category: "market_data",
      enabled: true,
      priority: 8,
      sourceClass: "primary",
      health: "unknown",
      rateLimit: { maxRequestsPerMinute: 60, maxRequestsPerDay: 100_000 },
      retry: DEFAULT_RETRY,
      requiresEnv: ["MASSIVE_API_KEY"],
      notes:
        "Formerly Polygon.io — inactive without key; plan/licensing must authorize team surfaces",
    },
    {
      id: "finnhub",
      name: "Finnhub",
      category: "market_data",
      enabled: true,
      priority: 10,
      sourceClass: "secondary",
      health: "unknown",
      rateLimit: { maxRequestsPerMinute: 30, maxRequestsPerDay: 60_000 },
      retry: DEFAULT_RETRY,
      requiresEnv: ["FINNHUB_API_KEY"],
      notes: "Free-tier quotes/news when key present",
    },
    {
      id: "alpha-vantage",
      name: "Alpha Vantage",
      category: "corporate",
      enabled: true,
      priority: 20,
      sourceClass: "secondary",
      health: "unknown",
      rateLimit: { maxRequestsPerMinute: 5, maxRequestsPerDay: 25 },
      retry: DEFAULT_RETRY,
      requiresEnv: ["ALPHA_VANTAGE_API_KEY"],
      notes:
        "Free EARNINGS_CALENDAR CSV only — cached ~12h; not a quote or options source",
    },
    {
      id: "fred",
      name: "FRED",
      category: "macro",
      enabled: true,
      priority: 10,
      sourceClass: "primary",
      health: "unknown",
      rateLimit: { maxRequestsPerMinute: 20 },
      retry: DEFAULT_RETRY,
      requiresEnv: ["FRED_API_KEY"],
    },
    {
      id: "rss",
      name: "Configured RSS",
      category: "news",
      enabled: true,
      priority: 20,
      sourceClass: "secondary",
      health: "unknown",
      rateLimit: { maxRequestsPerMinute: 10 },
      retry: DEFAULT_RETRY,
      requiresEnv: ["NEWS_RSS_FEEDS"],
    },
    {
      id: "edgar",
      name: "SEC EDGAR",
      category: "corporate",
      enabled: true,
      priority: 10,
      sourceClass: "primary",
      health: "unknown",
      rateLimit: { maxRequestsPerMinute: 10 },
      retry: DEFAULT_RETRY,
      requiresEnv: ["EDGAR_USER_AGENT"],
      notes: "User-Agent required; falls back to NEXT_PUBLIC_APP_URL",
    },
    {
      id: "mock",
      name: "Mock providers",
      category: "market_data",
      enabled: true,
      priority: 100,
      sourceClass: "secondary",
      health: "unknown",
      rateLimit: { maxRequestsPerMinute: 1_000 },
      retry: { maxAttempts: 1, baseDelayMs: 0, maxDelayMs: 0 },
      notes: "DEMO only — forbidden in production",
    },
    {
      id: "openai",
      name: "OpenAI",
      category: "ai",
      enabled: true,
      priority: 10,
      sourceClass: "secondary",
      health: "unknown",
      rateLimit: { maxRequestsPerMinute: 60 },
      retry: DEFAULT_RETRY,
      requiresEnv: ["OPENAI_API_KEY"],
    },
    {
      id: "anthropic",
      name: "Anthropic",
      category: "ai",
      enabled: true,
      priority: 20,
      sourceClass: "secondary",
      health: "unknown",
      rateLimit: { maxRequestsPerMinute: 60 },
      retry: DEFAULT_RETRY,
      requiresEnv: ["ANTHROPIC_API_KEY"],
    },
    {
      id: "gemini",
      name: "Google Gemini",
      category: "ai",
      enabled: true,
      priority: 30,
      sourceClass: "secondary",
      health: "unknown",
      rateLimit: { maxRequestsPerMinute: 60 },
      retry: DEFAULT_RETRY,
      requiresEnv: ["GOOGLE_GENERATIVE_AI_API_KEY"],
    },
    {
      id: "resend",
      name: "Resend",
      category: "email",
      enabled: true,
      priority: 10,
      sourceClass: "primary",
      health: "unknown",
      rateLimit: { maxRequestsPerMinute: 30 },
      retry: DEFAULT_RETRY,
      requiresEnv: ["RESEND_API_KEY"],
    },
  ];
}

export class SourceRegistry {
  private entries: Map<string, SourceRegistryEntry>;

  constructor(initial: SourceRegistryEntry[] = createDefaultSourceRegistry()) {
    this.entries = new Map(initial.map((e) => [e.id, { ...e }]));
  }

  list(): SourceRegistryEntry[] {
    return [...this.entries.values()].sort((a, b) => a.priority - b.priority);
  }

  get(id: string): SourceRegistryEntry | undefined {
    return this.entries.get(id);
  }

  setEnabled(id: string, enabled: boolean): void {
    const entry = this.entries.get(id);
    if (!entry) throw new Error(`Unknown source: ${id}`);
    entry.enabled = enabled;
    if (!enabled) entry.health = "disabled";
  }

  recordSuccess(id: string, latencyMs?: number): void {
    const entry = this.entries.get(id);
    if (!entry) return;
    entry.health = "healthy";
    entry.lastSuccessAt = new Date().toISOString();
    if (latencyMs != null) entry.latencyMsP50 = latencyMs;
  }

  recordFailure(id: string, message: string): void {
    const entry = this.entries.get(id);
    if (!entry) return;
    entry.health = "degraded";
    entry.lastErrorAt = new Date().toISOString();
    entry.lastErrorMessage = message;
  }

  byCategory(category: ProviderCategory): SourceRegistryEntry[] {
    return this.list().filter((e) => e.category === category && e.enabled);
  }
}

export type ProviderBundle = {
  marketData: MarketDataProvider;
  news: NewsProvider;
  macro: MacroDataProvider;
  corporate: CorporateEventsProvider;
  ai: AiProvider;
  email: EmailProvider;
  scheduler: SchedulerAdapter;
  registry: SourceRegistry;
  usingMocks: {
    marketData: boolean;
    news: boolean;
    macro: boolean;
    corporate: boolean;
    ai: boolean;
    email: boolean;
    scheduler: boolean;
  };
};

/**
 * Optional real adapter factories — injected when live adapters are registered.
 * Keys present + factory provided → real; else mock if ALLOW_MOCK_PROVIDERS.
 */
export type RealProviderFactories = {
  marketData?: (env: Env) => MarketDataProvider;
  news?: (env: Env) => NewsProvider;
  macro?: (env: Env) => MacroDataProvider;
  corporate?: (env: Env) => CorporateEventsProvider;
  ai?: (env: Env) => AiProvider;
  email?: (env: Env) => EmailProvider;
  scheduler?: (env: Env) => SchedulerAdapter;
};

function resolveSlot<T>(args: {
  env: Env;
  label: string;
  hasCredential: boolean;
  createReal?: (env: Env) => T;
  createMock: () => T;
}): { provider: T; usedMock: boolean } {
  if (args.hasCredential && args.createReal) {
    return { provider: args.createReal(args.env), usedMock: false };
  }
  if (mocksAllowed(args.env)) {
    return { provider: args.createMock(), usedMock: true };
  }
  throw new Error(
    `No provider for ${args.label}: missing live adapter/credentials and mocks are not allowed (production fail-closed or ALLOW_MOCK_PROVIDERS≠true).`,
  );
}

export function createNewsProvider(env: Env): NewsProvider {
  const providers: NewsProvider[] = [];
  if (env.FINNHUB_API_KEY) {
    providers.push(new FinnhubNewsProvider({ apiKey: env.FINNHUB_API_KEY }));
  }
  if (env.NEWS_RSS_FEEDS?.trim()) {
    providers.push(RssNewsProvider.fromCsv(env.NEWS_RSS_FEEDS));
  }
  if (providers.length === 0) {
    throw new Error(
      "createNewsProvider requires FINNHUB_API_KEY or NEWS_RSS_FEEDS",
    );
  }
  if (providers.length === 1) return providers[0]!;
  return new CompositeNewsProvider(providers);
}

/** Default live adapter factories (used when keys are present). */
export function defaultRealProviderFactories(): RealProviderFactories {
  return {
    marketData: (env) => {
      const routed = createRoutedMarketDataProvider(env);
      if (routed) return routed;
      if (env.FINNHUB_API_KEY) {
        return new FinnhubMarketDataProvider({ apiKey: env.FINNHUB_API_KEY });
      }
      throw new Error("marketData factory invoked without credentials");
    },
    news: (env) => createNewsProvider(env),
    macro: (env) => new FredMacroDataProvider({ apiKey: env.FRED_API_KEY! }),
    corporate: (env) =>
      new EdgarCorporateEventsProvider({
        userAgent: createEdgarUserAgent(env),
        finnhubApiKey: env.FINNHUB_API_KEY,
      }),
    email: (env) =>
      new ResendEmailProvider({
        apiKey: env.RESEND_API_KEY!,
        from: env.EMAIL_FROM ?? "IB Market Data <reports@example.com>",
      }),
    ai: (env) => createAiOrchestration({ env, useMock: false }),
  };
}

/**
 * Factory: returns real adapters when keys + factories are present,
 * otherwise mock (only if ALLOW_MOCK_PROVIDERS and not production).
 */
export function createProviders(
  env: Env = getEnv(),
  real: RealProviderFactories = defaultRealProviderFactories(),
): ProviderBundle {
  const registry = new SourceRegistry();

  const hasFinnhub = Boolean(env.FINNHUB_API_KEY);
  const hasAlpaca = Boolean(
    env.ALPACA_DATA_KEY_ID && env.ALPACA_DATA_SECRET_KEY,
  );
  const hasMassive = Boolean(env.MASSIVE_API_KEY);
  const hasMarketData = hasAlpaca || hasMassive || hasFinnhub;
  const hasFred = Boolean(env.FRED_API_KEY);
  const hasRss = Boolean(env.NEWS_RSS_FEEDS?.trim());
  const hasOpenAi = Boolean(env.OPENAI_API_KEY);
  const hasAnthropic = Boolean(env.ANTHROPIC_API_KEY);
  const hasGemini = Boolean(env.GOOGLE_GENERATIVE_AI_API_KEY);
  const hasAi = hasOpenAi || hasAnthropic || hasGemini;
  const hasResend = Boolean(env.RESEND_API_KEY);
  // EDGAR needs no API key; prefer live outside mock mode or when User-Agent set
  const hasEdgar = Boolean(env.EDGAR_USER_AGENT?.trim()) || !mocksAllowed(env);

  const market = resolveSlot({
    env,
    label: "marketData",
    hasCredential: hasMarketData,
    createReal: real.marketData,
    createMock: () => new MockMarketDataProvider(),
  });
  const news = resolveSlot({
    env,
    label: "news",
    hasCredential: hasFinnhub || hasRss,
    createReal: real.news,
    createMock: () => new MockNewsProvider(),
  });
  const macro = resolveSlot({
    env,
    label: "macro",
    hasCredential: hasFred,
    createReal: real.macro,
    createMock: () => new MockMacroDataProvider(),
  });
  const corporate = resolveSlot({
    env,
    label: "corporate",
    hasCredential: hasEdgar || hasFinnhub,
    createReal: real.corporate,
    createMock: () => new MockCorporateEventsProvider(),
  });
  const ai = resolveSlot({
    env,
    label: "ai",
    hasCredential: hasAi,
    createReal: real.ai,
    createMock: () => new MockAiProvider(),
  });
  const email = resolveSlot({
    env,
    label: "email",
    hasCredential: hasResend,
    createReal: real.email,
    createMock: () => new MockEmailProvider(),
  });
  const scheduler = real.scheduler
    ? { provider: real.scheduler(env), usedMock: false }
    : mocksAllowed(env)
      ? {
          provider: new MockSchedulerAdapter({
            firmId: env.FIRM_ID ?? "default",
          }),
          usedMock: true,
        }
      : {
          provider: new InProcessSchedulerAdapter({
            firmId: env.FIRM_ID ?? "default",
          }),
          usedMock: false,
        };

  if (market.usedMock || news.usedMock) {
    registry.recordSuccess("mock");
  } else {
    registry.setEnabled("mock", false);
  }

  if (hasAlpaca && !market.usedMock) registry.recordSuccess("alpaca");
  else if (!hasAlpaca) {
    const e = registry.get("alpaca");
    if (e) e.health = "disabled";
  }

  if (hasMassive && !market.usedMock) registry.recordSuccess("massive");
  else if (!hasMassive) {
    const e = registry.get("massive");
    if (e) e.health = "disabled";
  }

  if (hasFinnhub && !market.usedMock) registry.recordSuccess("finnhub");
  else if (!hasFinnhub) {
    const e = registry.get("finnhub");
    if (e) e.health = "disabled";
  }

  if (hasFred && !macro.usedMock) registry.recordSuccess("fred");
  else if (!hasFred) {
    const e = registry.get("fred");
    if (e) e.health = "disabled";
  }

  if (hasRss && !news.usedMock) registry.recordSuccess("rss");
  else if (!hasRss) {
    const e = registry.get("rss");
    if (e) e.health = "disabled";
  }

  if (!corporate.usedMock) registry.recordSuccess("edgar");
  else {
    const e = registry.get("edgar");
    if (e) e.health = "disabled";
  }

  if (hasResend && !email.usedMock) registry.recordSuccess("resend");
  else if (!hasResend) {
    const e = registry.get("resend");
    if (e) e.health = "disabled";
  }

  if (hasOpenAi) registry.recordSuccess("openai");
  else {
    const e = registry.get("openai");
    if (e) e.health = "disabled";
  }
  if (hasAnthropic) registry.recordSuccess("anthropic");
  else {
    const e = registry.get("anthropic");
    if (e) e.health = "disabled";
  }
  if (hasGemini) registry.recordSuccess("gemini");
  else {
    const e = registry.get("gemini");
    if (e) e.health = "disabled";
  }

  return {
    marketData: market.provider,
    news: news.provider,
    macro: macro.provider,
    corporate: corporate.provider,
    ai: ai.provider,
    email: email.provider,
    scheduler: scheduler.provider,
    registry,
    usingMocks: {
      marketData: market.usedMock,
      news: news.usedMock,
      macro: macro.usedMock,
      corporate: corporate.usedMock,
      ai: ai.usedMock,
      email: email.usedMock,
      scheduler: scheduler.usedMock,
    },
  };
}
