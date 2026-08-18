import { fetchWithSizeLimit } from "@/lib/providers/rss/ssrf";
import type { HaltStatus } from "./types";

export type HaltEvent = {
  ticker: string;
  status: HaltStatus;
  reason: string | null;
  reasonCode: string | null;
  haltedAt: string;
  resumedAt: string | null;
  source: string;
};

const NASDAQ_HALT_RSS = "https://www.nasdaqtrader.com/rss.aspx?feed=tradehalts";

function stripTags(value: string): string {
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

export function parseNasdaqHaltRss(xml: string, now = new Date()): HaltEvent[] {
  const items = xml.split(/<item[\s>]/i).slice(1);
  const events: HaltEvent[] = [];
  for (const item of items) {
    const title = stripTags(item.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "");
    const description = stripTags(
      item.match(/<description[^>]*>([\s\S]*?)<\/description>/i)?.[1] ?? "",
    );
    const pub = item.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i)?.[1];
    const tickerMatch =
      title.match(/\b([A-Z]{1,5})\b/) ?? description.match(/\b([A-Z]{1,5})\b/);
    if (!tickerMatch) continue;
    const ticker = tickerMatch[1]!;
    const lower = `${title} ${description}`.toLowerCase();
    const resumed = lower.includes("resume") || lower.includes("resumption");
    const haltedAt = pub ? new Date(pub) : now;
    events.push({
      ticker,
      status: resumed ? "resumed" : "halted",
      reason: title || description || null,
      reasonCode: lower.includes("luld")
        ? "LULD"
        : lower.includes("news")
          ? "T1"
          : lower.includes("regulatory")
            ? "T12"
            : null,
      haltedAt: Number.isNaN(haltedAt.getTime()) ? now.toISOString() : haltedAt.toISOString(),
      resumedAt: resumed ? now.toISOString() : null,
      source: "nasdaqtrader",
    });
  }
  return events;
}

export async function fetchTradingHalts(): Promise<{ events: HaltEvent[]; notes: string[] }> {
  try {
    const response = await fetchWithSizeLimit(NASDAQ_HALT_RSS, {
      headers: { accept: "application/rss+xml,application/xml,text/xml,*/*" },
      signal: AbortSignal.timeout(8_000),
      maxBytes: 400_000,
    });
    if (!response.ok) {
      return {
        events: [],
        notes: [`Nasdaq halt RSS HTTP ${response.status} — halt coverage unavailable.`],
      };
    }
    const xml = await response.text();
    return { events: parseNasdaqHaltRss(xml), notes: [] };
  } catch (error) {
    return {
      events: [],
      notes: [
        `Halt feed unavailable: ${error instanceof Error ? error.message : String(error)}`,
      ],
    };
  }
}

export function haltMapFrom(events: HaltEvent[]): Map<string, HaltEvent> {
  const map = new Map<string, HaltEvent>();
  for (const event of events) {
    const current = map.get(event.ticker);
    if (!current || Date.parse(event.haltedAt) >= Date.parse(current.haltedAt)) {
      map.set(event.ticker, event);
    }
  }
  return map;
}
