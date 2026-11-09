import { Archive, ExternalLink, House, Plus, Star } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Container } from "@/components/common/container";
import { Ltr } from "@/components/common/ltr";
import { PageHeader } from "@/components/common/page-header";
import { CloseTicketButton } from "@/components/tickets/close-ticket-button";
import { ShabbatPauseNotice } from "@/components/tickets/shabbat-pause-notice";
import { TicketCreatedToast } from "@/components/tickets/ticket-created-toast";
import { TicketMessageList } from "@/components/tickets/ticket-message-list";
import { TicketProgress } from "@/components/tickets/ticket-progress";
import { TicketRatingForm } from "@/components/tickets/ticket-rating-form";
import { TicketReplyForm } from "@/components/tickets/ticket-reply-form";
import {
  TicketCategoryLabel,
  TicketPriorityBadge,
  TicketStatusBadge,
} from "@/components/tickets/ticket-status-badge";
import { Link } from "@/i18n/navigation";
import { requireUser } from "@/lib/auth/session";
import { formatDate, formatRelativeTime } from "@/lib/format";
import { pageMetadata } from "@/lib/seo";
import { recordIdMiss } from "@/lib/security/id-guess";
import { isShabbatModeActive } from "@/lib/settings";
import { canUserClose, canUserRate, canUserReply, getTicketForUser, parseTicketNumber } from "@/lib/tickets";
import { ticketListingPath } from "@/lib/tickets/listing-link";
import { cn } from "@/lib/utils";

type Props = {
  params: Promise<{ locale: string; number: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, number } = await params;
  const t = await getTranslations({ locale, namespace: "tickets.detail" });
  const n = parseTicketNumber(number);
  return pageMetadata({
    locale,
    path: `/account/tickets/${n ?? ""}`,
    // The subject is private: the title only carries the number.
    title: n ? t("metaTitle", { number: String(n) }) : t("metaTitleFallback"),
    description: t("metaDescription"),
    noIndex: true,
  });
}

export default async function TicketPage({ params, searchParams }: Props) {
  const { locale, number: raw } = await params;
  setRequestLocale(locale);
  const number = parseTicketNumber(raw);
  if (number == null) notFound();
  const user = await requireUser({ next: `/account/tickets/${number}` });
  const query = await searchParams;

  const [ticket, shabbat, t] = await Promise.all([
    getTicketForUser(number, user.id, locale),
    isShabbatModeActive(),
    getTranslations("tickets.detail"),
  ]);
  if (!ticket) {
    // 4.7.a: a burst of numbers that match nothing alerts the founder (src/lib/security/id-guess.ts).
    await recordIdMiss("ticket", user.id);
    notFound();
  }

  const closed = ticket.status === "CLOSED";
  const rateable = canUserRate(ticket);

  return (
    <Container size="narrow" className="pb-16">
      {query.created === "1" ? <TicketCreatedToast number={ticket.number} /> : null}

      <PageHeader
        breadcrumbs={[
          { label: t("crumbTickets"), href: "/account/tickets" },
          { label: t("crumb", { number: String(ticket.number) }) },
        ]}
        eyebrow={t("eyebrow", { number: String(ticket.number) })}
        title={<span dir="auto">{ticket.subject}</span>}
        actions={canUserClose(ticket.status) ? <CloseTicketButton number={ticket.number} /> : null}
      />

      <div className="-mt-2 mb-6 flex flex-wrap items-center gap-x-4 gap-y-2">
        <TicketStatusBadge status={ticket.status} size="md" />
        <TicketPriorityBadge priority={ticket.priority} />
        <TicketCategoryLabel category={ticket.category} />
        <span className="text-sm text-muted-foreground">
          {t("opened", { date: formatDate(ticket.createdAt, locale, { dateStyle: "medium" }) })}
        </span>
        <span className="text-sm text-muted-foreground">
          {t("updated", { time: formatRelativeTime(ticket.lastMessageAt, locale) })}
        </span>
      </div>

      {ticket.listing ? (
        <div className="mb-6 flex flex-wrap items-center gap-3 rounded-2xl border bg-card p-4 shadow-card">
          <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-primary">
            <House className="size-5" />
          </span>
          <div className="min-w-0 flex-1 basis-48">
            <p className="text-xs text-muted-foreground">
              {t.rich("listing", { id: String(ticket.listing.publicId), ltr: (chunks) => <Ltr>{chunks}</Ltr> })}
            </p>
            <p dir="auto" className="truncate text-sm font-semibold">
              {ticket.listing.title || t("listingUntitled")}
            </p>
          </div>
          {ticket.listing.status === "LIVE" ? (
            <Link
              href={ticketListingPath(ticket.listing.publicId, ticket.listing.title)}
              className="inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-lg border px-3 text-sm font-medium hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring max-sm:w-full"
            >
              {t("viewListing")}
              <ExternalLink aria-hidden="true" className="size-4 rtl:-scale-x-100" />
            </Link>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-col gap-6">
        <TicketProgress status={ticket.status} />

        {rateable ? <TicketRatingForm number={ticket.number} /> : null}

        <section aria-labelledby="ticket-conversation">
          <h2 id="ticket-conversation" className="mb-4 text-lg font-semibold">
            {t("conversation")}
          </h2>
          <TicketMessageList messages={ticket.messages} perspective="user" />
        </section>

        {canUserReply(ticket.status) ? (
          shabbat.active ? (
            <ShabbatPauseNotice endsAt={shabbat.endsAt} />
          ) : (
            <TicketReplyForm number={ticket.number} status={ticket.status} />
          )
        ) : null}

        {closed ? (
          <div className="flex flex-col gap-4 rounded-2xl border border-dashed bg-card p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex gap-3">
              <Archive aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
              <div>
                <p className="font-semibold">{t("closedTitle")}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {ticket.closedAt
                    ? t("closedOn", { date: formatDate(ticket.closedAt, locale, { dateStyle: "long" }) })
                    : t("closedBody")}
                </p>
                {ticket.rating ? (
                  <p className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                    <span className="sr-only">{t("ratedLabel", { rating: String(ticket.rating) })}</span>
                    <span aria-hidden="true" className="flex">
                      {[1, 2, 3, 4, 5].map((value) => (
                        <Star
                          key={value}
                          className={cn(
                            "size-4",
                            value <= (ticket.rating ?? 0) ? "fill-muted-foreground text-foreground" : "text-muted-foreground/50",
                          )}
                        />
                      ))}
                    </span>
                    <span className="text-muted-foreground">{t("thanksForRating")}</span>
                  </p>
                ) : null}
              </div>
            </div>
            <Link
              href="/help/new-ticket"
              className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <Plus aria-hidden="true" className="size-4" />
              {t("newTicket")}
            </Link>
          </div>
        ) : null}
      </div>
    </Container>
  );
}
