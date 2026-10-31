import type { ReactNode } from "react";
import { getLoginConfig } from "@/lib/auth/config";
import { LoginDialogProviderClient } from "./login-dialog";

/**
 * Server component for the site layout: makes `useRequireLogin()` and <LoginButton> open the
 * login dialog in place.
 *
 *   <LoginDialogProvider>{children}</LoginDialogProvider>
 */
export function LoginDialogProvider({ children }: { children: ReactNode }) {
  return <LoginDialogProviderClient config={getLoginConfig()}>{children}</LoginDialogProviderClient>;
}
