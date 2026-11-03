import "server-only";
import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";
import { KeyRoundIcon } from "lucide-react";
import { codeDisplayForHeaders } from "@/lib/auth/code-display";
import { loginMethodsStatus } from "@/lib/auth/login-methods";

/**
 * Admin overview and settings: a red banner while the site runs in production with neither Google
 * login keys nor RESEND_API_KEY, i.e. nobody can log in on the real site (round 3, section 1). In
 * a codespace test mode codes still show on screen, and the banner says so. Renders nothing when a
 * login method is set up (and in development).
 */
export async function LoginMethodsBanner() {
  if (!loginMethodsStatus(process.env).noneInProduction) return null;
  const [t, requestHeaders] = await Promise.all([getTranslations("auth.loginMethods"), headers()]);
  const testMode = codeDisplayForHeaders(requestHeaders) !== null;
  return (
    <div role="alert" className="mb-5 flex gap-3 rounded-2xl border border-destructive/40 bg-destructive/5 p-4 text-sm">
      <KeyRoundIcon className="mt-0.5 size-5 shrink-0 text-destructive" aria-hidden />
      <div className="grid min-w-0 gap-1">
        <p className="font-semibold text-destructive">{t("title")}</p>
        <p className="text-foreground">
          {t.rich("body", {
            code: (chunks) => (
              <code dir="ltr" className="rounded bg-background px-1 font-mono text-xs whitespace-nowrap">
                {chunks}
              </code>
            ),
          })}
        </p>
        {testMode ? <p className="text-muted-foreground">{t("testMode")}</p> : null}
      </div>
    </div>
  );
}
