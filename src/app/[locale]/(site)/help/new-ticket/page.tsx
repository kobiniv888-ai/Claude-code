import { BellRing, Camera, Hash, ListChecks, MailWarning, ShieldAlert } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Container } from "@/components/common/container";
import { PageHeader } from "@/components/common/page-header";
import { NewTicketForm } from "@/components/tickets/new-ticket-form";
import { ShabbatPauseNotice } from "@/components/tickets/shabbat-pause-notice";
import { SupportReplyPromise } from "@/components/help/support-reply-promise";
import { Link } from "@/i18n/navigation";
import { requireUser } from "@/lib/auth/session";
import { pageMetadata } from "@/lib/seo";
import { isShabbatModeActive } from "@/lib/settings";
import { findListingForTicket, isTicketCategory, parseListingRef } from "@/lib/tickets";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "tickets.newPage" });
  return pageMetadata({ locale, path: "/help/new-ticket", title: t("metaTitle"), description: t("lead"), noIndex: true });
}

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value)?.trim().slice(0, 500) ?? "";
}

export default async function NewTicketPage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const query = await searchParams;
  const categoryParam = first(query.category);
  const category = isTicketCategory(categoryParam) ? categoryParam : null;
  const listingParam = first(query.listing);

  const back = new URLSearchParams();
  if (category) back.set("category", category);
  if (listingParam) back.set("listing", listingParam);
  const next = `/help/new-ticket${back.size ? `?${back.toString()}` : ""}`;
  const user = await requireUser({ next });

  const t = await getTranslations("tickets.newPage");
  const [shabbat, listing] = await Promise.all([
    isShabbatModeActive(),
    listingParam && parseListingRef(listingParam) != null
      ? findListingForTicket(listingParam, user.id, locale)
      : Promise.resolve(null),
  ]);

  const tips = [
    { key: "listingId", icon: Hash },
    { key: "screenshots", icon: Camera },
    { key: "steps", icon: ListChecks },
  ] as const;

  return (
    <Container size="default" className="max-w-6xl pb-16">
      <PageHeader
        breadcrumbs={[{ label: t("crumbHelp"), href: "/help" }, { label: t("crumb") }]}
        title={t("title")}
        description={t("lead")}
      />

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0">
          {shabbat.active ? (
            <ShabbatPauseNotice endsAt={shabbat.endsAt} />
          ) : (
            <div className="rounded-3xl border bg-card p-4 shadow-card sm:p-8">
              <NewTicketForm
                initialCategory={category}
                initialListingRef={listing ? String(listing.publicId) : listingParam}
                initialListing={listing ? { publicId: listing.publicId, title: listing.title } : null}
              />
            </div>
          )}
        </div>

        <aside className="flex flex-col gap-4" aria-label={t("asideLabel")}>
          <section className="rounded-2xl border bg-card p-5 shadow-card">
            <h2 className="text-base font-semibold">{t("replyTitle")}</h2>
            <SupportReplyPromise className="mt-2 text-sm leading-relaxed text-pretty text-muted-foreground" />
          </section>

          <section className="rounded-2xl border bg-card p-5 shadow-card">
            <h2 className="text-base font-semibold">{t("tipsTitle")}</h2>
            <ul className="mt-3 flex flex-col gap-3">
              {tips.map(({ key, icon: Icon }) => (
                <li key={key} className="flex gap-3 text-sm leading-relaxed">
                  <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
                  <span className="text-pretty text-muted-foreground">{t(`tips.${key}`)}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-2xl border border-primary/30 bg-accent p-5 text-accent-foreground">
            <h2 className="flex items-center gap-2 text-base font-semibold">
              <ShieldAlert aria-hidden="true" className="size-4 text-primary-text" />
              {t("scamTitle")}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-pretty">{t("scamBody")}</p>
            <Link
              href="/safety"
              className="mt-3 inline-block text-sm font-semibold underline underline-offset-4 hover:no-underline"
            >
              {t("scamLink")}
            </Link>
          </section>

          <section className="rounded-2xl border bg-card p-5 shadow-card">
            <h2 className="flex items-center gap-2 text-base font-semibold">
              {user.emailIsPlaceholder ? (
                <MailWarning aria-hidden="true" className="size-4 text-foreground" />
              ) : (
                <BellRing aria-hidden="true" className="size-4 text-primary" />
              )}
              {t("updatesTitle")}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-pretty text-muted-foreground">
              {user.emailIsPlaceholder ? t("updatesNoEmail") : t("updatesEmail")}
            </p>
            <Link
              href="/account/tickets"
              className="mt-3 inline-block text-sm font-semibold text-primary underline underline-offset-4 hover:no-underline"
            >
              {t("myTickets")}
            </Link>
          </section>
        </aside>
      </div>
    </Container>
  );
}
