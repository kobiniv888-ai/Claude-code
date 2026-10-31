import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ShieldCheckIcon } from "lucide-react";
import type { AppLocale } from "@/config/site";
import { siteConfig } from "@/config/site";
import { AuthShell } from "@/components/auth/auth-shell";
import { authPageMetadata } from "@/components/auth/metadata";
import { TwoFactorPageClient } from "@/components/auth/two-factor-page-client";
import { redirect } from "@/i18n/navigation";
import { safeNextPath, withNext } from "@/lib/auth/next-path";
import { getCurrentUser } from "@/lib/auth/session";

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
 */
export default async function TwoFactorPage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const next = safeNextPath((await searchParams).next);

  const user = await getCurrentUser();
  if (!user) return redirect({ href: withNext("/login", next), locale });
  if (user.twoFactorVerified) return redirect({ href: next, locale });

  const t = await getTranslations("auth.twoFactor");
  return (
    <AuthShell
      locale={locale as AppLocale}
      title={t("title")}
      description={t("subtitle", { name: siteConfig.name })}
      icon={
        <span className="flex size-12 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
          <ShieldCheckIcon className="size-6" aria-hidden />
        </span>
      }
      footer={t.rich("help", {
        email: siteConfig.supportEmail,
        link: (chunks) => (
          <a href={`mailto:${siteConfig.supportEmail}`} dir="ltr" className="font-medium text-foreground underline underline-offset-2">
            {chunks}
          </a>
        ),
      })}
    >
      <TwoFactorPageClient next={next} />
    </AuthShell>
  );
}
