"use client";

import { AdminWorkspace } from "@/components/admin/AdminWorkspace";

export default function AdminClient({ demoMode }: { demoMode: boolean }) {
  return <AdminWorkspace demoMode={demoMode} />;
}
