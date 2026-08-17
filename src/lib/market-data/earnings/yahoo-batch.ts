export const YAHOO_QUOTE_CHUNK_SIZE = 20;
export const YAHOO_SPARK_CHUNK_SIZE = 10;
export const YAHOO_CHUNK_CONCURRENCY = 4;
export const YAHOO_MAX_ATTEMPTS = 3;

export type YahooChunkFailure = {
  symbols: string[];
  status: number | null;
  message: string;
  attempts: number;
};

export type YahooChunkSuccess<T> = {
  ok: true;
  value: T;
};

export type YahooChunkRetry = {
  ok: false;
  status: number | null;
  message: string;
  retryable: boolean;
  split?: boolean;
};

export type YahooChunkLoadResult<T> = YahooChunkSuccess<T> | YahooChunkRetry;

export function chunkList<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  const step = Math.max(1, Math.floor(size));
  for (let index = 0; index < items.length; index += step) {
    chunks.push(items.slice(index, index + step));
  }
  return chunks;
}

export function isRetryableYahooStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

export function retryDelayMs(
  attempt: number,
  retryAfterHeader?: string | null,
): number {
  const parsed = retryAfterHeader ? Number.parseInt(retryAfterHeader, 10) : Number.NaN;
  if (Number.isFinite(parsed) && parsed >= 0) {
    return Math.min(parsed * 1000, 8_000);
  }
  const exp = Math.min(1_000 * 2 ** Math.max(0, attempt - 1), 4_000);
  return exp;
}

function splitChunk(chunk: string[]): [string[], string[]] {
  const mid = Math.max(1, Math.floor(chunk.length / 2));
  return [chunk.slice(0, mid), chunk.slice(mid)];
}

/**
 * Runs Yahoo symbol chunks with bounded concurrency. Failed chunks never abort
 * siblings. 429/5xx/timeouts retry; oversized payloads split and retry.
 */
export async function mapYahooChunks<T>(options: {
  chunks: string[][];
  concurrency?: number;
  maxAttempts?: number;
  sleep?: (ms: number) => Promise<void>;
  load: (chunk: string[], attempt: number) => Promise<YahooChunkLoadResult<T>>;
}): Promise<{ values: T[]; failures: YahooChunkFailure[] }> {
  const queue = [...options.chunks.filter((chunk) => chunk.length > 0)];
  const attempts = new Map<string, number>();
  const values: T[] = [];
  const failures: YahooChunkFailure[] = [];
  const maxAttempts = options.maxAttempts ?? YAHOO_MAX_ATTEMPTS;
  const sleep = options.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  const workers = Math.min(options.concurrency ?? YAHOO_CHUNK_CONCURRENCY, queue.length || 0);

  async function worker() {
    while (queue.length) {
      const chunk = queue.shift();
      if (!chunk?.length) continue;
      const key = chunk.join(",");
      const attempt = (attempts.get(key) ?? 0) + 1;
      attempts.set(key, attempt);
      try {
        const result = await options.load(chunk, attempt);
        if (result.ok) {
          values.push(result.value);
          continue;
        }
        if (result.split && chunk.length > 1) {
          const [left, right] = splitChunk(chunk);
          if (left.length) queue.unshift(left);
          if (right.length) queue.unshift(right);
          continue;
        }
        if (result.retryable && attempt < maxAttempts) {
          await sleep(retryDelayMs(attempt, null));
          queue.push(chunk);
          continue;
        }
        failures.push({
          symbols: chunk,
          status: result.status,
          message: result.message,
          attempts: attempt,
        });
      } catch (caught) {
        const message =
          caught instanceof Error ? caught.message.slice(0, 240) : "Yahoo chunk failed.";
        const split = /exceeds size limit/i.test(message) && chunk.length > 1;
        if (split) {
          const [left, right] = splitChunk(chunk);
          if (left.length) queue.unshift(left);
          if (right.length) queue.unshift(right);
          continue;
        }
        if (attempt < maxAttempts) {
          await sleep(retryDelayMs(attempt, null));
          queue.push(chunk);
          continue;
        }
        failures.push({
          symbols: chunk,
          status: null,
          message,
          attempts: attempt,
        });
      }
    }
  }

  await Promise.all(Array.from({ length: Math.max(workers, 0) }, () => worker()));
  return { values, failures };
}

export type YahooSymbolDiagnostic = {
  ticker: string;
  status: "ok" | "unknown_symbol" | "provider_error";
  error: string | null;
};

export function diagnoseYahooSymbols(input: {
  requested: string[];
  received: Iterable<string>;
  failures: YahooChunkFailure[];
  yahooSymbolFor: (symbol: string) => string;
}): YahooSymbolDiagnostic[] {
  const received = new Set(
    [...input.received].map((symbol) => symbol.trim().toUpperCase()).filter(Boolean),
  );
  const failedYahoo = new Map<string, YahooChunkFailure>();
  for (const failure of input.failures) {
    for (const symbol of failure.symbols) {
      failedYahoo.set(symbol.toUpperCase(), failure);
    }
  }
  return input.requested.map((ticker) => {
    const canonical = ticker.trim().toUpperCase();
    const yahoo = input.yahooSymbolFor(ticker).toUpperCase();
    if (received.has(canonical) || received.has(yahoo)) {
      return { ticker: canonical, status: "ok" as const, error: null };
    }
    const failure = failedYahoo.get(yahoo) ?? failedYahoo.get(canonical);
    if (failure) {
      return {
        ticker: canonical,
        status: "provider_error" as const,
        error: failure.message,
      };
    }
    return {
      ticker: canonical,
      status: "unknown_symbol" as const,
      error: "Quote provider returned no row for this symbol.",
    };
  });
}
