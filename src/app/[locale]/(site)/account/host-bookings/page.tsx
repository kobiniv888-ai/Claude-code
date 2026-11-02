import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { CalendarCheck2Icon, CalendarXIcon, HistoryIcon, XIcon } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/states";
import { HostBookingRow } from "@/components/host-bookings/booking-row";
import type { AppLocale } from "@/config/site";
import { Link } from "@/i18n/navigation";
import { requireUser } from "@/lib/auth/session";
import { HOST_BOOKINGS_PATH } from "@/lib/booking/constants";
import { getHostBookings, type HostBookingSummary } from "@/lib/booking/queries";
import { formatNumber } from "@/lib/format";
import { pageMetadata } from "@/lib/seo";
import { cn } from "@/lib/utils";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const TABS = ["upcoming", "past", "cancelled"] as const;
type Tab = (typeof TABS)[number];

function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function tabOf(booking: HostBookingSummary): Tab {
  if (booking.status === "CANCELLED_BY_GUEST" || booking.status === "CANCELLED_BY_HOST") return "cancelled";
  return booking.upcoming ? "upcoming" : "past";
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "hostBooking.list" });
  return pageMetadata({ locale, path: HOST_BOOKINGS_PATH, title: t("title"), description: t("lead"), noIndex: true });
}

/**
 * /account/host-bookings — "הזמנות לנכסים שלי": every booking of the host's places, as upcoming,
 * past and cancelled, optionally for one listing (?listing=<id>, from its calendar page).
 */
export default async function HostBookingsPage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const query = await searchParams;
  const user = await requireUser({ next: HOST_BOOKINGS_PATH });
  const t = await getTranslations("hostBooking.list");
  const listingId = one(query.listing)?.slice(0, 64) || undefined;
  const all = await getHostBookings(user.id, locale as AppLocale, { listingId, scope: "all" });
  const requested = one(query.tab);
  const tab: Tab = (TABS as readonly string[]).includes(requested ?? "") ? (requested as Tab) : "upcoming";
  const counts = Object.fromEntries(TABS.map((key) => [key, all.filter((b) => tabOf(b) === key).length])) as Record<Tab, number>;
  const items = all.filter((b) => tabOf(b) === tab);
  const listingTitle = listingId ? all[0]?.listing.title : undefined;
  const hrefFor = (key: Tab) => ({
    pathname: HOST_BOOKINGS_PATH,
    query: { ...(key !== "upcoming" ? { tab: key } : {}), ...(listingId ? { listing: listingId } : {}) },
  });

  return (
    <div className="pb-10">
      <PageHeader title={t("title")} description={t("lead")} />

      {all.length === 0 && !listingId ? (
        <EmptyState
          bordered
          icon={CalendarCheck2Icon}
          title={t("emptyTitle")}
          description={t("emptyBody")}
          action={{ label: t("emptyAction"), href: "/account/listings" }}
        />
      ) : (
        <>
          {listingId && (
            <p className="mb-3 flex flex-wrap items-center gap-2 text-small text-muted-foreground">
              {t("forListing")}{" "}
              <span className="font-medium text-foreground" dir="auto">
                {listingTitle ?? t("thisListing")}
              </span>
              <Link
                href={{ pathname: HOST_BOOKINGS_PATH, query: tab !== "upcoming" ? { tab } : {} }}
                className="inline-flex min-h-11 items-center gap-1 rounded-full px-2 font-medium text-primary-text outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <XIcon className="size-4" aria-hidden />
                {t("allListings")}
              </Link>
            </p>
          )}
          <nav aria-label={t("tabsLabel")} className="relative -mx-1 mb-4 overflow-x-auto pb-1 [scrollbar-width:thin]">
            <ul className="flex min-w-max gap-2 px-1">
              {TABS.map((key) => {
                const active = key === tab;
                return (
                  <li key={key}>
                    <Link
                      href={hrefFor(key)}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "inline-flex h-chip min-h-11 items-center gap-1.5 rounded-full border px-4 text-small font-medium outline-none transition-colors duration-(--motion-fast) focus-visible:ring-3 focus-visible:ring-ring/50",
                        active ? "border-primary bg-primary text-primary-foreground" : "border-border-strong bg-card text-foreground hover:bg-surface-muted",
                      )}
                    >
                      {t(`tabs.${key}`)}
                      <span className={cn("tabular-nums", active ? "opacity-90" : "text-muted-foreground")}>{formatNumber(counts[key], locale)}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          {items.length > 0 ? (
            <ul className="grid gap-2">
              {items.map((booking) => (
                <HostBookingRow key={booking.id} booking={booking} locale={locale} />
              ))}
            </ul>
          ) : (
            <EmptyState
              bordered
              icon={tab === "cancelled" ? CalendarXIcon : tab === "past" ? HistoryIcon : CalendarCheck2Icon}
              title={t(`empty.${tab}`)}
              description={tab === "upcoming" ? t("emptyUpcomingBody") : undefined}
            />
          )}
        </>
      )}
    </div>
  );
}
