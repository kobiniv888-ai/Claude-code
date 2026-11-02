import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { CalendarClockIcon } from "lucide-react";
import { Container } from "@/components/common/container";
import { EmptyState } from "@/components/ds/empty-state";
import { isAppLocale } from "@/i18n/locale";
import { redirect } from "@/i18n/navigation";
import { stayQuery, stayRequestFrom } from "@/lib/contact/message";
import { formatDateRange } from "@/lib/format";
import { resolveListing } from "@/lib/listing-page/resolve";
import { nightsBetween } from "@/lib/listing-page/stay";
import { listingSlugParam } from "@/lib/listing/urls";

type Props = {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!isAppLocale(locale)) return {};
  const t = await getTranslations({ locale, namespace: "listing.book" });
  return { title: t("title"), robots: { index: false, follow: false } };
}

/**
 * /listing/<id>/book?checkIn&checkOut&guests: where the listing's "Book" button goes.
 * PLACEHOLDER until the booking flow (round 2, phase 4) replaces this page: it says booking
 * opens soon and leads back to the listing with the dates kept (to ask the host about them).
 */
export default async function BookPlaceholderPage({ params, searchParams }: Props) {
  const { locale, id } = await params;
  if (!isAppLocale(locale)) notFound();
  setRequestLocale(locale);
  const resolved = await resolveListing(locale, id);
  if (!resolved) notFound();
  const { data } = resolved;
  const stay = stayRequestFrom(await searchParams);
  const back = `/listing/${listingSlugParam(data.publicId, data.title.shown)}${stayQuery(stay)}`;
  if (data.dealType !== "SHORT_STAY" && data.dealType !== "HOTEL_ROOM") redirect({ href: back, locale });

  const t = await getTranslations({ locale, namespace: "listing" });
  const dates =
    stay.checkIn && stay.checkOut
      ? t("calendar.range", {
          range: formatDateRange(stay.checkIn, stay.checkOut, locale),
          nights: t("calendar.nights", { count: nightsBetween(stay.checkIn, stay.checkOut) }),
        })
      : null;

  return (
    <Container className="grid max-w-xl gap-4 py-12">
      <h1 dir="auto" className="sr-only">
        {data.title.shown}
      </h1>
      <EmptyState
        icon={CalendarClockIcon}
        title={t("book.title")}
        description={[dates, t("book.text")].filter(Boolean).join(". ")}
        action={{ label: t("book.back"), href: back }}
      />
    </Container>
  );
}
