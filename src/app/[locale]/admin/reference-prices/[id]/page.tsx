import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Pill } from "@/components/admin/content/pill";
import { AdminPageHeader } from "@/components/admin/page-header";
import type { CurrencyCode } from "@/config/site";
import { dateToMonth } from "@/lib/admin/reference-prices";
import { getReferencePrice, referenceFormOptions } from "@/lib/admin/server/reference-prices";
import { requireStaff } from "@/lib/auth/session";
import { formatDate } from "@/lib/format";
import { ReferenceActiveButton } from "../_components/reference-active-button";
import { ReferencePriceForm } from "../_components/reference-price-form";

type Props = { params: Promise<{ locale: string; id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin.referencePrices" });
  return { title: t("editTitle"), robots: { index: false, follow: false } };
}

/** /admin/reference-prices/[id] ("moderation"): edit one range, or deactivate it. */
export default async function EditReferencePricePage({ params }: Props) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  await requireStaff("moderation");
  const [t, row, cities] = await Promise.all([getTranslations("admin.referencePrices"), getReferencePrice(id, locale), referenceFormOptions(locale)]);
  if (!row) notFound();
  const where = [row.neighborhoodName, row.cityName].filter(Boolean).join(", ");
  return (
    <>
      <AdminPageHeader
        back={{ href: "/admin/reference-prices", label: t("backToList") }}
        title={t("editTitle")}
        meta={
          <>
            {!row.active ? <Pill tone="muted">{t("inactive")}</Pill> : null}
            <span className="text-xs">
              {t("addedBy", { name: row.createdByName ?? "—", date: formatDate(row.createdAt, locale) })}
              {" · "}
              {t("updatedAt", { date: formatDate(row.updatedAt, locale) })}
            </span>
          </>
        }
        actions={<ReferenceActiveButton id={row.id} active={row.active} label={where} />}
      />
      <ReferencePriceForm
        id={row.id}
        cities={cities}
        initial={{
          cityId: row.cityId,
          neighborhoodId: row.neighborhoodId ?? "",
          dealType: row.dealType,
          propertyType: row.propertyType ?? "",
          bedrooms: row.bedrooms === null ? "" : String(row.bedrooms),
          perSqm: row.perSqm,
          low: String(row.low),
          high: String(row.high),
          currency: row.currency as CurrencyCode,
          sourceName: row.sourceName,
          sourceUrl: row.sourceUrl ?? "",
          sourceMonth: dateToMonth(row.sourceMonth),
          note: row.note ?? "",
        }}
      />
    </>
  );
}
