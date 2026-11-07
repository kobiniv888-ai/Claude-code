import type { Metadata } from "next";
import { BellRingIcon } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AlertEmailSwitches } from "@/components/alerts/alert-email-switches";
import { SavedSearchList, type SavedSearchItem } from "@/components/alerts/saved-search-list";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/states";
import { siteConfig, type AppLocale } from "@/config/site";
import { isAppLocale } from "@/i18n/locale";
import { parseAlertPrefs } from "@/lib/alerts/rules";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { notificationEmailFor } from "@/lib/email";
import { formatDate, formatNumber } from "@/lib/format";
import { activeFilterChips } from "@/lib/listing/search-params";
import { MAX_SAVED_SEARCHES } from "@/lib/saved-searches/core";
import { alertEmailSwitches, countWatchedPlaces, listSavedSearches, type SavedSearchRow } from "@/lib/saved-searches/server";
import { chipLabel } from "@/lib/search/chip-label";
import { getPlaceNames } from "@/lib/search/home";
import { pageMetadata } from "@/lib/seo";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "alerts.page" });
  return pageMetadata({ locale, path: "/account/alerts", title: t("metaTitle"), description: t("metaDescription"), noIndex: true });
}

/** "בטומי · לטווח קצר · 10–14 בדצמ׳ · 2 אורחים · מטבח כשר" in the page language. */
async function summaryOf(search: SavedSearchRow, locale: AppLocale, allPlaces: string): Promise<string> {
  const [chipsT, fieldsT, names] = await Promise.all([
    getTranslations({ locale, namespace: "search.chips" }),
    getTranslations({ locale, namespace: "listingFields" }),
    getPlaceNames(search.criteria.filters.city, search.criteria.filters.neighborhood, locale),
  ]);
  const { filters } = search.criteria;
  const ctx = { t: chipsT, f: fieldsT, locale, currency: search.currency, placeNames: names };
  const parts = activeFilterChips(filters)
    .map((chip) => chipLabel(chip, filters, ctx))
    .filter(Boolean);
  if (filters.deal) parts.splice(names.city ? 1 : 0, 0, fieldsT(`dealFilter.${filters.deal}`));
  return parts.length ? parts.join(" · ") : allPlaces;
}

/**
 * /account/alerts — "התראות וחיפושים שמורים" (round 3, brief 7.4): the two email switches (new
 * places for the saved searches, price drops of saved places) and the saved searches, each with
 * pause/resume, rename, delete and a link that opens the search.
 */
export default async function AlertsPage({ params }: Props) {
  const { locale: raw } = await params;
  const locale: AppLocale = isAppLocale(raw) ? raw : siteConfig.i18n.primaryLocale;
  setRequestLocale(locale);
  const user = await requireUser({ next: "/account/alerts" });
  const [t, searches, switches, watching, prefsRow] = await Promise.all([
    getTranslations("alerts.page"),
    listSavedSearches(user.id),
    alertEmailSwitches(user.id),
    countWatchedPlaces(user.id),
    db.user.findUnique({ where: { id: user.id }, select: { email: true, contactEmail: true, notificationPrefs: true } }),
  ]);

  const address = prefsRow ? notificationEmailFor(prefsRow) : null;
  const failing = prefsRow ? parseAlertPrefs(prefsRow.notificationPrefs).email.failing : null;
  const emailState = !address ? "none" : failing && failing.address === address.trim().toLowerCase() ? "failing" : "ok";

  const items: SavedSearchItem[] = await Promise.all(
    searches.map(async (search) => ({
      id: search.id,
      name: search.name,
      summary: await summaryOf(search, locale, t("searches.allPlaces")),
      path: search.path,
      active: search.active,
      datesPassed: search.datesPassed,
      sentLine: search.lastSentAt
        ? t("searches.lastSent", { date: formatDate(search.lastSentAt, locale, { day: "numeric", month: "short", year: "numeric" }) })
        : t("searches.neverSent"),
    })),
  );

  return (
    <div className="mx-auto grid max-w-3xl gap-6 pb-4">
      <PageHeader title={t("title")} description={t("lead")} />

      <section aria-labelledby="alerts-emails" className="rounded-2xl border bg-card p-4 sm:p-6">
        <h2 id="alerts-emails" className="text-base font-semibold">
          {t("emails.title")}
        </h2>
        <div className="mt-2">
          <AlertEmailSwitches initial={switches} watching={watching} emailState={emailState} />
        </div>
      </section>

      <section aria-labelledby="alerts-searches" className="grid gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h2 id="alerts-searches" className="text-lg font-semibold">
            {t("searches.title")}
          </h2>
          {items.length > 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("searches.count", { count: items.length, countText: formatNumber(items.length, locale) })}
              {items.length >= MAX_SAVED_SEARCHES ? ` · ${t("searches.limit", { max: formatNumber(MAX_SAVED_SEARCHES, locale) })}` : null}
            </p>
          ) : null}
        </div>
        {items.length > 0 && !switches.savedSearches ? (
          <p className="rounded-xl bg-surface-muted px-3 py-2 text-sm text-pretty" role="note">
            {t("searches.offNotice")}
          </p>
        ) : null}
        {items.length === 0 ? (
          <EmptyState
            bordered
            icon={BellRingIcon}
            title={t("searches.emptyTitle")}
            description={t("searches.emptyBody")}
            action={{ label: t("searches.emptyAction"), href: "/search" }}
          />
        ) : (
          <SavedSearchList items={items} />
        )}
      </section>
    </div>
  );
}
