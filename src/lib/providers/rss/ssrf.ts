/**
 * SSRF guards for outbound URL fetches (RSS allowlist consumers).
 */

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "metadata.google.internal",
  "metadata.google",
]);

export const DEFAULT_RSS_MAX_BYTES = 1_500_000;

export type SsrfCheckResult =
  | { ok: true; url: URL }
  | { ok: false; reason: string };

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    if (!/^\d+$/.test(p)) return null;
    const v = Number(p);
    if (v < 0 || v > 255) return null;
    n = (n << 8) + v;
  }
  return n >>> 0;
}

function isPrivateOrLocalIpv4(ip: string): boolean {
  const n = ipv4ToInt(ip);
  if (n == null) return true;
  // Use >>> 0 so mask compares are unsigned (JS bitwise is Int32).
  const u = (mask: number) => (n & mask) >>> 0;
  // 0.0.0.0/8, 10/8, 127/8, 169.254/16, 172.16/12, 192.168/16
  if (u(0xff000000) === 0x00000000) return true;
  if (u(0xff000000) === 0x0a000000) return true;
  if (u(0xff000000) === 0x7f000000) return true;
  if (u(0xffff0000) === 0xa9fe0000) return true;
  if (u(0xfff00000) === 0xac100000) return true;
  if (u(0xffff0000) === 0xc0a80000) return true;
  // 100.64/10 carrier-grade NAT
  if (u(0xffc00000) === 0x64400000) return true;
  return false;
}

function isBlockedIpv6(host: string): boolean {
  const h = host.toLowerCase();
  if (h === "::1") return true;
  if (h.startsWith("fc") || h.startsWith("fd")) return true; // ULA
  if (h.startsWith("fe80")) return true; // link-local
  // IPv4-mapped
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(h);
  if (mapped?.[1] && isPrivateOrLocalIpv4(mapped[1])) return true;
  return false;
}

/**
 * Validate that a URL is safe to fetch: http(s) only, no private hosts.
 * Does not perform DNS resolution — blocks literal private IPs and localhost names.
 */
export function assertSafeOutboundUrl(raw: string): SsrfCheckResult {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return { ok: false, reason: "invalid URL" };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, reason: "only http(s) URLs are allowed" };
  }

  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (BLOCKED_HOSTNAMES.has(host)) {
    return { ok: false, reason: `blocked hostname: ${host}` };
  }
  if (host.endsWith(".localhost") || host.endsWith(".local")) {
    return { ok: false, reason: `blocked hostname: ${host}` };
  }
  if (host.includes(":")) {
    if (isBlockedIpv6(host)) {
      return { ok: false, reason: `blocked IPv6 address: ${host}` };
    }
  } else if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    if (isPrivateOrLocalIpv4(host)) {
      return { ok: false, reason: `blocked private IPv4: ${host}` };
    }
  }

  return { ok: true, url };
}

export async function fetchWithSizeLimit(
  url: string,
  init: RequestInit & { maxBytes?: number; fetchImpl?: typeof fetch } = {},
): Promise<Response> {
  const check = assertSafeOutboundUrl(url);
  if (!check.ok) {
    throw new Error(`SSRF blocked: ${check.reason}`);
  }

  const fetchImpl = init.fetchImpl ?? fetch;
  const maxBytes = init.maxBytes ?? DEFAULT_RSS_MAX_BYTES;
  const { maxBytes: _ignoredMax, fetchImpl: _ignoredFetch, ...rest } = init;
  void _ignoredMax;
  void _ignoredFetch;
  const res = await fetchImpl(check.url.toString(), rest);
  const buf = await res.arrayBuffer();
  if (buf.byteLength > maxBytes) {
    throw new Error(
      `Response exceeds size limit (${buf.byteLength} > ${maxBytes} bytes)`,
    );
  }
  return new Response(buf, {
    status: res.status,
    statusText: res.statusText,
    headers: res.headers,
  });
}
