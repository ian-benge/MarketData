import { EntitlementError } from "@/lib/market-data/schemas";

const DEFAULT_DATA_BASE = "https://data.alpaca.markets";
/** Clock lives on the trading API host; we only allow GET /v2/clock (no orders). */
const DEFAULT_CLOCK_BASE = "https://api.alpaca.markets";
const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_RETRIES = 3;

export type AlpacaClientOptions = {
  keyId: string;
  secretKey: string;
  dataBaseUrl?: string;
  clockBaseUrl?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  stockFeed?: "iex" | "sip";
};

export class AlpacaHttpError extends Error {
  readonly status: number;
  readonly path: string;
  readonly retryAfterMs?: number;

  constructor(
    status: number,
    path: string,
    message: string,
    retryAfterMs?: number,
  ) {
    super(message);
    this.name = "AlpacaHttpError";
    this.status = status;
    this.path = path;
    this.retryAfterMs = retryAfterMs;
  }
}

function parseRetryAfterMs(header: string | null): number | undefined {
  if (!header) return undefined;
  const asInt = Number(header);
  if (Number.isFinite(asInt)) return Math.max(0, asInt * 1000);
  const when = Date.parse(header);
  if (Number.isFinite(when)) return Math.max(0, when - Date.now());
  return undefined;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Alpaca Market Data HTTP client.
 * Uses fixed base URLs only (SSRF-safe). Never calls order/trading endpoints
 * other than the read-only market clock at /v2/clock.
 */
export class AlpacaClient {
  private readonly keyId: string;
  private readonly secretKey: string;
  private readonly dataBaseUrl: string;
  private readonly clockBaseUrl: string;
  private readonly dataHost: string;
  private readonly clockHost: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  readonly stockFeed: "iex" | "sip";

  constructor(options: AlpacaClientOptions) {
    if (!options.keyId || !options.secretKey) {
      throw new Error("AlpacaClient requires keyId and secretKey");
    }
    this.keyId = options.keyId;
    this.secretKey = options.secretKey;
    this.dataBaseUrl = (options.dataBaseUrl ?? DEFAULT_DATA_BASE).replace(
      /\/$/,
      "",
    );
    this.clockBaseUrl = (options.clockBaseUrl ?? DEFAULT_CLOCK_BASE).replace(
      /\/$/,
      "",
    );
    this.dataHost = new URL(this.dataBaseUrl).hostname;
    this.clockHost = new URL(this.clockBaseUrl).hostname;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.stockFeed = options.stockFeed ?? "iex";
  }

  private assertHost(url: URL, expectedHost: string): void {
    if (url.hostname !== expectedHost) {
      throw new Error(
        `Alpaca client refused host "${url.hostname}" — expected fixed host "${expectedHost}".`,
      );
    }
  }

  private authHeaders(): HeadersInit {
    return {
      accept: "application/json",
      "APCA-API-KEY-ID": this.keyId,
      "APCA-API-SECRET-KEY": this.secretKey,
    };
  }

  async getDataJson(
    path: string,
    params: Record<string, string | undefined> = {},
  ): Promise<unknown> {
    const url = new URL(`${this.dataBaseUrl}${path}`);
    this.assertHost(url, this.dataHost);
    for (const [k, v] of Object.entries(params)) {
      if (v != null && v !== "") url.searchParams.set(k, v);
    }
    return this.request(url, path);
  }

  /**
   * Read-only market clock. Path whitelist: /v2/clock only.
   * Does not call order submission or account trading endpoints.
   */
  async getClockJson(): Promise<unknown> {
    const path = "/v2/clock";
    const url = new URL(`${this.clockBaseUrl}${path}`);
    this.assertHost(url, this.clockHost);
    return this.request(url, path);
  }

  private async request(url: URL, path: string): Promise<unknown> {
    let lastError: unknown;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const res = await this.fetchImpl(url.toString(), {
          method: "GET",
          headers: this.authHeaders(),
          signal: controller.signal,
        });

        if (res.status === 401) {
          throw new EntitlementError(
            "http_401",
            `Alpaca unauthorized for ${path}`,
            { providerName: "alpaca", httpStatus: 401 },
          );
        }
        if (res.status === 403) {
          const bodyText = await res.text().catch(() => "");
          const sipDenied =
            this.stockFeed === "sip" ||
            /sip|subscription|entitlement|forbidden/i.test(bodyText);
          throw new EntitlementError(
            sipDenied ? "unauthorized_feed" : "http_403",
            `Alpaca forbidden for ${path}${sipDenied ? " (feed entitlement)" : ""}`,
            { providerName: "alpaca", httpStatus: 403 },
          );
        }
        if (res.status === 429) {
          const retryAfterMs = parseRetryAfterMs(res.headers.get("retry-after"));
          if (attempt < MAX_RETRIES - 1) {
            await sleep(retryAfterMs ?? 500 * 2 ** attempt);
            continue;
          }
          throw new AlpacaHttpError(
            429,
            path,
            `Alpaca rate limited for ${path}`,
            retryAfterMs,
          );
        }
        if (!res.ok) {
          throw new AlpacaHttpError(
            res.status,
            path,
            `Alpaca ${path} failed: HTTP ${res.status}`,
          );
        }
        return res.json();
      } catch (err) {
        lastError = err;
        if (err instanceof EntitlementError || err instanceof AlpacaHttpError) {
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
      : new Error(`Alpaca request failed for ${path}`);
  }
}
