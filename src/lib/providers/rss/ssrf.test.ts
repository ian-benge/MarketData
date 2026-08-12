import { describe, expect, it } from "vitest";
import {
  assertSafeOutboundUrl,
  fetchWithSizeLimit,
} from "@/lib/providers/rss/ssrf";

describe("assertSafeOutboundUrl", () => {
  it("allows public https URLs", () => {
    const result = assertSafeOutboundUrl("https://feeds.bbci.co.uk/news/rss.xml");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.url.hostname).toBe("feeds.bbci.co.uk");
    }
  });

  it("rejects non-http(s) schemes", () => {
    const result = assertSafeOutboundUrl("file:///etc/passwd");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/http/);
  });

  it("rejects localhost and loopback", () => {
    expect(assertSafeOutboundUrl("http://localhost/feed").ok).toBe(false);
    expect(assertSafeOutboundUrl("http://127.0.0.1/feed").ok).toBe(false);
  });

  it("rejects private IPv4 ranges", () => {
    expect(assertSafeOutboundUrl("http://10.0.0.5/rss").ok).toBe(false);
    expect(assertSafeOutboundUrl("http://192.168.1.1/rss").ok).toBe(false);
    expect(assertSafeOutboundUrl("http://172.16.0.1/rss").ok).toBe(false);
    expect(assertSafeOutboundUrl("http://169.254.169.254/latest").ok).toBe(
      false,
    );
  });

  it("rejects IPv6 loopback", () => {
    expect(assertSafeOutboundUrl("http://[::1]/rss").ok).toBe(false);
  });
});

describe("fetchWithSizeLimit", () => {
  it("throws when URL fails SSRF checks before fetch", async () => {
    await expect(
      fetchWithSizeLimit("http://127.0.0.1/secret", {
        fetchImpl: async () => new Response("nope"),
      }),
    ).rejects.toThrow(/SSRF blocked/);
  });

  it("throws when response exceeds maxBytes", async () => {
    const body = "x".repeat(100);
    await expect(
      fetchWithSizeLimit("https://example.com/feed.xml", {
        maxBytes: 10,
        fetchImpl: async () => new Response(body, { status: 200 }),
      }),
    ).rejects.toThrow(/size limit/);
  });

  it("returns response when within limits", async () => {
    const res = await fetchWithSizeLimit("https://example.com/feed.xml", {
      maxBytes: 1_000,
      fetchImpl: async () =>
        new Response("<rss></rss>", {
          status: 200,
          headers: { "content-type": "application/xml" },
        }),
    });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("<rss></rss>");
  });
});
