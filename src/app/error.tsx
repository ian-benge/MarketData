"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/Button";
import { EdgeActionLink, StateScreen } from "@/components/ui/AccessFrame";

export default function AppError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <StateScreen
      code="500"
      eyebrow="Unexpected error"
      title="The workspace could not finish loading"
      description="An unexpected application error interrupted this view. Retry the view, then verify its current state before repeating any write action."
      actions={
        <>
          <Button
            variant="primary"
            className="h-11 px-4"
            onClick={() => retry()}
          >
            Try again
          </Button>
          <EdgeActionLink href="/dashboard">
            Return to Market Overview
          </EdgeActionLink>
        </>
      }
    >
      {error.digest ? (
        <p className="font-mono text-xs text-[var(--muted)]">
          Support reference: {error.digest}
        </p>
      ) : null}
    </StateScreen>
  );
}
