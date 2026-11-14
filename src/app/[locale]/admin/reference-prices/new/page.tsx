import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AdminPageHeader } from "@/components/admin/page-header";
import { referenceFormOptions } from "@/lib/admin/server/reference-prices";
import { requireStaff } from "@/lib/auth/session";
import { ReferencePriceForm } from "../_components/reference-price-form";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin.referencePrices" });
  return { title: t("newTitle"), robots: { index: false, follow: false } };
}

/** /admin/reference-prices/new ("moderation"). */
export default async function NewReferencePricePage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireStaff("moderation");
  const [t, cities] = await Promise.all([getTranslations("admin.referencePrices"), referenceFormOptions(locale)]);
  return (
    <>
      <AdminPageHeader back={{ href: "/admin/reference-prices", label: t("backToList") }} title={t("newTitle")} description={t("newDescription")} />
      <ReferencePriceForm id={null} cities={cities} />
    </>
  );
}
