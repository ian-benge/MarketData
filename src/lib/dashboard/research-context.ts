import type { Env } from "@/lib/env";
import { loadDashboardCatalystCalendar } from "@/lib/market-data/catalyst-calendar-load";
import {
  getIntelligenceBundle,
  resetIntelligenceCache,
  type IntelligenceLoadOptions,
} from "@/lib/intelligence/service";
import type { IntelligenceBundle } from "@/lib/intelligence/types";
import type { NormalizedNewsItem } from "@/lib/providers/types";

const RESEARCH_TTL_MS = 5 * 60 * 1000;

export type DashboardResearch = {
  headlines: NormalizedNewsItem[];
  calendar: Awaited<ReturnType<typeof loadDashboardCatalystCalendar>>;
  fetchedAt: string;
  intelligence: IntelligenceBundle | null;
};

type ResearchOptions = IntelligenceLoadOptions;

let cached: DashboardResearch | null = null;
let inflight: Promise<DashboardResearch> | null = null;

export function resetDashboardResearchCache() {
  cached = null;
  inflight = null;
  resetIntelligenceCache();
}

function emptyResearch(fetchedAt = new Date().toISOString()): DashboardResearch {
  return { headlines: [], calendar: [], fetchedAt, intelligence: null };
}

async function loadDashboardResearch(
  env: Env,
  options?: ResearchOptions,
): Promise<DashboardResearch> {
  const now = new Date();
  const [intelligenceResult, calendarResult] = await Promise.allSettled([
    getIntelligenceBundle(env, options),
    loadDashboardCatalystCalendar(env),
  ]);

  const intelligence =
    intelligenceResult.status === "fulfilled" ? intelligenceResult.value : null;
  const calendar =
    calendarResult.status === "fulfilled" ? calendarResult.value : [];

  return {
    headlines: intelligence?.headlines ?? [],
    calendar,
    fetchedAt: intelligence?.fetchedAt ?? now.toISOString(),
    intelligence,
  };
}

export async function getDashboardResearch(
  env: Env,
  options?: ResearchOptions,
): Promise<DashboardResearch> {
  if (
    !options?.force &&
    cached &&
    Date.now() - Date.parse(cached.fetchedAt) < RESEARCH_TTL_MS
  ) {
    if (options?.quotes?.length) {
      const intelligence = await getIntelligenceBundle(env, {
        ...options,
        force: false,
      });
      return {
        ...cached,
        headlines: intelligence.headlines,
        intelligence,
      };
    }
    return cached;
  }
  if (inflight) return inflight;

  inflight = loadDashboardResearch(env, options)
    .then((bundle) => {
      cached = bundle;
      return bundle;
    })
    .catch((error) => {
      if (cached) return cached;
      throw error;
    })
    .finally(() => {
      inflight = null;
    });

  try {
    return await inflight;
  } catch {
    return emptyResearch();
  }
}
