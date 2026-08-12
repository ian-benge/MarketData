"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/Button";

export function FormSubmitButton({
  label,
  pendingLabel,
  className,
}: {
  label: string;
  pendingLabel: string;
  className?: string;
}) {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      variant="primary"
      disabled={pending}
      aria-busy={pending}
      className={className}
    >
      {pending ? pendingLabel : label}
    </Button>
  );
}
