import { tickerMentionedInText } from "@/lib/intelligence/entity-resolve";
import { EVENT_TYPE_LABELS, type EventType } from "@/lib/intelligence/types";
import { themeById } from "@/lib/intelligence/themes";
import { isResidualBookLot } from "@/lib/positions/residual";
import { formatSignedPercent } from "@/lib/utils/format";
import { looksLikeInjection } from "./sanitize";
import { trustedDeskTickers } from "./tickers";
import type { EvidenceEvent, EvidencePack } from "./types";
import {
  UNKNOWN_MOVE_COPY,
  type AskAnswer,
  type BookRisk,
  type MoveNarrative,
  type NewsDigest,
  type SessionBrief,
} from "./types";

function pct(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "n/a";
  try {
    return formatSignedPercent(value);
  } catch {
    const sign = value > 0 ? "+" : "";
    return `${sign}${value.toFixed(2)}%`;
  }
}

function typeLabel(eventType: string): string {
  return (
    EVENT_TYPE_LABELS[eventType as EventType] ?? eventType.replaceAll("_", " ")
  );
}

function themeLabel(id: string): string {
  return themeById(id)?.label ?? id.replaceAll("_", " ");
}

function isPrimary(pack: EvidencePack, sourceIds: string[]): boolean {
  return sourceIds.some((id) => {
    const source = pack.sources.find((row) => row.id === id);
    return source?.sourceClass === "primary";
  });
}

function natureForMove(pack: EvidencePack, ticker: string): MoveNarrative["nature"] {
  const move = pack.moves.find((row) => row.ticker === ticker);
  if (!move || move.attribution === "unknown") return "unknown";
  if (move.attribution === "confirmed_company") return "fact";
  return "inference";
}

function attributionLabel(value: string): string {
  return value.replaceAll("_", " ");
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

const JUST_PUBLISHED_MS = 15 * 60 * 1000;

export function isJustPublished(publishedAt: string, now = Date.now()): boolean {
  const at = Date.parse(publishedAt);
  return Number.isFinite(at) && now - at >= 0 && now - at <= JUST_PUBLISHED_MS;
}

function namedTickers(pack: EvidencePack, tickers: string[]): string[] {
  return trustedDeskTickers(tickers, pack);
}

function eventsForTicker(pack: EvidencePack, ticker: string): EvidenceEvent[] {
  return pack.events.filter((event) => event.tickers.includes(ticker));
}

function clusterKey(event: EvidenceEvent): { key: string; title: string } {
  if (event.themes[0]) {
    return { key: `theme:${event.themes[0]}`, title: themeLabel(event.themes[0]) };
  }
  return { key: `type:${event.eventType}`, title: typeLabel(event.eventType) };
}

function sessionLead(pack: EvidencePack): string | null {
  const session = (pack.session ?? "").toLowerCase();
  if (session !== "closed" && session !== "overnight") return null;
  const asOf = pack.asOf.slice(0, 10);
  return Number.isNaN(Date.parse(pack.asOf))
    ? "US equities are closed. Tape is the last regular-session print, not a live weekend tape."
    : `US equities are closed. Tape is last regular-session print (${asOf}).`;
}

export function compileSessionBrief(pack: EvidencePack): SessionBrief {
  const topEvents = pack.events.slice(0, 6);
  const unexplained = pack.moves.filter((move) => move.attribution === "unknown");
  const confirmed = pack.moves.filter(
    (move) => move.attribution === "confirmed_company",
  );
  const inferred = pack.moves.filter(
    (move) =>
      move.attribution === "likely_catalyst" ||
      move.attribution === "sympathy" ||
      move.attribution === "multiple",
  );
  const significant = pack.moves.length;
  const bookUnknown = unexplained.filter((move) => move.inBook);
  const coverageUnknown = unexplained.filter((move) => move.onCoverage);

  const materialNow = topEvents.map((event, index) => {
    const tickers = namedTickers(pack, event.tickers);
    const flags = [
      event.coverageHit ? "coverage" : null,
      tickers.some((ticker) => pack.inBookTickers.includes(ticker))
        ? "in book"
        : null,
      event.novelty === "new" ? null : event.novelty,
    ].filter(Boolean);
    return {
      id: `mat-${index + 1}`,
      text: `${typeLabel(event.eventType)} · ${event.title}${
        tickers.length ? ` (${tickers.join(", ")})` : ""
      }${flags.length ? ` · ${flags.join(" · ")}` : ""}`,
      nature: isPrimary(pack, event.sourceIds)
        ? ("fact" as const)
        : ("inference" as const),
      sourceIds: event.sourceIds.slice(0, 3),
      tickers,
    };
  });

  const themeMap = new Map<
    string,
    { sourceIds: string[]; tickers: string[]; types: string[]; inBook: string[] }
  >();
  for (const event of pack.events) {
    for (const theme of event.themes) {
      const current = themeMap.get(theme) ?? {
        sourceIds: [],
        tickers: [],
        types: [],
        inBook: [],
      };
      current.sourceIds.push(...event.sourceIds);
      current.tickers.push(
        ...namedTickers(pack, event.tickers).filter((ticker) =>
          tickerMentionedInText(
            ticker,
            `${event.title} ${event.summary ?? ""}`,
          ),
        ),
      );
      current.types.push(event.eventType);
      current.inBook.push(
        ...event.tickers.filter((ticker) => pack.inBookTickers.includes(ticker)),
      );
      themeMap.set(theme, current);
    }
  }

  const movingByTheme = new Map<string, string[]>();
  for (const move of pack.moves) {
    const eventThemes = pack.events
      .filter((event) => event.tickers.includes(move.ticker))
      .flatMap((event) => event.themes);
    for (const theme of unique(eventThemes)) {
      const tickers = movingByTheme.get(theme) ?? [];
      tickers.push(move.ticker);
      movingByTheme.set(theme, tickers);
    }
  }
  const sectorWide = [...movingByTheme.entries()].filter(
    ([, tickers]) => unique(tickers).length >= 2,
  );

  const bookFlags = pack.moves
    .filter((move) => move.inBook)
    .filter((move) => {
      const position = pack.positions.find((row) => row.ticker === move.ticker);
      return !isResidualBookLot(position);
    })
    .slice(0, 8)
    .map((move) => {
      const position = pack.positions.find((row) => row.ticker === move.ticker);
      const bookBit = position
        ? ` · ${position.side}${
            position.weight != null ? ` ${position.weight.toFixed(1)}% weight` : ""
          }`
        : "";
      const fresh = eventsForTicker(pack, move.ticker).some(
        (event) => isPrimary(pack, event.sourceIds) && isJustPublished(event.publishedAt),
      );
      const freshBit = fresh ? "Just published · " : "";
      return {
        ticker: move.ticker,
        note:
          move.attribution === "unknown"
            ? `${freshBit}${move.ticker} is in the book and ${pct(move.changePercent)} with no verified catalyst in window.${bookBit}`
            : `${freshBit}${move.ticker} is in the book · ${attributionLabel(move.attribution)} · ${pct(move.changePercent)}.${bookBit}`,
        sourceIds: move.sourceIds,
      };
    });

  const lead = topEvents[0];
  const countBits = [
    confirmed.length ? `${confirmed.length} confirmed` : null,
    inferred.length ? `${inferred.length} inferred` : null,
    unexplained.length ? `${unexplained.length} unexplained` : null,
  ].filter(Boolean);
  const closedLead = sessionLead(pack);
  const headline = closedLead
    ? `${closedLead}${countBits.length ? ` ${countBits.join(" · ")}.` : ""}`
    : lead
      ? `${lead.title}${countBits.length ? ` · ${countBits.join(" · ")}` : significant ? ` · ${significant} significant tape names` : ""}`
    : significant
      ? `${significant} significant names on the tape; no clustered headline in the current window.`
      : "No material clustered headlines or significant tape names in the current evidence window.";

  const sessionBits = [
    unexplained.length > 0
      ? `${unexplained.length} significant name${unexplained.length === 1 ? "" : "s"} lack a verified catalyst.`
      : significant
        ? "Significant tape names in this window have an attributed catalyst in the evidence pack."
        : "No significant single-name moves were flagged in the supplied quotes.",
    bookUnknown.length
      ? `${bookUnknown.length} of those are in the book.`
      : pack.inBookTickers.length && confirmed.some((move) => move.inBook)
        ? "In-book names that are moving have an attributed catalyst."
        : null,
    coverageUnknown.length
      ? `${coverageUnknown.length} unexplained name${coverageUnknown.length === 1 ? "" : "s"} sit on coverage.`
      : null,
    sectorWide[0]
      ? `${themeLabel(sectorWide[0][0])} is moving as a group (${unique(sectorWide[0][1]).join(", ")}).`
      : null,
  ].filter(Boolean);

  return {
    headline,
    sessionRead: sessionBits.join(" "),
    materialNow,
    unexplainedTape: unexplained.slice(0, 8).map((move) => ({
      ticker: move.ticker,
      changePercent: move.changePercent,
      note: [
        move.inBook ? "in book" : move.onCoverage ? "coverage" : null,
        UNKNOWN_MOVE_COPY,
      ]
        .filter(Boolean)
        .join(". "),
    })),
    bookFlags,
    themes: [...themeMap.entries()].slice(0, 6).map(([id, row]) => {
      const tickers = unique(row.tickers).slice(0, 6);
      const types = unique(row.types).map(typeLabel);
      const moving = unique(movingByTheme.get(id) ?? []);
      const inBook = unique(row.inBook);
      const bits = [
        `${tickers.length} name${tickers.length === 1 ? "" : "s"} (${tickers.join(", ")})`,
        types.length ? types.join("/") : null,
        moving.length ? `tape ${moving.join(", ")}` : null,
        inBook.length ? `in book ${inBook.join(", ")}` : null,
      ].filter(Boolean);
      return {
        id,
        note: `${themeLabel(id)} — ${bits.join(" · ")}.`,
        sourceIds: unique(row.sourceIds).slice(0, 4),
      };
    }),
    watchItems: unique([
      ...unexplained
        .filter((move) => move.inBook || move.onCoverage)
        .map((move) => move.ticker),
      ...pack.calendar.slice(0, 4).map((row) =>
        row.importance === "high" ? `${row.title} (high)` : row.title,
      ),
    ]).slice(0, 8),
    gaps: pack.gaps,
    unresolvedQuestions: unexplained.slice(0, 5).map(
      (move) =>
        `What, if anything, explains ${move.ticker} ${pct(move.changePercent)} in this window?`,
    ),
  };
}

export function compileMoveNarrative(
  pack: EvidencePack,
  ticker: string,
): MoveNarrative {
  const symbol = ticker.toUpperCase();
  const move = pack.moves.find((row) => row.ticker === symbol);
  const relatedEvents = eventsForTicker(pack, symbol);
  const sourceIds = unique([
    ...(move?.sourceIds ?? []),
    ...relatedEvents.flatMap((event) => event.sourceIds),
  ]).slice(0, 6);
  if (move?.attribution === "unknown") {
    return {
      ticker: symbol,
      attribution: "unknown",
      nature: "unknown",
      headline: "Unknown catalyst",
      narrative: UNKNOWN_MOVE_COPY,
      whyItMatters:
        "An unexplained significant move still deserves attention, especially if the name is on coverage or in the book. Do not fill the gap with a guessed story.",
      caveats: [UNKNOWN_MOVE_COPY],
      sourceIds,
      relatedTickers: move.relatedTickers,
    };
  }
  if (!move) {
    if (relatedEvents.length) {
      const primary = relatedEvents.filter((event) => isPrimary(pack, event.sourceIds));
      const lead = (primary[0] ?? relatedEvents[0])!;
      const attribution = primary.length ? "confirmed_company" : "likely_catalyst";
      return {
        ticker: symbol,
        attribution,
        nature: primary.length ? "fact" : "inference",
        headline: `${attributionLabel(attribution)}: ${lead.title}`,
        narrative: relatedEvents
          .slice(0, 3)
          .map((event) => `${typeLabel(event.eventType)}: ${event.title}`)
          .join(" "),
        whyItMatters: `${symbol} headlines are in the evidence pack. This is not a claim that the print is unusual.`,
        caveats: [
          primary.length
            ? "Primary-source match. Still confirm the filing item and the print timestamp."
            : "Inference from ticker-matched reporting — not a confirmed cause.",
        ],
        sourceIds,
        relatedTickers: [],
      };
    }
    return {
      ticker: symbol,
      attribution: "unknown",
      nature: "unknown",
      headline: "Unknown catalyst",
      narrative: UNKNOWN_MOVE_COPY,
      whyItMatters:
        "An unexplained significant move still deserves attention, especially if the name is on coverage or in the book. Do not fill the gap with a guessed story.",
      caveats: [UNKNOWN_MOVE_COPY],
      sourceIds,
      relatedTickers: [],
    };
  }

  const relatedMoves = pack.moves.filter(
    (row) =>
      row.ticker !== symbol &&
      (move.relatedTickers.includes(row.ticker) ||
        relatedEvents.some((event) => event.tickers.includes(row.ticker))),
  );
  const eventTypes = unique(relatedEvents.map((event) => event.eventType));
  const eventLine = relatedEvents
    .slice(0, 3)
    .map((event) => `${typeLabel(event.eventType)}: ${event.title}`)
    .join(" ");
  const relatedLine = relatedMoves.length
    ? ` Related tape: ${relatedMoves
        .slice(0, 3)
        .map((row) => `${row.ticker} ${pct(row.changePercent)} (${attributionLabel(row.attribution)})`)
        .join("; ")}.`
    : "";

  const caveats = [
    move.evidenceNature === "fact"
      ? "Primary-source match. Still confirm the filing item and the print timestamp."
      : "Inference from timing, ticker tags, and available reporting — not a confirmed cause.",
    eventTypes.length > 1
      ? `More than one event type is in the window (${eventTypes.map(typeLabel).join(", ")}). Do not collapse them into a single cause.`
      : null,
    relatedMoves.some((row) => row.attribution === "unknown")
      ? "At least one related name is also unexplained. Sympathy is not established."
      : null,
  ].filter((row): row is string => Boolean(row));

  const position = pack.positions.find((row) => row.ticker === symbol);
  const whyItMatters = [
    move.inBook
      ? `${symbol} is in the book${position ? ` (${position.side})` : ""}.`
      : move.onCoverage
        ? `${symbol} is on coverage.`
        : `${symbol} is not flagged as coverage or book in this pack.`,
    `The label is ${attributionLabel(move.attribution)} (${move.evidenceNature}).`,
    position?.dayPercent != null
      ? `Book mark ${pct(position.dayPercent)}.`
      : null,
  ]
    .filter(Boolean)
    .join(" ");

  return {
    ticker: symbol,
    attribution: move.attribution,
    nature: natureForMove(pack, symbol),
    headline: move.headline,
    narrative: `${move.detail}${eventLine ? ` ${eventLine}` : ""}${relatedLine}`,
    whyItMatters,
    caveats,
    sourceIds,
    relatedTickers: unique([...move.relatedTickers, ...relatedMoves.map((row) => row.ticker)]),
  };
}

export function compileBookRisk(pack: EvidencePack, now = Date.now()): BookRisk {
  const items: BookRisk["items"] = [];
  const seen = new Set<string>();

  for (const move of pack.moves.filter((row) => row.inBook)) {
    const position = pack.positions.find((row) => row.ticker === move.ticker);
    if (isResidualBookLot(position)) continue;
    const concentrated = position?.weight != null && position.weight >= 25;
    const key = `${move.ticker}:${move.attribution === "unknown" ? "unexplained_move" : "catalyst"}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (move.attribution === "unknown") {
      items.push({
        ticker: move.ticker,
        severity: "high",
        kind: "unexplained_move",
        note: `${move.ticker} is in the book and ${pct(move.changePercent)} with no verified catalyst${
          position ? ` · ${position.side}` : ""
        }.`,
        sourceIds: move.sourceIds,
        changePercent: move.changePercent,
        dayPnl: position?.dayPnl ?? null,
      });
    } else {
      items.push({
        ticker: move.ticker,
        severity: concentrated ? "high" : "medium",
        kind: "catalyst",
        note: `${move.ticker} ${pct(move.changePercent)} · ${attributionLabel(move.attribution)} · ${move.headline}${
          position ? ` · ${position.side}` : ""
        }`,
        sourceIds: move.sourceIds,
        changePercent: move.changePercent,
        dayPnl: position?.dayPnl ?? null,
      });
    }
  }

  for (const event of pack.events) {
    const bookTickers = event.tickers.filter((ticker) =>
      pack.inBookTickers.includes(ticker),
    );
    for (const ticker of bookTickers) {
      const key = `${ticker}:catalyst`;
      if (seen.has(key)) continue;
      if (pack.moves.some((move) => move.ticker === ticker && move.significant)) {
        continue;
      }
      seen.add(key);
      const position = pack.positions.find((row) => row.ticker === ticker);
      const fresh = isPrimary(pack, event.sourceIds) && isJustPublished(event.publishedAt, now);
      items.push({
        ticker,
        severity: fresh ? "high" : isPrimary(pack, event.sourceIds) ? "medium" : "low",
        kind: "catalyst",
        note: `${fresh ? "Just published · " : ""}${ticker} is in the book and tagged on ${typeLabel(event.eventType).toLowerCase()}: ${event.title}`,
        sourceIds: event.sourceIds.slice(0, 3),
        dayPnl: position?.dayPnl ?? null,
      });
    }
  }

  const heavy = pack.positions
    .filter((row) => row.weight != null && row.weight >= 25 && !isResidualBookLot(row))
    .slice(0, 3);
  for (const row of heavy) {
    if (items.some((item) => item.ticker === row.ticker && item.kind === "concentration")) {
      continue;
    }
    const unexplained = items.some(
      (item) => item.ticker === row.ticker && item.kind === "unexplained_move",
    );
    items.push({
      ticker: row.ticker,
      severity: unexplained ? "high" : "medium",
      kind: "concentration",
      note: `${row.ticker} is ${(row.weight ?? 0).toFixed(1)}% of displayed book weight.`,
      sourceIds: [],
      dayPnl: row.dayPnl,
    });
  }

  const gaps = [...pack.gaps];
  if (pack.ownerLocked) {
    gaps.unshift(
      "Account metrics are locked. Tape overlap is scored without weights or P&L.",
    );
  }
  if (!pack.inBookTickers.length) {
    items.push({
      ticker: "BOOK",
      severity: "low",
      kind: "gap",
      note: "No open position tickers were supplied, so book overlap cannot be scored.",
      sourceIds: [],
    });
  }

  const unexplained = items.filter((item) => item.kind === "unexplained_move").length;
  const ranked = items.slice().sort((a, b) => {
    const rank = (item: BookRisk["items"][number]) => {
      if (item.kind === "unexplained_move") return 0;
      if (item.note.startsWith("Just published")) return 1;
      if (item.severity === "high") return 2;
      if (item.severity === "medium") return 3;
      return 4;
    };
    return rank(a) - rank(b);
  });
  return {
    headline: items.length
      ? `${items.length} book item${items.length === 1 ? " needs" : "s need"} attention${unexplained ? ` · ${unexplained} unexplained` : ""}.`
      : "No open-book overlap with significant tape or catalysts in this window.",
    items: ranked.slice(0, 12),
    gaps,
    ownerLocked: pack.ownerLocked === true,
  };
}

export function compileNewsDigest(pack: EvidencePack): NewsDigest {
  const top = pack.events.slice(0, 8);
  const groups = new Map<
    string,
    { title: string; events: EvidenceEvent[]; sourceIds: string[] }
  >();
  for (const event of top) {
    const { key, title } = clusterKey(event);
    const current = groups.get(key) ?? { title, events: [], sourceIds: [] };
    current.events.push(event);
    current.sourceIds.push(...event.sourceIds);
    groups.set(key, current);
  }
  const clusters = [...groups.values()].slice(0, 5).map((group) => {
    const tickers = namedTickers(
      pack,
      group.events.flatMap((event) => event.tickers),
    ).slice(0, 6);
    return {
      title: group.title,
      eventIds: group.events.map((event) => event.id),
      note: `${group.events.length} clustered ${
        group.events.length === 1 ? "item" : "items"
      } · ${unique(group.events.map((event) => typeLabel(event.eventType))).join("/ ")}${
        tickers.length ? ` · ${tickers.join(", ")}` : ""
      }`,
      sourceIds: unique(group.sourceIds).slice(0, 4),
    };
  });
  const names = namedTickers(
    pack,
    top.flatMap((event) => event.tickers),
  ).slice(0, 4);
  const unexplained = pack.moves.filter((move) => move.attribution === "unknown");
  const leadCluster = clusters[0];
  return {
    headline: top[0]
      ? `${leadCluster?.title ?? top[0].title} · ${top.length} material headline${top.length === 1 ? "" : "s"}${
          names.length ? ` (${names.join(", ")})` : ""
        }${unexplained.length ? ` · ${unexplained.length} unexplained tape` : ""}`
      : "No clustered headlines in the current evidence window.",
    bullets: top.slice(0, 6).map((event, index) => {
      const tickers = namedTickers(pack, event.tickers);
      return {
        id: `digest-${index + 1}`,
        text: `${typeLabel(event.eventType)} · ${event.title}${
          tickers.length ? ` (${tickers.join(", ")})` : ""
        }`,
        nature: isPrimary(pack, event.sourceIds)
          ? ("fact" as const)
          : event.sourceIds.length
            ? ("inference" as const)
            : ("unknown" as const),
        sourceIds: event.sourceIds.slice(0, 3),
        tickers,
      };
    }),
    clusters,
    unresolvedQuestions: unexplained
      .slice(0, 4)
      .map((move) => `Unexplained tape: ${move.ticker}`),
  };
}

export function compileAskAnswer(pack: EvidencePack, question: string): AskAnswer {
  if (looksLikeInjection(question)) {
    return {
      answer:
        "That input looks like an instruction to the model rather than a market question. Restate the ticker, event, or tape you want retrieved from this session.",
      nature: "insufficient_evidence",
      claims: [],
      sourceIds: [],
      followUps: pack.events.slice(0, 3).map((event) => event.title),
    };
  }
  const q = question.toLowerCase();
  const whyTicker = pack.allowedTickers.find((ticker) =>
    new RegExp(`\\b${ticker}\\b`, "i").test(question),
  );
  if (whyTicker && /\b(why|moving|down|up|catalyst|explain)\b/.test(q)) {
    const move = compileMoveNarrative(pack, whyTicker);
    return {
      answer: `${move.headline}. ${move.narrative}`,
      nature:
        move.nature === "unknown"
          ? "insufficient_evidence"
          : move.nature === "fact"
            ? "fact"
            : "inference",
      claims: [
        {
          id: "ask-1",
          text: move.narrative,
          nature: move.nature,
          sourceIds: move.sourceIds,
          tickers: namedTickers(pack, [whyTicker]),
        },
      ],
      sourceIds: move.sourceIds,
      followUps: move.relatedTickers
        .slice(0, 3)
        .map((ticker) => `What is the evidence for ${ticker}?`),
    };
  }

  if (/\b(book|position|risk|pnl|exposure|lot)\b/.test(q)) {
    const risk = compileBookRisk(pack);
    if (!risk.items.length || risk.items.every((item) => item.kind === "gap")) {
      return {
        answer:
          "No open-book overlap with significant tape or catalysts is in this session’s evidence pack.",
        nature: "insufficient_evidence",
        claims: [],
        sourceIds: [],
        followUps: pack.moves.slice(0, 3).map((move) => `Why is ${move.ticker} moving?`),
      };
    }
    return {
      answer: `${risk.headline} ${risk.items
        .slice(0, 4)
        .map((item) => item.note)
        .join(" ")}`,
      nature: risk.items.some((item) => item.sourceIds.length) ? "inference" : "insufficient_evidence",
      claims: risk.items.slice(0, 4).map((item, index) => ({
        id: `ask-book-${index + 1}`,
        text: item.note,
        nature: item.sourceIds.length ? ("inference" as const) : ("unknown" as const),
        sourceIds: item.sourceIds.slice(0, 3),
        tickers: item.ticker === "BOOK" ? [] : namedTickers(pack, [item.ticker]),
      })),
      sourceIds: unique(risk.items.flatMap((item) => item.sourceIds)).slice(0, 8),
      followUps: risk.items
        .filter((item) => item.ticker !== "BOOK")
        .slice(0, 3)
        .map((item) => `Why is ${item.ticker} moving?`),
    };
  }

  const tokens = q
    .split(/[^a-z0-9.]+/i)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3);
  const themeHits = pack.events.filter((event) =>
    event.themes.some((theme) => {
      const label = themeLabel(theme).toLowerCase();
      return q.includes(theme.replaceAll("_", " ")) || q.includes(label);
    }),
  );
  const scored = (themeHits.length ? themeHits : pack.events)
    .map((event) => {
      const hay = `${event.title} ${event.summary ?? ""} ${event.tickers.join(" ")} ${event.themes.join(" ")} ${event.eventType}`.toLowerCase();
      const hayTokens = new Set(
        hay.split(/[^a-z0-9.]+/i).filter((token) => token.length >= 3),
      );
      const score = tokens.filter((token) => hayTokens.has(token)).length;
      return { event, score };
    })
    .filter((row) => row.score > 0 || themeHits.includes(row.event))
    .sort((a, b) => b.score - a.score || b.event.materialityScore - a.event.materialityScore)
    .slice(0, 5);

  const moveHits = pack.moves.filter((move) =>
    tokens.some((token) => move.ticker.toLowerCase() === token || move.headline.toLowerCase().includes(token)),
  );

  if (!scored.length && !moveHits.length) {
    return {
      answer:
        "That question is not answerable from this session's evidence pack. No matching headline, filing, or attributed move was found.",
      nature: "insufficient_evidence",
      claims: [],
      sourceIds: [],
      followUps: pack.events.slice(0, 3).map((event) => event.title),
    };
  }

  const lead = scored[0]?.event;
  const extras = scored.slice(1).map((row) => row.event.title);
  const moveLine = moveHits
    .slice(0, 2)
    .map((move) => `${move.ticker} ${pct(move.changePercent)} · ${attributionLabel(move.attribution)}`)
    .join("; ");
  return {
    answer: [
      lead
        ? `${typeLabel(lead.eventType)}: ${lead.title}${
            namedTickers(pack, lead.tickers).length
              ? ` (${namedTickers(pack, lead.tickers).join(", ")})`
              : ""
          }.`
        : null,
      extras.length ? `Also in window: ${extras.join(" · ")}.` : null,
      moveLine ? `Tape: ${moveLine}.` : null,
    ]
      .filter(Boolean)
      .join(" "),
    nature: lead && isPrimary(pack, lead.sourceIds) ? "fact" : "inference",
    claims: scored.map((row, index) => ({
      id: `ask-${index + 1}`,
      text: row.event.title,
      nature: isPrimary(pack, row.event.sourceIds)
        ? ("fact" as const)
        : ("inference" as const),
      sourceIds: row.event.sourceIds.slice(0, 3),
      tickers: namedTickers(pack, row.event.tickers),
    })),
    sourceIds: unique(scored.flatMap((row) => row.event.sourceIds)).slice(0, 8),
    followUps: unique([
      ...moveHits.map((move) => `Why is ${move.ticker} moving?`),
      ...pack.moves
        .filter((move) => move.attribution === "unknown")
        .map((move) => `What explains ${move.ticker}?`),
    ]).slice(0, 3),
  };
}
