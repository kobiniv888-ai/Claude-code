import { ChevronRight, MessageCircleReply } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { TicketCategory, TicketPriority, TicketStatus } from "@/generated/prisma/enums";
import { Link } from "@/i18n/navigation";
import { formatDate, formatRelativeTime } from "@/lib/format";
import { ticketPath } from "@/lib/tickets/constants";
import { cn } from "@/lib/utils";
import { TicketCategoryLabel, TicketPriorityBadge, TicketStatusBadge } from "./ticket-status-badge";

export type TicketListEntry = {
  id: string;
  number: number;
  subject: string;
  category: TicketCategory;
  status: TicketStatus;
  priority: TicketPriority;
  lastMessageAt: Date | string;
  lastFromStaff: boolean;
  lastMessagePreview: string;
};

/**
 * The user's tickets as cards (server-rendered: relative times use the server clock).
 * Tickets waiting for the user stand out with an amber edge and a "Reply needed" note.
 */
export function TicketList({ items }: { items: TicketListEntry[] }) {
  const t = useTranslations("tickets.list");
  const locale = useLocale();

  return (
    <ul className="flex flex-col gap-3">
      {items.map((ticket) => {
        const waiting = ticket.status === "WAITING_FOR_USER";
        const closed = ticket.status === "CLOSED";
        const updated = new Date(ticket.lastMessageAt);
        return (
          <li key={ticket.id}>
            <Link
              href={ticketPath(ticket.number)}
              className={cn(
                "group relative flex items-start gap-3 rounded-2xl border bg-card p-4 shadow-card transition-shadow hover:shadow-card-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:p-5",
                waiting && "border-warning/50 bg-warning-soft/60",
                closed && "bg-card/60",
              )}
            >
              {waiting ? (
                <span aria-hidden="true" className="absolute inset-y-3 start-0 w-1 rounded-e-full bg-warning" />
              ) : null}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <TicketStatusBadge status={ticket.status} />
                  <TicketPriorityBadge priority={ticket.priority} />
                  <span className="text-xs text-muted-foreground">{t("number", { number: String(ticket.number) })}</span>
                </div>
                <h3
                  dir="auto"
                  className={cn(
                    "mt-2 line-clamp-2 text-base leading-snug break-words",
                    waiting ? "font-bold" : "font-semibold",
                    closed && "text-muted-foreground",
                  )}
                >
                  {ticket.subject}
                </h3>
                {ticket.lastMessagePreview ? (
                  <p className="mt-1 line-clamp-1 text-sm break-words text-muted-foreground">
                    <span className="font-medium text-foreground/80">
                      {ticket.lastFromStaff ? t("lastFromTeam") : t("lastFromYou")}
                    </span>{" "}
                    <span dir="auto">{ticket.lastMessagePreview}</span>
                  </p>
                ) : null}
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
                  <TicketCategoryLabel category={ticket.category} />
                  <time
                    dateTime={updated.toISOString()}
                    title={formatDate(updated, locale, { dateStyle: "long", timeStyle: "short" })}
                    className="text-sm text-muted-foreground"
                  >
                    {t("updated", { time: formatRelativeTime(updated, locale) })}
                  </time>
                  {waiting ? (
                    <span className="inline-flex items-center gap-1 text-sm font-semibold text-foreground">
                      <MessageCircleReply aria-hidden="true" className="size-4 text-warning" />
                      {t("replyNeeded")}
                    </span>
                  ) : null}
                </div>
              </div>
              <ChevronRight
                aria-hidden="true"
                className="mt-1 size-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 rtl:-scale-x-100 rtl:group-hover:-translate-x-0.5"
              />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
