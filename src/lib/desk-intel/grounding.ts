import {
  extractNumbersFromText,
  normalizeNumberToken,
} from "@/lib/reports/quality-gate";
import { EVENT_TYPES, type AttributionKind } from "@/lib/intelligence/types";
import { THEMES } from "@/lib/intelligence/themes";
import type {
  AskAnswer,
  BookRisk,
  DeskIntelWarning,
  EvidencePack,
  GroundedClaim,
  MoveNarrative,
  NewsDigest,
  QueryInterpret,
  SessionBrief,
} from "./types";
import { UNKNOWN_MOVE_COPY } from "./types";
import { scrubFreeTextTickers, trustedDeskTickers } from "./tickers";

const RANK: Record<AttributionKind, number> = {
  unknown: 0,
  sympathy: 1,
  likely_catalyst: 2,
  multiple: 2,
  confirmed_company: 3,
};

function numberSupported(
  token: string,
  evidence: Set<string>,
  evidenceText: string,
): boolean {
  if (evidence.has(token)) return true;
  if (evidenceText.includes(token)) return true;
  const asNum = Number(token);
  if (!Number.isFinite(asNum)) return false;
  for (const candidate of normalizeNumberToken(asNum)) {
    if (evidence.has(candidate) || evidenceText.includes(candidate)) {
      return true;
    }
  }
  return false;
}

export function inventedNumbers(
  text: string,
  pack: EvidencePack,
): string[] {
  const evidence = new Set(pack.numberTokens);
  const evidenceText = [
    ...pack.numberTokens,
    ...pack.sources.map((source) => `${source.title} ${source.id}`),
    ...pack.events.map((event) => `${event.title} ${event.summary ?? ""}`),
    ...pack.moves.map((move) => `${move.headline} ${move.detail}`),
  ].join(" ");
  const invented: string[] = [];
  for (const token of extractNumbersFromText(text)) {
    const n = Number(token);
    if (Number.isInteger(n) && Math.abs(n) < 10) continue;
    if (Number.isInteger(n) && n >= 1900 && n <= 2100) continue;
    if (!numberSupported(token, evidence, evidenceText)) invented.push(token);
  }
  return invented;
}

function sourceSet(pack: EvidencePack): Set<string> {
  return new Set(pack.sources.map((source) => source.id));
}

function tickerAllowed(ticker: string, pack: EvidencePack): boolean {
  const symbol = ticker.toUpperCase();
  if (symbol === "BOOK") return true;
  return pack.allowedTickers.includes(symbol);
}

export function filterSourceIds(
  ids: string[],
  pack: EvidencePack,
): string[] {
  const allowed = sourceSet(pack);
  const eventById = new Map(pack.events.map((event) => [event.id, event]));
  const out: string[] = [];
  for (const id of ids) {
    if (allowed.has(id)) {
      out.push(id);
      continue;
    }
    const event = eventById.get(id);
    if (event) {
      out.push(...event.sourceIds.filter((sourceId) => allowed.has(sourceId)));
    }
  }
  return [...new Set(out)];
}

export function filterTickers(tickers: string[], pack: EvidencePack): string[] {
  return trustedDeskTickers(
    tickers.map((ticker) => ticker.toUpperCase()),
    pack,
  );
}

export function groundClaims(
  claims: GroundedClaim[],
  pack: EvidencePack,
  warnings: DeskIntelWarning[],
): GroundedClaim[] {
  const out: GroundedClaim[] = [];
  for (const claim of claims) {
    const sourceIds = filterSourceIds(claim.sourceIds, pack);
    const tickers = filterTickers(claim.tickers, pack);
    const invented = inventedNumbers(claim.text, pack);
    if (invented.length) {
      warnings.push({
        code: "invented_number",
        message: `Dropped claim ${claim.id}: unsupported number ${invented[0]}`,
      });
      continue;
    }
    if (claim.nature === "fact" && sourceIds.length === 0) {
      warnings.push({
        code: "uncited_fact",
        message: `Downgraded claim ${claim.id} from fact to inference — no valid source id.`,
      });
      out.push({ ...claim, nature: "inference", sourceIds, tickers });
      continue;
    }
    out.push({ ...claim, sourceIds, tickers });
  }
  return out;
}

export function textHasInventedNumbers(
  texts: string[],
  pack: EvidencePack,
  warnings: DeskIntelWarning[],
  code = "invented_number",
): boolean {
  for (const text of texts) {
    const invented = inventedNumbers(text, pack);
    if (invented.length) {
      warnings.push({
        code,
        message: `Unsupported number "${invented[0]}" is not in the evidence pack.`,
      });
      return true;
    }
  }
  return false;
}

export function baselineAttributionForTicker(
  ticker: string,
  pack: EvidencePack,
): AttributionKind {
  const symbol = ticker.toUpperCase();
  const recorded = pack.attributionByTicker[symbol];
  if (recorded) return recorded;
  const related = pack.events.filter((event) => event.tickers.includes(symbol));
  if (!related.length) return "unknown";
  const primary = related.some((event) =>
    event.sourceIds.some((id) => {
      const source = pack.sources.find((row) => row.id === id);
      return source?.sourceClass === "primary";
    }),
  );
  return primary ? "confirmed_company" : "likely_catalyst";
}

export function clampAttribution(
  proposed: AttributionKind,
  baseline: AttributionKind | undefined,
  warnings: DeskIntelWarning[],
  ticker: string,
): AttributionKind {
  const floor = baseline ?? "unknown";
  if (RANK[proposed] > RANK[floor]) {
    warnings.push({
      code: "attribution_upgrade_blocked",
      message: `Kept ${ticker} at ${floor}; model attempted ${proposed}.`,
    });
    return floor;
  }
  return proposed;
}

export function groundSessionBrief(
  brief: SessionBrief,
  pack: EvidencePack,
): { data: SessionBrief; warnings: DeskIntelWarning[]; rejected: boolean } {
  const warnings: DeskIntelWarning[] = [];
  if (
    textHasInventedNumbers(
      [brief.headline, brief.sessionRead, ...brief.watchItems, ...brief.gaps],
      pack,
      warnings,
    )
  ) {
    return { data: brief, warnings, rejected: true };
  }
  const materialNow = groundClaims(brief.materialNow, pack, warnings);
  const unexplainedTape = brief.unexplainedTape
    .map((row) => ({ ...row, ticker: row.ticker.toUpperCase() }))
    .filter((row) => tickerAllowed(row.ticker, pack))
    .filter((row) => {
      if (inventedNumbers(row.note, pack).length) {
        warnings.push({
          code: "invented_number",
          message: `Dropped unexplained row ${row.ticker}.`,
        });
        return false;
      }
      return true;
    });
  const bookFlags = brief.bookFlags
    .map((row) => ({
      ...row,
      ticker: row.ticker.toUpperCase(),
      sourceIds: filterSourceIds(row.sourceIds, pack),
    }))
    .filter((row) => tickerAllowed(row.ticker, pack) && pack.inBookTickers.includes(row.ticker));
  const themes = brief.themes
    .filter(
      (row) =>
        inventedNumbers(row.note, pack).length === 0 &&
        filterSourceIds(row.sourceIds, pack).length ===
          row.sourceIds.filter(Boolean).length,
    )
    .map((row) => ({
      ...row,
      note: scrubFreeTextTickers(row.note, pack),
      sourceIds: filterSourceIds(row.sourceIds, pack),
    }))
    .filter((row) => row.note.length > 0);
  return {
    data: {
      ...brief,
      headline: scrubFreeTextTickers(brief.headline, pack) || brief.headline,
      sessionRead: scrubFreeTextTickers(brief.sessionRead, pack) || brief.sessionRead,
      materialNow,
      unexplainedTape,
      bookFlags,
      themes,
    },
    warnings,
    rejected: false,
  };
}

export function groundMoveNarrative(
  narrative: MoveNarrative,
  pack: EvidencePack,
): { data: MoveNarrative; warnings: DeskIntelWarning[]; rejected: boolean } {
  const warnings: DeskIntelWarning[] = [];
  const ticker = narrative.ticker.toUpperCase();
  const baseline = baselineAttributionForTicker(ticker, pack);
  const attribution = clampAttribution(
    narrative.attribution,
    baseline,
    warnings,
    ticker,
  );
  const sourceIds = filterSourceIds(narrative.sourceIds, pack);
  if (
    textHasInventedNumbers(
      [narrative.headline, narrative.narrative, narrative.whyItMatters, ...narrative.caveats],
      pack,
      warnings,
    )
  ) {
    return { data: narrative, warnings, rejected: true };
  }
  if (attribution === "unknown") {
    return {
      data: {
        ticker,
        attribution: "unknown",
        nature: "unknown",
        headline: "Unknown catalyst",
        narrative: UNKNOWN_MOVE_COPY,
        whyItMatters:
          "Do not trade a story the evidence cannot support. Recheck filings and wires if the move persists.",
        caveats: [
          UNKNOWN_MOVE_COPY,
          ...narrative.caveats.filter((row) => inventedNumbers(row, pack).length === 0),
        ],
        sourceIds,
        relatedTickers: filterTickers(narrative.relatedTickers, pack),
      },
      warnings,
      rejected: false,
    };
  }
  let nature = narrative.nature;
  if (attribution === "confirmed_company") nature = "fact";
  else if (nature === "fact") nature = "inference";
  if (nature === "fact" && sourceIds.length === 0) nature = "inference";
  return {
    data: {
      ...narrative,
      ticker,
      attribution,
      nature,
      sourceIds,
      relatedTickers: filterTickers(narrative.relatedTickers, pack),
    },
    warnings,
    rejected: false,
  };
}

export function groundBookRisk(
  risk: BookRisk,
  pack: EvidencePack,
): { data: BookRisk; warnings: DeskIntelWarning[]; rejected: boolean } {
  const warnings: DeskIntelWarning[] = [];
  if (textHasInventedNumbers([risk.headline, ...risk.gaps], pack, warnings)) {
    return { data: risk, warnings, rejected: true };
  }
  const inBook = new Set(pack.inBookTickers);
  const items = risk.items
    .map((item) => ({
      ...item,
      ticker: item.ticker.toUpperCase(),
      sourceIds: filterSourceIds(item.sourceIds, pack),
    }))
    .filter((item) => {
      if (!inBook.has(item.ticker) && !tickerAllowed(item.ticker, pack)) return false;
      if (inventedNumbers(item.note, pack).length) {
        warnings.push({
          code: "invented_number",
          message: `Dropped book-risk row ${item.ticker}.`,
        });
        return false;
      }
      return true;
    });
  return {
    data: { ...risk, items, ownerLocked: pack.ownerLocked === true },
    warnings,
    rejected: false,
  };
}

export function groundNewsDigest(
  digest: NewsDigest,
  pack: EvidencePack,
): { data: NewsDigest; warnings: DeskIntelWarning[]; rejected: boolean } {
  const warnings: DeskIntelWarning[] = [];
  if (textHasInventedNumbers([digest.headline], pack, warnings)) {
    return { data: digest, warnings, rejected: true };
  }
  const eventIds = new Set(pack.events.map((event) => event.id));
  const bullets = groundClaims(digest.bullets, pack, warnings);
  const clusters = digest.clusters
    .map((cluster) => ({
      ...cluster,
      note: scrubFreeTextTickers(cluster.note, pack),
      eventIds: cluster.eventIds.filter((id) => eventIds.has(id)),
      sourceIds: filterSourceIds(cluster.sourceIds, pack),
    }))
    .filter(
      (cluster) =>
        cluster.note.length > 0 && inventedNumbers(cluster.note, pack).length === 0,
    );
  return {
    data: {
      ...digest,
      headline: scrubFreeTextTickers(digest.headline, pack) || digest.headline,
      bullets,
      clusters,
    },
    warnings,
    rejected: false,
  };
}

export function groundQueryInterpret(
  parsed: QueryInterpret,
  pack: EvidencePack,
): QueryInterpret {
  const themeIds = new Set(THEMES.map((theme) => theme.id));
  const tickers = filterTickers(parsed.tickers, pack);
  const whyTicker = parsed.whyTicker
    ? filterTickers([parsed.whyTicker], pack)[0] ?? null
    : null;
  return {
    ...parsed,
    tickers,
    whyTicker,
    eventTypes: parsed.eventTypes.filter((type) =>
      (EVENT_TYPES as readonly string[]).includes(type),
    ),
    themes: parsed.themes.filter((theme) => themeIds.has(theme)),
  };
}

export function groundAskAnswer(
  answer: AskAnswer,
  pack: EvidencePack,
): { data: AskAnswer; warnings: DeskIntelWarning[]; rejected: boolean } {
  const warnings: DeskIntelWarning[] = [];
  if (textHasInventedNumbers([answer.answer, ...answer.followUps], pack, warnings)) {
    return { data: answer, warnings, rejected: true };
  }
  const sourceIds = filterSourceIds(answer.sourceIds, pack);
  const claims = groundClaims(answer.claims, pack, warnings);
  let nature = answer.nature;
  if (nature === "fact" && sourceIds.length === 0 && claims.every((claim) => claim.sourceIds.length === 0)) {
    nature = "insufficient_evidence";
  }
  return {
    data: {
      ...answer,
      answer: scrubFreeTextTickers(answer.answer, pack) || answer.answer,
      nature,
      sourceIds,
      claims,
    },
    warnings,
    rejected: false,
  };
}
