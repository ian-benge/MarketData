/**
 * Generate a fixture PDF and assert basic invariants.
 * Usage: npx tsx scripts/verify-pdf.ts
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { demoReportDocument } from "../src/lib/fixtures/demo-report";
import { renderReportPdf } from "../src/lib/reports/pdf/render-pdf";
import { SECTION_TITLES } from "../src/lib/reports/section-keys";

async function main(): Promise<void> {
  const outDir = path.join(process.cwd(), "tmp");
  await mkdir(outDir, { recursive: true });

  const editions = ["premarket", "midday", "close_postmarket"] as const;
  for (const edition of editions) {
    const document = demoReportDocument(edition);
    const pdfBytes = await renderReportPdf(document);
    if (pdfBytes.byteLength <= 1000) {
      throw new Error(
        `PDF too small for ${edition}: ${pdfBytes.byteLength} bytes (expected > 1000)`,
      );
    }
    const outPath = path.join(
      outDir,
      edition === "close_postmarket"
        ? "fixture-report.pdf"
        : `fixture-report-${edition}.pdf`,
    );
    await writeFile(outPath, pdfBytes);
    console.log(
      `[verify-pdf] ${edition} ${pdfBytes.byteLength} bytes · chains ${document.analytics.causality.length} · ideas ${document.tradeIdeas.length} · heatmap ${document.analytics.heatmap.length} · ${outPath}`,
    );
    if (edition === "close_postmarket") {
      const asLatin1 = Buffer.from(pdfBytes).toString("latin1");
      const requiredTitles = [
        SECTION_TITLES.executive_summary,
        SECTION_TITLES.market_snapshot,
        SECTION_TITLES.material_movers,
        SECTION_TITLES.methodology,
        "CONFIDENTIAL",
      ];
      const missing = requiredTitles.filter((t) => !asLatin1.includes(t));
      if (missing.length > 0) {
        console.warn(
          `[verify-pdf] Warning: could not locate strings in PDF stream: ${missing.join(", ")}`,
        );
        console.warn(
          "[verify-pdf] Document built successfully; string presence is best-effort for compressed streams.",
        );
      }
    }
  }
}

main().catch((err) => {
  console.error("[verify-pdf] failed:", err);
  process.exitCode = 1;
});
