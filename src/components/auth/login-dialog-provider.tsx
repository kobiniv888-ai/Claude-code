import type { ReactNode } from "react";
import { getLoginConfig } from "@/lib/auth/config";
import { LoginDialogProviderClient } from "./login-dialog";

/**
 * Server component for the site layout: makes `useRequireLogin()` and <LoginButton> open the
 * login dialog in place.
 *
 *   <LoginDialogProvider signedIn={!!user}>{children}</LoginDialogProvider>
 */
export function LoginDialogProvider({ signedIn, children }: { signedIn: boolean; children: ReactNode }) {
  return (
    <LoginDialogProviderClient config={getLoginConfig()} signedIn={signedIn}>
      {children}
    </LoginDialogProviderClient>
  );
}
