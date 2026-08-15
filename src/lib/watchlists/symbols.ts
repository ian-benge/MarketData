export const SYMBOL_PATTERN = /^[A-Z][A-Z0-9.-]{0,14}$/;
export const MAX_WATCHLISTS = 80;
export const MAX_SECTORS = 160;
export const MAX_SYMBOLS = 120;
export const MAX_TAGS = 8;
export const TAG_MAX_LEN = 24;
export const NAME_MAX_LEN = 80;
export const DESCRIPTION_MAX_LEN = 800;

export class CoverageError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "CoverageError";
    this.status = status;
  }
}

export function parseSymbols(value: string | string[]): string[] {
  const raw = Array.isArray(value) ? value : value.split(/[\s,]+/);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const part of raw) {
    const symbol = part.trim().toUpperCase();
    if (!symbol || seen.has(symbol)) continue;
    seen.add(symbol);
    out.push(symbol);
  }
  return out;
}

export function duplicateSymbols(symbols: string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const symbol of symbols) {
    const next = symbol.trim().toUpperCase();
    if (seen.has(next)) duplicates.add(next);
    seen.add(next);
  }
  return [...duplicates];
}

export function validateSymbols(symbols: string | string[]): {
  normalized: string[];
  invalid: string[];
  duplicates: string[];
} {
  const parts = Array.isArray(symbols) ? symbols : symbols.split(/[\s,]+/);
  const normalized = parseSymbols(parts);
  const invalid = normalized.filter((symbol) => !SYMBOL_PATTERN.test(symbol));
  const duplicates = duplicateSymbols(parts);
  return { normalized, invalid, duplicates };
}

export function appendUniqueSymbols(
  existing: string | string[],
  incoming: string | string[],
): {
  next: string[];
  added: string[];
  skipped: string[];
  invalid: string[];
} {
  const next = parseSymbols(existing);
  const seen = new Set(next);
  const checked = validateSymbols(incoming);
  const added: string[] = [];
  const skipped: string[] = [];
  for (const symbol of checked.normalized) {
    if (!SYMBOL_PATTERN.test(symbol)) continue;
    if (seen.has(symbol)) {
      skipped.push(symbol);
      continue;
    }
    if (next.length >= MAX_SYMBOLS) break;
    seen.add(symbol);
    next.push(symbol);
    added.push(symbol);
  }
  return { next, added, skipped, invalid: checked.invalid };
}

export function assertSymbols(
  symbols: string | string[],
  { allowEmpty = false } = {},
) {
  const { normalized, invalid, duplicates } = validateSymbols(symbols);
  if (!allowEmpty && normalized.length === 0) {
    throw new CoverageError("Enter at least one ticker symbol.", 400);
  }
  if (invalid.length) {
    throw new CoverageError(
      `Use valid uppercase ticker symbols. Check: ${invalid.join(", ")}.`,
      400,
    );
  }
  if (duplicates.length) {
    throw new CoverageError(
      `Remove duplicate symbols: ${duplicates.join(", ")}.`,
      400,
    );
  }
  if (normalized.length > MAX_SYMBOLS) {
    throw new CoverageError(
      `A coverage list can hold at most ${MAX_SYMBOLS} symbols.`,
      400,
    );
  }
  return normalized;
}

export function normalizeName(value: string): string {
  const next = value.trim().replace(/\s+/g, " ");
  if (!next) throw new CoverageError("Enter a name.", 400);
  if (next.length > NAME_MAX_LEN) {
    throw new CoverageError(`Name must be ${NAME_MAX_LEN} characters or fewer.`, 400);
  }
  return next;
}

export function normalizeDescription(
  value: string | null | undefined,
): string | null {
  if (value == null) return null;
  const next = value.trim();
  if (!next) return null;
  if (next.length > DESCRIPTION_MAX_LEN) {
    throw new CoverageError(
      `Description must be ${DESCRIPTION_MAX_LEN} characters or fewer.`,
      400,
    );
  }
  return next;
}

export function normalizeTags(tags: string[] | undefined): string[] {
  if (!tags?.length) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const tag of tags) {
    const next = tag.trim().toLowerCase().slice(0, TAG_MAX_LEN);
    if (!next || seen.has(next)) continue;
    seen.add(next);
    out.push(next);
    if (out.length >= MAX_TAGS) break;
  }
  return out;
}

export function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug || "coverage";
}

export function copyName(name: string): string {
  const base = name.replace(/\s*\(copy(?: \d+)?\)\s*$/i, "").trim();
  return `${base} (copy)`.slice(0, NAME_MAX_LEN);
}
