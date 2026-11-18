import "server-only";
import { redirect } from "@/i18n/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { withNext } from "@/lib/auth/next-path";
import { termsNeededFor } from "./terms-server";

/**
 * The signed-in pages that only lead to actions (the dashboard, the post form): an account that
 * has not accepted the Terms in force (+ 18 or older) is sent to the login's "terms" step first,
 * then back to `next` (S2 review LP-1). Every action checks it again on the server
 * (assertTermsAccepted). A lookup error sends to the step too (fail closed). Demo accounts and
 * signed-out visitors pass (the page itself asks them to sign in).
 */
export async function redirectUntilTermsAccepted(locale: string, next: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user || !user.twoFactorVerified || user.isDemo) return;
  const needed = await termsNeededFor(user.id, "signup").catch(() => true);
  if (needed) redirect({ href: withNext("/login", next), locale });
}
