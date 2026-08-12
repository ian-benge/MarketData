import {
  editionPdfSlug,
  type ReportEdition,
} from "@/lib/reports/editions";

/**
 * Canonical download / email attachment name.
 * Example: IB_Market_Data_2026-08-10_Close_Postmarket.pdf
 */
export function reportPdfFilename(
  tradingDate: string,
  edition: ReportEdition | string,
): string {
  return `IB_Market_Data_${tradingDate}_${editionPdfSlug(edition)}.pdf`;
}
