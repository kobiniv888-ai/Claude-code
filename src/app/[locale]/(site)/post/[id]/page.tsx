import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Container } from "@/components/common/container";
import { HideBottomNav } from "@/components/layout/hide-bottom-nav";
import { ShabbatPaused } from "@/components/wizard/shabbat-paused";
import { WizardShell } from "@/components/wizard/wizard-shell";
import type { AppLocale } from "@/config/site";
import { redirect } from "@/i18n/navigation";
import { requireUser } from "@/lib/auth/session";
import { isShabbatModeActive } from "@/lib/settings";
import { loadWizard } from "@/lib/wizard/server";
import { parseStepParam } from "@/lib/wizard/steps";

type Props = {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "wizard.meta" });
  return { title: t("postTitle"), robots: { index: false, follow: false } };
}

/** /post/<listingId>?step=N — the wizard for one of the user's drafts. */
export default async function PostWizardPage({ params, searchParams }: Props) {
  const { locale: raw, id } = await params;
  const locale = raw as AppLocale;
  setRequestLocale(locale);
  const query = await searchParams;
  const user = await requireUser({ phoneVerified: true, next: `/post/${encodeURIComponent(id)}` });

  const shabbat = await isShabbatModeActive();
  if (shabbat.active) {
    return (
      <Container size="narrow">
        <ShabbatPaused locale={locale} endsAt={shabbat.endsAt} />
      </Container>
    );
  }

  const data = await loadWizard(id, user, "create", locale);
  if (!data) notFound();
  // Published listings are edited from "My listings" (same wizard, "Save changes" at the end).
  if (data.listing.status !== "DRAFT") {
    return redirect({ href: `/account/listings/${data.listing.id}/edit`, locale });
  }

  const { values } = data.listing;
  const step = parseStepParam(query.step, { dealType: values.dealType, propertyType: values.propertyType }, data.listing.wizardStep);

  return (
    <>
      <HideBottomNav />
      <WizardShell listing={data.listing} context={data.context} initialStep={step} />
    </>
  );
}
