import { LifeBuoy, MessageCircleReply, Plus } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Container } from "@/components/common/container";
import { ArrowEnd, ArrowStart } from "@/components/common/directional-icon";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/states";
import { TicketList } from "@/components/tickets/ticket-list";
import { Link } from "@/i18n/navigation";
import { requireUser } from "@/lib/auth/session";
import { formatNumber } from "@/lib/format";
import { pageMetadata } from "@/lib/seo";
import { listTicketsForUser } from "@/lib/tickets";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const PAGE_SIZE = 20;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "tickets.listPage" });
  return pageMetadata({ locale, path: "/account/tickets", title: t("title"), description: t("lead"), noIndex: true });
}

const buttonLink =
  "inline-flex h-10 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&_svg]:size-4";

export default async function MyTicketsPage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const query = await searchParams;
  const user = await requireUser({ next: "/account/tickets" });
  const t = await getTranslations("tickets.listPage");

  const requested = Number(Array.isArray(query.page) ? query.page[0] : query.page);
  const page = Number.isInteger(requested) && requested > 0 ? requested : 1;
  const { items, total, page: current, pageCount } = await listTicketsForUser(user.id, { page, pageSize: PAGE_SIZE });
  const waiting = items.filter((i) => i.status === "WAITING_FOR_USER").length;

  return (
    <Container size="narrow" className="pb-16">
      <PageHeader
        title={t("title")}
        description={t("lead")}
        actions={
          total > 0 ? (
            <Link href="/help/new-ticket" className={`${buttonLink} bg-primary text-primary-foreground hover:bg-primary/90`}>
              <Plus aria-hidden="true" />
              {t("new")}
            </Link>
          ) : null
        }
      />

      {total === 0 ? (
        <EmptyState
          bordered
          icon={LifeBuoy}
          title={t("emptyTitle")}
          description={t("emptyBody")}
          action={{ label: t("emptyCta"), href: "/help/new-ticket", icon: Plus }}
          secondaryAction={{ label: t("emptyFaq"), href: "/help" }}
        />
      ) : (
        <>
          {waiting > 0 ? (
            <p
              role="status"
              className="mb-4 flex items-center gap-2 rounded-2xl border border-border-strong/40 bg-surface-muted px-4 py-3 text-sm font-medium"
            >
              <MessageCircleReply aria-hidden="true" className="size-5 shrink-0 text-foreground" />
              {t("waitingNotice", { count: waiting, countText: formatNumber(waiting, locale) })}
            </p>
          ) : null}

          <h2 className="sr-only">{t("listHeading")}</h2>
          <TicketList items={items} />

          {pageCount > 1 ? (
            <nav aria-label={t("pagination")} className="mt-8 flex items-center justify-between gap-3">
              {current > 1 ? (
                <Link
                  href={{ pathname: "/account/tickets", query: current - 1 > 1 ? { page: current - 1 } : {} }}
                  className={`${buttonLink} border bg-card hover:bg-muted`}
                >
                  <ArrowStart aria-hidden />
                  {t("previous")}
                </Link>
              ) : (
                <span />
              )}
              <span className="text-sm text-muted-foreground">
                {t("pageOf", { page: formatNumber(current, locale), total: formatNumber(pageCount, locale) })}
              </span>
              {current < pageCount ? (
                <Link
                  href={{ pathname: "/account/tickets", query: { page: current + 1 } }}
                  className={`${buttonLink} border bg-card hover:bg-muted`}
                >
                  {t("next")}
                  <ArrowEnd aria-hidden />
                </Link>
              ) : (
                <span />
              )}
            </nav>
          ) : null}
        </>
      )}
    </Container>
  );
}
