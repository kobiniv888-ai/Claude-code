import type { ReactNode } from "react";
import { getLocale } from "next-intl/server";
import { getLoginConfig } from "@/lib/auth/config";
import { LoginDialogProviderClient } from "./login-dialog";

/**
 * Server component for the site layout: makes `useRequireLogin()` and <LoginButton> open the
 * login dialog in place.
 *
 *   <LoginDialogProvider signedIn={!!user}>{children}</LoginDialogProvider>
 */
export async function LoginDialogProvider({ signedIn, children }: { signedIn: boolean; children: ReactNode }) {
  const locale = await getLocale();
  return (
    <LoginDialogProviderClient config={await getLoginConfig(locale)} signedIn={signedIn}>
      {children}
    </LoginDialogProviderClient>
  );
}
