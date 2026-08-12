import { z } from "zod";
import type { Env } from "@/lib/env";
import type { CorporateEventsProvider } from "@/lib/providers/interfaces";
import type {
  DateRange,
  NormalizedEarningsEvent,
  NormalizedFiling,
} from "@/lib/providers/types";
import { parseFinnhubEarningsCalendar } from "@/lib/market-data/earnings/finnhub";
import { NormalizedEarningsEventSchema, NormalizedFilingSchema } from "@/lib/providers/types";

const COVERAGE =
  "SEC EDGAR public filings — primary source; User-Agent required by SEC fair-access policy.";

function isoNow(): string {
  return new Date().toISOString();
}

function resolveUserAgent(env?: Pick<Env, "EDGAR_USER_AGENT" | "NEXT_PUBLIC_APP_URL">): string {
  if (env?.EDGAR_USER_AGENT?.trim()) return env.EDGAR_USER_AGENT.trim();
  const appUrl = env?.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return `MarketDataFNIP/1.0 (${appUrl}; research-desk)`;
}

/** Minimal Atom entry fields we care about. */
const AtomEntryFields = z.object({
  id: z.string().optional(),
  title: z.string().optional(),
  updated: z.string().optional(),
  published: z.string().optional(),
  link: z.string().optional(),
  summary: z.string().optional(),
});

export function parseAtomEntries(xml: string): Array<z.infer<typeof AtomEntryFields>> {
  const entries: Array<z.infer<typeof AtomEntryFields>> = [];
  const entryRe = /<entry\b[^>]*>([\s\S]*?)<\/entry>/gi;
  let match: RegExpExecArray | null;
  while ((match = entryRe.exec(xml)) != null) {
    const body = match[1] ?? "";
    const pick = (tag: string): string | undefined => {
      const m = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i").exec(body);
      if (!m?.[1]) return undefined;
      return m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/<[^>]+>/g, "").trim();
    };
    const linkHref =
      /<link[^>]+href=["']([^"']+)["']/i.exec(body)?.[1] ??
      pick("link");
    entries.push(
      AtomEntryFields.parse({
        id: pick("id"),
        title: pick("title"),
        updated: pick("updated"),
        published: pick("published"),
        link: linkHref,
        summary: pick("summary"),
      }),
    );
  }
  return entries;
}

function inferFormType(title: string | undefined): string {
  if (!title) return "UNKNOWN";
  const m = /\b(\d{1,2}-[A-Z]-?\d?|[A-Z]{1,4}-\d?|10-[KQ]|8-K|4|3|SC 13[DG])\b/i.exec(
    title,
  );
  return m?.[1]?.toUpperCase() ?? "UNKNOWN";
}

function inferTicker(title: string | undefined): string | undefined {
  if (!title) return undefined;
  const m = /\(([A-Z]{1,5})\)/.exec(title);
  return m?.[1];
}

export function normalizeEdgarAtomEntry(
  entry: z.infer<typeof AtomEntryFields>,
  retrievalTimestamp = isoNow(),
): NormalizedFiling | null {
  const title = entry.title?.trim();
  const url = entry.link?.trim();
  if (!title || !url) return null;
  const filedAt = entry.updated ?? entry.published ?? retrievalTimestamp;
  const filing: NormalizedFiling = {
    id: `edgar:${entry.id ?? hashish(title + url)}`,
    ticker: inferTicker(title),
    companyName: title.split(" - ")[0]?.trim(),
    formType: inferFormType(title),
    filedAt,
    accessionNumber: entry.id?.includes("accession") ? entry.id : undefined,
    title,
    url,
    providerName: "edgar",
    providerTimestamp: filedAt,
    retrievalTimestamp,
    sourceQuality: "primary",
    coverageNotes: COVERAGE,
  };
  return NormalizedFilingSchema.parse(filing);
}

function hashish(input: string): string {
  let h = 0;
  for (let i = 0; i < input.length; i += 1) {
    h = (h * 31 + input.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(16);
}

export type EdgarCorporateOptions = {
  userAgent: string;
  finnhubApiKey?: string;
  fetchImpl?: typeof fetch;
  edgarAtomUrl?: string;
  finnhubBaseUrl?: string;
};

export function createEdgarUserAgent(
  env: Pick<Env, "EDGAR_USER_AGENT" | "NEXT_PUBLIC_APP_URL">,
): string {
  return resolveUserAgent(env);
}

export class EdgarCorporateEventsProvider implements CorporateEventsProvider {
  private readonly userAgent: string;
  private readonly finnhubApiKey?: string;
  private readonly fetchImpl: typeof fetch;
  private readonly edgarAtomUrl: string;
  private readonly finnhubBaseUrl: string;

  constructor(options: EdgarCorporateOptions) {
    this.userAgent = options.userAgent;
    this.finnhubApiKey = options.finnhubApiKey;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.edgarAtomUrl =
      options.edgarAtomUrl ??
      "https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&count=40&output=atom";
    this.finnhubBaseUrl = options.finnhubBaseUrl ?? "https://finnhub.io/api/v1";
  }

  async getFilings(range: DateRange): Promise<NormalizedFiling[]> {
    const retrieval = isoNow();
    const res = await this.fetchImpl(this.edgarAtomUrl, {
      headers: {
        "user-agent": this.userAgent,
        accept: "application/atom+xml, application/xml, text/xml, */*",
      },
    });
    if (!res.ok) {
      throw new Error(`EDGAR atom feed failed: HTTP ${res.status}`);
    }
    const xml = await res.text();
    const start = new Date(range.start).getTime();
    const end = new Date(range.end).getTime() + 86_400_000;
    return parseAtomEntries(xml)
      .map((e) => normalizeEdgarAtomEntry(e, retrieval))
      .filter((f): f is NormalizedFiling => f != null)
      .filter((f) => {
        const t = new Date(f.filedAt).getTime();
        if (!Number.isFinite(t)) return true;
        return t >= start && t <= end;
      });
  }

  async getEarnings(range: DateRange): Promise<NormalizedEarningsEvent[]> {
    if (!this.finnhubApiKey) {
      return [];
    }
    const retrieval = isoNow();
    const url = new URL(`${this.finnhubBaseUrl}/calendar/earnings`);
    url.searchParams.set("from", range.start.slice(0, 10));
    url.searchParams.set("to", range.end.slice(0, 10));
    url.searchParams.set("token", this.finnhubApiKey);
    const res = await this.fetchImpl(url.toString(), {
      headers: { accept: "application/json" },
    });
    if (!res.ok) {
      throw new Error(`Finnhub earnings calendar failed: HTTP ${res.status}`);
    }
    const parsed = parseFinnhubEarningsCalendar(await res.json(), retrieval);
    return parsed.events.map((e) => {
      const event: NormalizedEarningsEvent = {
        id: `finnhub-earn-${e.canonicalSymbol}-${e.reportDate}`,
        instrumentId: `finnhub:${e.canonicalSymbol}`,
        ticker: e.canonicalSymbol,
        companyName: e.companyName ?? undefined,
        reportDate: e.reportDate,
        session: e.session,
        fiscalPeriod: e.fiscalPeriod ?? undefined,
        epsActual: e.epsActual,
        epsEstimate: e.epsEstimate,
        revenueActual: e.revenueActual,
        revenueEstimate: e.revenueEstimate,
        providerName: "finnhub",
        providerTimestamp: retrieval,
        retrievalTimestamp: retrieval,
        sourceQuality: "secondary",
        coverageNotes:
          "Finnhub earnings calendar — verify against company IR for material decisions.",
      };
      return NormalizedEarningsEventSchema.parse(event);
    });
  }
}
