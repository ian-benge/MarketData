import { describe, expect, it } from "vitest";
import { parseNasdaqHaltRss } from "@/lib/scanner/halts";

const rss = `<?xml version="1.0"?>
<rss><channel>
<item>
  <title>ABCD halted (LULD)</title>
  <description>Trading in ABCD halted due to LULD band.</description>
  <pubDate>Mon, 17 Aug 2026 14:12:00 GMT</pubDate>
</item>
<item>
  <title>XYZ resumption</title>
  <description>XYZ resume trading after news pending halt.</description>
  <pubDate>Mon, 17 Aug 2026 15:01:00 GMT</pubDate>
</item>
</channel></rss>`;

describe("nasdaq halt RSS", () => {
  it("parses halt and resumption items with reason codes", () => {
    const events = parseNasdaqHaltRss(rss, new Date("2026-08-17T16:00:00.000Z"));
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({ ticker: "ABCD", status: "halted", reasonCode: "LULD" });
    expect(events[1]).toMatchObject({ ticker: "XYZ", status: "resumed", reasonCode: "T1" });
  });
});
