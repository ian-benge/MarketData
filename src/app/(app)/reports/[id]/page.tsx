import { notFound } from "next/navigation";
import { ReportReader } from "@/components/reports/ReportReader";
import { formatEdition } from "@/components/reports/report-format";
import { StatePanel } from "@/components/ui/StatePanel";
import { isDemoAuthEnabled } from "@/lib/auth/demo";
import { getFixtureReport } from "@/lib/fixtures/reports";
import { getLiveReport, isLiveReportsAvailable } from "@/lib/reports/live-reports";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const report = isDemoAuthEnabled()
    ? getFixtureReport(id)
    : isLiveReportsAvailable()
      ? await getLiveReport(id)
      : null;
  return {
    title: report
      ? `${formatEdition(report.edition)} report · ${report.tradingDate}`
      : `Report ${id}`,
  };
}

export default async function ReportDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (isDemoAuthEnabled()) {
    const report = getFixtureReport(id);
    if (!report) notFound();
    return <ReportReader report={report} />;
  }
  if (!isLiveReportsAvailable()) {
    return (
      <StatePanel
        kind="unavailable"
        title="Report unavailable"
        description="A live report repository is not connected in this environment. Demo report content is never displayed as production research."
      />
    );
  }
  const report = await getLiveReport(id);
  if (!report) notFound();

  return <ReportReader report={report} />;
}
