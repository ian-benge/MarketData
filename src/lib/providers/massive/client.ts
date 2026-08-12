import { EntitlementError } from "@/lib/market-data/schemas";

const DEFAULT_BASE = "https://api.massive.com";
const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_RETRIES = 3;

export type MassiveClientOptions = {
  apiKey: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  /**
   * When true, treat responses as FMV/aggregate-oriented for provenance.
   * Does not claim tick-level full-market NBBO unless plan metadata says so.
   */
  preferFmv?: boolean;
};

export class MassiveHttpError extends Error {
  readonly status: number;
  readonly path: string;

  constructor(status: number, path: string, message: string) {
    super(message);
    this.name = "MassiveHttpError";
    this.status = status;
    this.path = path;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseRetryAfterMs(header: string | null): number | undefined {
  if (!header) return undefined;
  const asInt = Number(header);
  if (Number.isFinite(asInt)) return Math.max(0, asInt * 1000);
  const when = Date.parse(header);
  if (Number.isFinite(when)) return Math.max(0, when - Date.now());
  return undefined;
}

/**
 * Massive (formerly Polygon.io) REST client.
 * Fixed base URL only. Paths follow documented Massive/Polygon-compatible REST:
 * https://api.massive.com — e.g. /v2/snapshot/..., /v2/aggs/..., /v1/marketstatus/now.
 * Base URL is configuration-gated via MASSIVE_API_BASE_URL; default is the documented host.
 */
export class MassiveClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly host: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  readonly preferFmv: boolean;

  constructor(options: MassiveClientOptions) {
    if (!options.apiKey) {
      throw new Error("MassiveClient requires apiKey");
    }
    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE).replace(/\/$/, "");
    this.host = new URL(this.baseUrl).hostname;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.preferFmv = options.preferFmv ?? false;
  }

  async getJson(
    path: string,
    params: Record<string, string | undefined> = {},
  ): Promise<unknown> {
    const url = new URL(`${this.baseUrl}${path}`);
    if (url.hostname !== this.host) {
      throw new Error(
        `Massive client refused host "${url.hostname}" — expected fixed host "${this.host}".`,
      );
    }
    for (const [k, v] of Object.entries(params)) {
      if (v != null && v !== "") url.searchParams.set(k, v);
    }
    url.searchParams.set("apiKey", this.apiKey);

    let lastError: unknown;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const res = await this.fetchImpl(url.toString(), {
          method: "GET",
          headers: { accept: "application/json" },
          signal: controller.signal,
        });

        if (res.status === 401) {
          throw new EntitlementError("http_401", `Massive unauthorized for ${path}`, {
            providerName: "massive",
            httpStatus: 401,
          });
        }
        if (res.status === 403) {
          const text = await res.text().catch(() => "");
          const plan =
            /plan|subscription|upgrade|entitlement|not (included|available)/i.test(
              text,
            );
          throw new EntitlementError(
            plan ? "plan_limit" : "http_403",
            `Massive forbidden for ${path}`,
            { providerName: "massive", httpStatus: 403 },
          );
        }
        if (res.status === 404) {
          throw new EntitlementError(
            "feature_unavailable",
            `Massive feature unavailable for ${path}`,
            { providerName: "massive", httpStatus: 404 },
          );
        }
        if (res.status === 429) {
          const retryAfterMs = parseRetryAfterMs(res.headers.get("retry-after"));
          if (attempt < MAX_RETRIES - 1) {
            await sleep(retryAfterMs ?? 500 * 2 ** attempt);
            continue;
          }
          throw new EntitlementError("plan_limit", `Massive rate limited for ${path}`, {
            providerName: "massive",
            httpStatus: 429,
          });
        }
        if (!res.ok) {
          throw new MassiveHttpError(
            res.status,
            path,
            `Massive ${path} failed: HTTP ${res.status}`,
          );
        }
        return res.json();
      } catch (err) {
        lastError = err;
        if (err instanceof EntitlementError || err instanceof MassiveHttpError) {
          throw err;
        }
        if (attempt < MAX_RETRIES - 1) {
          await sleep(250 * 2 ** attempt);
          continue;
        }
      } finally {
        clearTimeout(timer);
      }
    }
    throw lastError instanceof Error
      ? lastError
      : new Error(`Massive request failed for ${path}`);
  }
}
