import { describe, expect, it } from "vitest";
import { reportPdfFilename } from "@/lib/reports/filenames";

describe("reportPdfFilename", () => {
  it("uses the Close_Postmarket slug", () => {
    expect(reportPdfFilename("2026-08-10", "close_postmarket")).toBe(
      "IB_Market_Data_2026-08-10_Close_Postmarket.pdf",
    );
  });
});
