import { Suspense } from "react";
import { LoadingScreen } from "@/components/ui/AccessFrame";
import { isDemoAuthEnabled } from "@/lib/auth/demo";
import LoginClient from "./LoginClient";

export const metadata = {
  title: "Sign in",
  description: "Invite-only access to IB Market Data.",
};

export default function LoginRoute() {
  const demoAvailable = isDemoAuthEnabled();

  return (
    <Suspense fallback={<LoadingScreen label="Preparing secure sign-in" />}>
      <LoginClient demoAvailable={demoAvailable} />
    </Suspense>
  );
}
