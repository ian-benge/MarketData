import { createHash } from "node:crypto";
import type { SessionUser } from "@/lib/auth/session";
import type { Env } from "@/lib/env";
import { getEnv } from "@/lib/env";
import { searchIntelligence } from "@/lib/intelligence/service";
import { inferUsEquitySession } from "@/lib/market-data/us-session";
import { evidenceHash } from "./evidence";
import {
  generateAskAnswer,
  generateBookRisk,
  generateMoveNarrative,
  generateNewsDigest,
  generateQueryInterpret,
  generateSessionBrief,
  type GenerateOptions,
} from "./generate";
import { loadDeskPack } from "./context";
import { hasAnyAiCredentials, deskIntelEnabled } from "./models";
import { DESK_INTEL_PROMPT_VERSIONS } from "./prompts";
import { firmIdFor, loadBrief, recordUsage, saveBrief } from "./store";
import { mergeInterpretedQuery, queryLooksNatural } from "./query-interpret";
import type {
  AskAnswer,
  BookRisk,
  DeskIntelEnvelope,
  DeskIntelKind,
  MoveNarrative,
  NewsDigest,
  SessionBrief,
} from "./types";

const memory = new Map<string, DeskIntelEnvelope<unknown>>();

function memKey(
  firmId: string,
  kind: DeskIntelKind,
  subject: string,
  hash: string,
  promptVersion: string,
): string {
  return `${firmId}:${kind}:${subject}:${hash}:${promptVersion}`;
}

async function cachedOrGenerate<T>(input: {
  user: SessionUser;
  kind: DeskIntelKind;
  subject: string;
  hash: string;
  promptVersion: string;
  generate: () => Promise<DeskIntelEnvelope<T>>;
  forceRefresh?: boolean;
  rulesOnly?: boolean;
}): Promise<DeskIntelEnvelope<T>> {
  const firmId = firmIdFor(input.user.firmId);
  const key = memKey(
    firmId,
    input.kind,
    input.subject,
    input.hash,
    input.promptVersion,
  );
  if (!input.forceRefresh) {
    const hit = memory.get(key) as DeskIntelEnvelope<T> | undefined;
    if (hit) return { ...hit, cached: true };
    const stored = await loadBrief<T>({
      firmId,
      kind: input.kind,
      subject: input.subject,
      evidenceHash: input.hash,
      promptVersion: input.promptVersion,
    });
    if (stored) {
      memory.set(key, stored);
      return stored;
    }
  }
  const started = Date.now();
  const envelope = await input.generate();
  if (input.rulesOnly) {
    return envelope;
  }
  memory.set(key, envelope);
  await saveBrief(firmId, envelope, input.user.id);
  void recordUsage({
    firmId,
    purpose: input.kind,
    providerName: envelope.providerName ?? envelope.method,
    model: envelope.model,
    ok: true,
    latencyMs: Date.now() - started,
    inputTokens: envelope.inputTokens ?? undefined,
    outputTokens: envelope.outputTokens ?? undefined,
    metadata: {
      method: envelope.method,
      evidenceHash: envelope.evidenceHash,
      warningCount: envelope.warnings.length,
    },
  });
  return envelope;
}

export async function getSessionBrief(
  user: SessionUser,
  options: GenerateOptions & { ingest?: boolean } = {},
): Promise<DeskIntelEnvelope<SessionBrief>> {
  const env = options.env ?? getEnv();
  const pack = options.pack ?? (await loadDeskPack(user, { ingest: options.ingest }, env));
  return cachedOrGenerate({
    user,
    kind: "session_brief",
    subject: "session",
    hash: evidenceHash(pack.identity),
    promptVersion: DESK_INTEL_PROMPT_VERSIONS.session_brief,
    forceRefresh: options.forceRefresh,
    rulesOnly: options.rulesOnly,
    generate: () => generateSessionBrief(pack, options),
  });
}

export async function getMoveNarrative(
  user: SessionUser,
  ticker: string,
  options: GenerateOptions = {},
): Promise<DeskIntelEnvelope<MoveNarrative>> {
  const env = options.env ?? getEnv();
  const subject = ticker.toUpperCase();
  const pack =
    options.pack ??
    (await loadDeskPack(user, { priorityTickers: [subject] }, env));
  return cachedOrGenerate({
    user,
    kind: "move_narrative",
    subject,
    hash: evidenceHash(pack.identity),
    promptVersion: DESK_INTEL_PROMPT_VERSIONS.move_narrative,
    forceRefresh: options.forceRefresh,
    rulesOnly: options.rulesOnly,
    generate: () => generateMoveNarrative(pack, subject, options),
  });
}

export async function getMoveNarratives(
  user: SessionUser,
  tickers: string[],
  options: GenerateOptions = {},
): Promise<DeskIntelEnvelope<MoveNarrative>[]> {
  const env = options.env ?? getEnv();
  const unique = [...new Set(tickers.map((ticker) => ticker.toUpperCase()))].slice(
    0,
    8,
  );
  const pack =
    options.pack ??
    (await loadDeskPack(user, { priorityTickers: unique }, env));
  return Promise.all(
    unique.map((ticker) => getMoveNarrative(user, ticker, { ...options, pack })),
  );
}

export async function getBookRisk(
  user: SessionUser,
  options: GenerateOptions = {},
): Promise<DeskIntelEnvelope<BookRisk>> {
  const env = options.env ?? getEnv();
  const pack =
    options.pack ??
    (await loadDeskPack(user, { includePositions: true }, env));
  return cachedOrGenerate({
    user,
    kind: "book_risk",
    subject: "book",
    hash: evidenceHash(pack.identity),
    promptVersion: DESK_INTEL_PROMPT_VERSIONS.book_risk,
    forceRefresh: options.forceRefresh,
    rulesOnly: options.rulesOnly,
    generate: () => generateBookRisk(pack, options),
  });
}

export async function getNewsDigest(
  user: SessionUser,
  query = "",
  options: GenerateOptions = {},
): Promise<DeskIntelEnvelope<NewsDigest>> {
  const env = options.env ?? getEnv();
  const session = inferUsEquitySession();
  const subject = query.trim() ? query.trim().slice(0, 80) : "digest";
  const search = query.trim()
    ? await searchIntelligence(env, query, { query, limit: 24 }, {
        quotes: undefined,
        session,
        ingest: false,
      })
    : null;
  const pack = await loadDeskPack(
    user,
    { events: search?.events },
    env,
  );
  return cachedOrGenerate({
    user,
    kind: "news_digest",
    subject,
    hash: evidenceHash(pack.identity),
    promptVersion: DESK_INTEL_PROMPT_VERSIONS.news_digest,
    forceRefresh: options.forceRefresh,
    rulesOnly: options.rulesOnly,
    generate: () => generateNewsDigest(pack, { ...options, subject }),
  });
}

export async function askDesk(
  user: SessionUser,
  question: string,
  options: GenerateOptions = {},
): Promise<DeskIntelEnvelope<AskAnswer>> {
  const env = options.env ?? getEnv();
  const pack = options.pack ?? (await loadDeskPack(user, {}, env));
  const subject = createHash("sha256")
    .update(question.trim().toLowerCase())
    .digest("hex")
    .slice(0, 16);
  return cachedOrGenerate({
    user,
    kind: "grounded_ask",
    subject,
    hash: evidenceHash({ q: question.trim().toLowerCase(), id: pack.identity }),
    promptVersion: DESK_INTEL_PROMPT_VERSIONS.grounded_ask,
    forceRefresh: options.forceRefresh,
    rulesOnly: options.rulesOnly,
    generate: () => generateAskAnswer(pack, question, options),
  });
}

export async function interpretNewsQuery(
  user: SessionUser,
  query: string,
  env: Env = getEnv(),
) {
  if (process.env.NODE_ENV === "test") return null;
  if (!queryLooksNatural(query)) return null;
  if (!deskIntelEnabled(env) || !hasAnyAiCredentials(env)) return null;
  const pack = await loadDeskPack(user, {}, env);
  const interpreted = await generateQueryInterpret(pack, query, { env });
  if (!interpreted) return null;
  interpreted.tickers = interpreted.tickers.filter((ticker) =>
    pack.allowedTickers.includes(ticker.toUpperCase()),
  );
  return mergeInterpretedQuery(query, interpreted, new Date());
}

export function resetDeskIntelMemory() {
  memory.clear();
}

export function rulesOnlyFromRequest(request: Request): boolean {
  return new URL(request.url).searchParams.get("rules") === "1";
}
