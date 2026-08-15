export type IntelFetchResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; status: number; retryAfterSec?: number };

export function appendRulesParam(url: string): string {
  const parsed = new URL(url, "http://local.invalid");
  parsed.searchParams.set("rules", "1");
  return `${parsed.pathname}${parsed.search}`;
}

export async function fetchIntelProgressive<T>(input: {
  url: string;
  init?: RequestInit;
  rulesInit?: RequestInit;
  signal?: AbortSignal;
  refresh?: boolean;
  onUpdate: (data: T, phase: "rules" | "overlay") => void;
}): Promise<IntelFetchResult<T>> {
  if (input.refresh) {
    const result = await fetchIntelJson<T>(input.url, {
      ...input.init,
      signal: input.signal,
    });
    if (result.ok) input.onUpdate(result.data, "overlay");
    return result;
  }

  let overlayDone = false;
  const overlay = fetchIntelJson<T>(input.url, {
    ...input.init,
    signal: input.signal,
  }).then((result) => {
    if (result.ok) {
      overlayDone = true;
      input.onUpdate(result.data, "overlay");
    }
    return result;
  });

  const rules = await fetchIntelJson<T>(appendRulesParam(input.url), {
    ...(input.rulesInit ?? input.init),
    signal: input.signal,
  });
  if (!overlayDone && rules.ok) input.onUpdate(rules.data, "rules");

  const final = await overlay;
  if (final.ok) return final;
  if (rules.ok) return rules;
  return final;
}

export async function fetchIntelJson<T>(
  url: string,
  init?: RequestInit,
): Promise<IntelFetchResult<T>> {
  try {
    const response = await fetch(url, { cache: "no-store", ...init });
    const body = (await response.json()) as T & {
      error?: string;
      retryAfterSec?: number;
    };
    if (!response.ok) {
      const retry = body.retryAfterSec;
      const error =
        response.status === 429
          ? `Too many requests${retry != null ? ` — retry in ${retry}s` : ""}`
          : (body.error ?? "Intelligence unavailable");
      return {
        ok: false,
        error,
        status: response.status,
        retryAfterSec: retry,
      };
    }
    return { ok: true, data: body };
  } catch {
    return { ok: false, error: "Intelligence unavailable", status: 0 };
  }
}
