import type { Metadata } from "next";
import { headers } from "next/headers";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowRightIcon, ShieldCheckIcon } from "lucide-react";
import type { AppLocale } from "@/config/site";
import { siteConfig } from "@/config/site";
import { AuthShell } from "@/components/auth/auth-shell";
import { authPageMetadata } from "@/components/auth/metadata";
import { TwoFactorPageClient } from "@/components/auth/two-factor-page-client";
import { Button } from "@/components/ui/button";
import { Link, redirect } from "@/i18n/navigation";
import { safeNextPath, withNext } from "@/lib/auth/next-path";
import { getCurrentUser } from "@/lib/auth/session";
import { isCrossSiteRequest } from "@/lib/auth/staff-session-rules";
import { totpLockState } from "@/lib/auth/totp-lockout";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  return authPageMetadata(locale, "twoFactor");
}

/**
 * The 2-step check for this session. Also the landing page after Google/Apple: accounts
 * without 2-step login (or already verified) are forwarded to ?next straight away.
 *
 * Staff whose session is verified but whose request has no SameSite=Strict staff cookie
 * (SECURITY_REPORT 3.5.a) land here too: after a link from another site (the browser held the
 * cookie back on purpose) a "continue" button is enough; otherwise the code is asked again.
 */
export default async function TwoFactorPage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const next = safeNextPath((await searchParams).next);

  const user = await getCurrentUser();
  if (!user) return redirect({ href: withNext("/login", next), locale });
  const staffCookieMissing = user.isStaff && user.twoFactorEnabled && user.twoFactorVerified && !user.staffCookieOk;
  if (user.twoFactorVerified && !staffCookieMissing) return redirect({ href: next, locale });

  const t = await getTranslations("auth.twoFactor");
  const ts = await getTranslations("security.challenge");
  const icon = (
    <span className="flex size-12 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
      <ShieldCheckIcon className="size-6" aria-hidden />
    </span>
  );
  if (staffCookieMissing && isCrossSiteRequest((await headers()).get("sec-fetch-site"))) {
    return (
      <AuthShell locale={locale as AppLocale} title={ts("continueTitle")} description={ts("continueText")} icon={icon}>
        <Button asChild size="lg" className="h-12 w-full rounded-xl text-base">
          <Link href={next}>
            {ts("continue")}
            <ArrowRightIcon className="rtl:-scale-x-100" aria-hidden />
          </Link>
        </Button>
      </AuthShell>
    );
  }
  const locked = (await totpLockState(user.id)).locked;
  return (
    <AuthShell
      locale={locale as AppLocale}
      title={t("title")}
      description={t("subtitle", { name: siteConfig.name })}
      icon={icon}
      footer={t.rich("help", {
        email: siteConfig.supportEmail,
        link: (chunks) => (
          <a href={`mailto:${siteConfig.supportEmail}`} dir="ltr" className="font-medium text-foreground underline underline-offset-2">
            {chunks}
          </a>
        ),
      })}
    >
      {staffCookieMissing ? (
        <p className="mb-4 rounded-xl bg-surface-muted px-3.5 py-3 text-sm">{ts("staffAgain")}</p>
      ) : null}
      <TwoFactorPageClient next={next} initiallyLocked={locked} />
    </AuthShell>
  );
}
