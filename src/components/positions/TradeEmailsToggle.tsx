"use client";

import { Mail, MailX } from "lucide-react";
import { Button } from "@/components/ui/Button";

export function TradeEmailsToggle({
  enabled,
  busy,
  onToggle,
}: {
  enabled: boolean;
  busy?: boolean;
  onToggle: (enabled: boolean) => void;
}) {
  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      disabled={busy}
      aria-pressed={enabled}
      aria-label={
        enabled
          ? "Turn off email notifications for trades in this account"
          : "Turn on email notifications for trades in this account"
      }
      onClick={() => onToggle(!enabled)}
    >
      {enabled ? (
        <Mail aria-hidden="true" className="size-3.5" />
      ) : (
        <MailX aria-hidden="true" className="size-3.5" />
      )}
      {enabled ? "Trade emails on" : "Trade emails off"}
    </Button>
  );
}
