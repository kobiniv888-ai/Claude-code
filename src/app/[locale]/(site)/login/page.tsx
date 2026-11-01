import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { AppLocale } from "@/config/site";
import { siteConfig } from "@/config/site";
import { AuthShell } from "@/components/auth/auth-shell";
import { LoginPanel } from "@/components/auth/login-panel";
import { authPageMetadata } from "@/components/auth/metadata";
import { redirect } from "@/i18n/navigation";
import { getLoginConfig } from "@/lib/auth/config";
import { oauthErrorKey } from "@/lib/auth/error-codes";
import { safeNextPath, withNext } from "@/lib/auth/next-path";
import { getCurrentUser } from "@/lib/auth/session";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  return authPageMetadata(locale, "login");
}

export default async function LoginPage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const query = await searchParams;
  const next = safeNextPath(query.next);

  const user = await getCurrentUser();
  if (user) {
    if (!user.twoFactorVerified) return redirect({ href: withNext("/two-factor", next), locale });
    return redirect({ href: next, locale });
  }

  const t = await getTranslations("auth.login");
  const error = oauthErrorKey(typeof query.error === "string" ? query.error : null);

  return (
    <AuthShell
      locale={locale as AppLocale}
      title={t("title", { name: siteConfig.localizedName[locale as AppLocale] ?? siteConfig.name })}
      description={t("subtitle")}
    >
      <LoginPanel config={getLoginConfig(locale)} next={next} initialError={error} />
    </AuthShell>
  );
}
