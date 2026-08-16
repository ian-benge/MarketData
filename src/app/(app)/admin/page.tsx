import { Suspense } from "react";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { PageHeader } from "@/components/ui/PageHeader";
import { isDemoAuthEnabled } from "@/lib/auth/demo";
import { getSessionUser } from "@/lib/auth/session";
import AdminClient from "./AdminClient";

export const metadata = {
  title: "Instrument queue",
  description: "Live instrument identity queue. Other admin repositories stay demo-only.",
};

function AdminLoading() {
  return (
    <div
      className="space-y-4"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <PageHeader
        eyebrow="Administration"
        title="Data Operations"
        description="Loading role-gated operational controls and status."
        actions={<Badge tone="brand">Admin only</Badge>}
      />
      <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
        <div className="hidden h-72 rounded-[6px] border border-[var(--ib-border-subtle)] bg-[var(--ib-surface-1)] lg:block" />
        <div className="space-y-3">
          <p className="text-xs text-[var(--ib-text-muted)]">
            Loading administration…
          </p>
          <div className="h-24 rounded-[6px] border border-[var(--ib-border-subtle)] bg-[var(--ib-surface-1)]" />
          <div className="h-44 rounded-[6px] border border-[var(--ib-border-subtle)] bg-[var(--ib-surface-1)]" />
        </div>
      </div>
    </div>
  );
}

export default async function AdminPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/denied");

  return (
    <Suspense fallback={<AdminLoading />}>
      <AdminClient demoMode={isDemoAuthEnabled() || user.isDemo} />
    </Suspense>
  );
}
