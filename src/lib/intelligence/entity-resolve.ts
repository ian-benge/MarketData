import { listCatalogInstruments } from "@/lib/watchlists/instrument-catalog";
import type { NormalizedNewsItem } from "@/lib/providers/types";
import type { ResolvedEntity } from "./types";

const LEGAL_SUFFIX =
  /\b(incorporated|inc|corp|corporation|ltd|limited|llc|plc|nv|sa|ag|co|company|holdings|holding|group|technologies|technology|systems|partners|adr)\b\.?/gi;

const STOP_TICKERS = new Set([
  "A",
  "I",
  "IT",
  "BE",
  "OR",
  "ALL",
  "NOW",
  "FOR",
  "ARE",
  "SO",
  "GO",
  "NEW",
  "LOW",
  "BIG",
  "HAS",
  "OUT",
  "CAN",
  "RUN",
  "SEE",
  "THE",
  "AND",
  "CEO",
  "CFO",
  "EPS",
  "GDP",
  "CPI",
  "FOMC",
  "SEC",
  "ETF",
  "IPO",
  "AI",
  "US",
  "USA",
  "UK",
  "EU",
  "THIS",
  "THAT",
  "WHAT",
  "WHY",
  "HOW",
  "WHEN",
  "WHERE",
  "WHO",
  "WHICH",
  "IT",
]);

const EXTRA_ALIASES: Record<string, string> = {
  nvidia: "NVDA",
  "nvidia corporation": "NVDA",
  tsmc: "TSM",
  "taiwan semiconductor": "TSM",
  "taiwan semiconductor manufacturing": "TSM",
  alphabet: "GOOGL",
  google: "GOOGL",
  "meta platforms": "META",
  meta: "META",
  facebook: "META",
  amazon: "AMZN",
  microsoft: "MSFT",
  broadcom: "AVGO",
  "advanced micro devices": "AMD",
  "iris energy": "IREN",
  iris: "IREN",
  iren: "IREN",
  coreweave: "CRWV",
  "super micro": "SMCI",
  supermicro: "SMCI",
  palantir: "PLTR",
  "constellation energy": "CEG",
  vistra: "VST",
  "applied digital": "APLD",
  terawulf: "WULF",
  "core scientific": "CORZ",
};

type CatalogEntry = { ticker: string; name: string; aliases: string[] };

let catalogCache: {
  byTicker: Map<string, CatalogEntry>;
  byAlias: Map<string, string>;
} | null = null;

function stripLegal(name: string): string {
  return name
    .replace(LEGAL_SUFFIX, " ")
    .replace(/[.,]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function buildCatalog() {
  if (catalogCache) return catalogCache;
  const byTicker = new Map<string, CatalogEntry>();
  const byAlias = new Map<string, string>();
  const addAlias = (alias: string, ticker: string, overwrite = false) => {
    const key = alias.trim().toLowerCase();
    if (key.length < 3) return;
    if (STOP_TICKERS.has(key.toUpperCase()) && key.length <= 3) return;
    const existing = byAlias.get(key);
    if (existing && existing !== ticker) {
      if (!overwrite) {
        byAlias.delete(key);
        return;
      }
    }
    byAlias.set(key, ticker);
  };

  for (const row of listCatalogInstruments()) {
    const aliases = new Set<string>([row.name.toLowerCase(), stripLegal(row.name)]);
    const tokens = stripLegal(row.name).split(" ").filter((t) => t.length > 3);
    if (tokens.length >= 2) aliases.add(tokens.slice(0, 2).join(" "));
    const entry: CatalogEntry = {
      ticker: row.ticker,
      name: row.name,
      aliases: [...aliases],
    };
    byTicker.set(row.ticker, entry);
    addAlias(row.ticker.toLowerCase(), row.ticker);
    for (const alias of aliases) addAlias(alias, row.ticker);
  }
  for (const [alias, ticker] of Object.entries(EXTRA_ALIASES)) {
    addAlias(alias, ticker, true);
    if (!byTicker.has(ticker)) {
      byTicker.set(ticker, { ticker, name: alias, aliases: [alias] });
    }
  }
  catalogCache = { byTicker, byAlias };
  return catalogCache;
}

export function resetEntityCatalogCache() {
  catalogCache = null;
}

export function catalogNameFor(ticker: string): string | null {
  return buildCatalog().byTicker.get(ticker.toUpperCase())?.name ?? null;
}

export function isCatalogTicker(ticker: string): boolean {
  return buildCatalog().byTicker.has(ticker.toUpperCase());
}

/** Caps that appear in prose and must not be stripped as junk equity tags. */
export function isProseCapToken(token: string): boolean {
  return STOP_TICKERS.has(token.toUpperCase());
}

export function resolveAlias(raw: string): string | null {
  const catalog = buildCatalog();
  const upper = raw.trim().toUpperCase();
  if (catalog.byTicker.has(upper)) return upper;
  return catalog.byAlias.get(raw.trim().toLowerCase()) ?? null;
}

const EXCHANGE_TICKER =
  /\b(?:nasdaq|nyse|amex|otc):\s*([A-Z]{1,5})\b/g;
const DOLLAR_TICKER = /\$([A-Z]{1,5})\b/g;
const PAREN_TICKER = /\(([A-Z]{1,5})\)/g;

function pushEntity(
  map: Map<string, ResolvedEntity>,
  entity: ResolvedEntity,
) {
  const current = map.get(entity.ticker);
  if (!current) {
    map.set(entity.ticker, entity);
    return;
  }
  const rank = (value: ResolvedEntity) =>
    (value.confidence === "high" ? 3 : value.confidence === "medium" ? 2 : 1) +
    (value.method === "provider" ? 2 : 0);
  if (rank(entity) > rank(current)) map.set(entity.ticker, entity);
}

function tokenTickers(text: string, catalog: ReturnType<typeof buildCatalog>) {
  const found: string[] = [];
  for (const match of text.matchAll(DOLLAR_TICKER)) {
    const ticker = match[1];
    if (ticker && catalog.byTicker.has(ticker)) found.push(ticker);
  }
  for (const match of text.matchAll(EXCHANGE_TICKER)) {
    const ticker = match[1];
    if (ticker && catalog.byTicker.has(ticker)) found.push(ticker);
  }
  for (const match of text.matchAll(PAREN_TICKER)) {
    const ticker = match[1];
    if (ticker && catalog.byTicker.has(ticker) && !STOP_TICKERS.has(ticker)) {
      found.push(ticker);
    }
  }
  return found;
}

export function tickerMentionedInText(
  ticker: string,
  text: string,
  catalog: ReturnType<typeof buildCatalog> = buildCatalog(),
): boolean {
  const upper = ticker.toUpperCase();
  if (new RegExp(`\\b${upper}\\b`).test(text.toUpperCase())) return true;
  const lower = ` ${text.toLowerCase().replace(/[^a-z0-9\s]/g, " ")} `;
  const entry = catalog.byTicker.get(upper);
  if (entry?.aliases.some((alias) => alias.length >= 4 && lower.includes(` ${alias} `))) {
    return true;
  }
  return Object.entries(EXTRA_ALIASES).some(
    ([alias, dest]) => dest === upper && lower.includes(` ${alias} `),
  );
}

function nameMatches(text: string, catalog: ReturnType<typeof buildCatalog>) {
  const lower = ` ${text.toLowerCase().replace(/[^a-z0-9\s]/g, " ")} `;
  const hits: string[] = [];
  const aliases = [...catalog.byAlias.entries()].sort(
    (a, b) => b[0].length - a[0].length,
  );
  const used = new Set<string>();
  for (const [alias, ticker] of aliases) {
    if (alias.length < 4 && !EXTRA_ALIASES[alias]) continue;
    if (used.has(ticker)) continue;
    const needle = ` ${alias} `;
    if (lower.includes(needle)) {
      hits.push(ticker);
      used.add(ticker);
    }
  }
  return hits;
}

export function resolveEntities(
  item: Pick<NormalizedNewsItem, "title" | "summary" | "tickers" | "excerpt">,
): ResolvedEntity[] {
  const catalog = buildCatalog();
  const map = new Map<string, ResolvedEntity>();
  const text = `${item.title} ${item.summary ?? ""} ${item.excerpt ?? ""}`;

  const providerTickers = (item.tickers ?? [])
    .map((raw) => raw.trim().toUpperCase())
    .filter(Boolean);
  for (const ticker of providerTickers) {
    const inCatalog = catalog.byTicker.has(ticker);
    const mentioned = tickerMentionedInText(ticker, text, catalog);
    if (!inCatalog && !mentioned) continue;
    if (providerTickers.length > 3 && !mentioned) continue;
    pushEntity(map, {
      ticker,
      name: catalog.byTicker.get(ticker)?.name ?? null,
      role: "primary",
      confidence: "high",
      method: "provider",
    });
  }

  for (const ticker of tokenTickers(text, catalog)) {
    pushEntity(map, {
      ticker,
      name: catalog.byTicker.get(ticker)?.name ?? null,
      role: map.has(ticker) ? "primary" : "related",
      confidence: "high",
      method: "ticker_token",
    });
  }

  const names = nameMatches(text, catalog);
  const ambiguous = names.length > 6;
  for (const ticker of names) {
    pushEntity(map, {
      ticker,
      name: catalog.byTicker.get(ticker)?.name ?? null,
      role: map.has(ticker) ? "primary" : "related",
      confidence: ambiguous ? "low" : "medium",
      method: ambiguous ? "ambiguous" : "company_name",
    });
  }

  return [...map.values()].sort((a, b) => a.ticker.localeCompare(b.ticker));
}

export function resolveQueryTickers(raw: string): string[] {
  const catalog = buildCatalog();
  const tokens = raw
    .split(/[\s,]+/)
    .map((token) => token.replace(/[$?!()]/g, "").trim())
    .filter(Boolean);
  const found: string[] = [];
  for (const token of tokens) {
    const upper = token.toUpperCase();
    if (/^[A-Z]{1,5}$/.test(upper) && catalog.byTicker.has(upper) && !STOP_TICKERS.has(upper)) {
      found.push(upper);
      continue;
    }
    const alias = resolveAlias(token) ?? resolveAlias(stripLegal(token));
    if (alias) found.push(alias);
  }
  const fromNames = nameMatches(raw, catalog);
  return [...new Set([...found, ...fromNames])];
}
