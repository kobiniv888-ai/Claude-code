import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { AppLocale } from "@/config/site";
import { siteConfig } from "@/config/site";
import { authPageMetadata } from "@/components/auth/metadata";
import { redirect } from "@/i18n/navigation";
import { getLoginConfig } from "@/lib/auth/config";
import { oauthErrorKey } from "@/lib/auth/error-codes";
import { safeNextPath, withNext } from "@/lib/auth/next-path";
import { getCurrentUser } from "@/lib/auth/session";
import { LoginCard } from "./login-card";

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

  const config = getLoginConfig(locale);
  const hasSocial = config.providers.google || config.providers.apple;

  return (
    <div className="relative isolate flex w-full justify-center px-gutter py-6 sm:py-12">
      {/* Soft brand glow behind the card. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-80 bg-[radial-gradient(60%_100%_at_50%_0%,color-mix(in_oklab,var(--navy)_12%,transparent),transparent)]"
      />
      <div className="w-full max-w-[27rem]">
        <LoginCard
          config={config}
          next={next}
          initialError={error}
          title={t("title", { name: siteConfig.localizedName[locale as AppLocale] ?? siteConfig.name })}
          description={t(hasSocial ? "dialogSubtitle" : "dialogSubtitlePhoneOnly")}
        />
      </div>
    </div>
  );
}
