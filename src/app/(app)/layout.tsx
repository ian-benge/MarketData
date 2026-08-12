import { redirect } from "next/navigation";
import { DemoBanner } from "@/components/demo/DemoBanner";
import { AppShell } from "@/components/layout/AppShell";
import { getSessionUser } from "@/lib/auth/session";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  return (
    <>
      {user.isDemo ? <DemoBanner role={user.role} /> : null}
      <AppShell role={user.role} email={user.email} isDemo={user.isDemo}>
        {children}
      </AppShell>
    </>
  );
}
