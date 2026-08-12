import React from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import type { DocumentProps } from "@react-pdf/renderer";
import { ReportDocument } from "@/lib/reports/pdf/ReportDocument";
import type { ReportDocumentModel } from "@/lib/reports/content-builder";

/**
 * Render a report document model to a PDF buffer.
 */
export async function renderReportPdf(
  document: ReportDocumentModel,
): Promise<Uint8Array> {
  const element = React.createElement(ReportDocument, {
    document,
  }) as unknown as React.ReactElement<DocumentProps>;
  const buffer = await renderToBuffer(element);
  return new Uint8Array(buffer);
}
