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
  return { title: t("editTitle"), robots: { index: false, follow: false } };
}

/** /account/listings/<id>/edit — the same wizard for a published listing, starting at step 1. */
export default async function EditListingPage({ params, searchParams }: Props) {
  const { locale: raw, id } = await params;
  const locale = raw as AppLocale;
  setRequestLocale(locale);
  const query = await searchParams;
  const user = await requireUser({ phoneVerified: true, next: `/account/listings/${encodeURIComponent(id)}/edit` });

  const shabbat = await isShabbatModeActive();
  if (shabbat.active) {
    return (
      <Container size="narrow">
        <ShabbatPaused locale={locale} endsAt={shabbat.endsAt} />
      </Container>
    );
  }

  const data = await loadWizard(id, user, "edit", locale);
  if (!data) notFound();
  // A draft that was never published continues in the post wizard (with "Publish"), on the step
  // asked for (bug 2.2) or the one the owner was on.
  if (data.listing.status === "DRAFT") {
    const asked = typeof query.step === "string" && /^(\d{1,2}|[a-z]{3,12})$/.test(query.step) ? query.step : String(data.listing.wizardStep);
    return redirect({ href: `/post/${data.listing.id}?step=${asked}`, locale });
  }

  const { values } = data.listing;
  const step = parseStepParam(query.step, { dealType: values.dealType, propertyType: values.propertyType }, 1);

  return (
    <>
      <HideBottomNav />
      <WizardShell listing={data.listing} context={data.context} initialStep={step} />
    </>
  );
}
