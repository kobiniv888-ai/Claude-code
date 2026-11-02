import type { ReactNode } from "react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { CircleCheckBigIcon, KeyRoundIcon, LockKeyholeIcon } from "lucide-react";
import type { AppLocale } from "@/config/site";
import { AuthShell } from "@/components/auth/auth-shell";
import { authPageMetadata } from "@/components/auth/metadata";
import { TwoFactorSetup } from "@/components/auth/two-factor-setup";
import { Button } from "@/components/ui/button";
import { Link, redirect } from "@/i18n/navigation";
import { safeNextPath, withNext } from "@/lib/auth/next-path";
import { getCurrentUser } from "@/lib/auth/session";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  return authPageMetadata(locale, "twoFactorSetup");
}

/** Turn on 2-step login (required for staff before /admin; optional for everyone else). */
export default async function TwoFactorSetupPage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const query = await searchParams;

  const user = await getCurrentUser();
  const fallback = user?.isStaff ? "/admin" : "/account/settings";
  const next = safeNextPath(query.next, fallback);
  if (!user) return redirect({ href: withNext("/login", next), locale });
  if (!user.twoFactorVerified) return redirect({ href: withNext("/two-factor", next), locale });

  const t = await getTranslations("auth.setup");
  const iconCircle = (icon: ReactNode, tone: "primary" | "verified") => (
    <span
      className={
        tone === "verified"
          ? "flex size-12 items-center justify-center rounded-full bg-primary-tint text-success"
          : "flex size-12 items-center justify-center rounded-full bg-secondary text-secondary-foreground"
      }
    >
      {icon}
    </span>
  );

  if (user.twoFactorEnabled) {
    return (
      <AuthShell
        locale={locale as AppLocale}
        title={t("enabledTitle")}
        description={t("alreadyEnabled")}
        icon={iconCircle(<CircleCheckBigIcon className="size-6" aria-hidden />, "verified")}
      >
        <Button asChild size="lg" className="h-12 w-full rounded-xl text-base">
          <Link href={next}>{t("continue")}</Link>
        </Button>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      locale={locale as AppLocale}
      title={t("title")}
      description={t("subtitle")}
      icon={iconCircle(<KeyRoundIcon className="size-6" aria-hidden />, "primary")}
    >
      {user.isStaff && (
        <p className="mb-5 flex items-start gap-2.5 rounded-xl bg-surface-muted px-3.5 py-3 text-sm text-foreground">
          <LockKeyholeIcon className="mt-0.5 size-4 shrink-0 text-foreground" aria-hidden />
          {t("staffRequired")}
        </p>
      )}
      <TwoFactorSetup next={next} />
    </AuthShell>
  );
}
