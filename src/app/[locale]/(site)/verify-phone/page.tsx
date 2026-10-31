import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { SmartphoneIcon } from "lucide-react";
import type { AppLocale } from "@/config/site";
import { AuthShell } from "@/components/auth/auth-shell";
import { authPageMetadata } from "@/components/auth/metadata";
import { VerifyPhonePanel } from "@/components/auth/verify-phone-panel";
import { redirect } from "@/i18n/navigation";
import { getLoginConfig } from "@/lib/auth/config";
import { safeNextPath, withNext } from "@/lib/auth/next-path";
import { getCurrentUser } from "@/lib/auth/session";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  return authPageMetadata(locale, "verifyPhone");
}

/** Add and verify a phone number — required to post a listing. */
export default async function VerifyPhonePage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const query = await searchParams;
  const hasNext = typeof query.next === "string" && safeNextPath(query.next, "") !== "";
  const next = safeNextPath(query.next);

  const user = await getCurrentUser();
  if (!user) return redirect({ href: withNext("/login", next), locale });
  if (!user.twoFactorVerified) return redirect({ href: withNext("/two-factor", hasNext ? next : null), locale });
  // Sent here by a page that needs a verified phone, and it already is: carry on.
  if (hasNext && user.phoneNumberVerified) return redirect({ href: next, locale });

  const t = await getTranslations("auth.verifyPhone");
  const verifiedPhone = user.phoneNumberVerified ? user.phoneNumber : null;

  return (
    <AuthShell
      locale={locale as AppLocale}
      title={verifiedPhone ? t("titleVerified") : t("title")}
      description={verifiedPhone ? undefined : t("subtitle")}
      icon={
        <span className="flex size-12 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
          <SmartphoneIcon className="size-6" aria-hidden />
        </span>
      }
    >
      <VerifyPhonePanel config={getLoginConfig().phone} next={next} verifiedPhone={verifiedPhone} />
    </AuthShell>
  );
}
