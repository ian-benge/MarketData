import { EdgeActionLink, StateScreen } from "@/components/ui/AccessFrame";

export default function NotFound() {
  return (
    <StateScreen
      code="404"
      eyebrow="Navigation"
      title="Page not found"
      description="The requested IB Market Data destination does not exist or is no longer available."
      actions={
        <>
          <EdgeActionLink href="/dashboard" variant="primary">
            Open Market Overview
          </EdgeActionLink>
          <EdgeActionLink href="/archive">
            Search Research Archive
          </EdgeActionLink>
        </>
      }
    />
  );
}
