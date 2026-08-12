import { EdgeActionLink, StateScreen } from "@/components/ui/AccessFrame";

export const metadata = {
  title: "Access denied",
  description:
    "This account does not have access to the requested IB Market Data resource.",
};

export default function DeniedPage() {
  return (
    <StateScreen
      code="403"
      eyebrow="Authorization"
      title="Access denied"
      description="Your session is valid, but this account does not have permission to open the requested resource. No settings or data were changed."
      actions={
        <>
          <EdgeActionLink href="/dashboard" variant="primary">
            Return to Market Overview
          </EdgeActionLink>
          <EdgeActionLink href="/archive">Open Research Archive</EdgeActionLink>
        </>
      }
    />
  );
}
