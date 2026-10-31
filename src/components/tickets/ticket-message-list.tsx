import { FileText, LifeBuoy, Lock, UserRound } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { siteConfig, type AppLocale } from "@/config/site";
import { formatDate, formatNumber } from "@/lib/format";
import { attachmentUrl, isInlineImage, type TicketAttachment } from "@/lib/tickets/attachments";
import { cn } from "@/lib/utils";

/**
 * A ticket's conversation, oldest first. Shared by the user's ticket page and the admin panel.
 *
 * - perspective "user": the user's own messages sit on the end side; staff replies show the
 *   agent's first name and "<site> support". Never pass internal notes here.
 * - perspective "staff": staff messages sit on the end side; internal notes are shown in amber
 *   with an "Internal note" label.
 */

export type TicketMessageItem = {
  id: string;
  body: string;
  fromStaff: boolean;
  internal: boolean;
  createdAt: Date | string;
  authorName: string | null;
  attachments: TicketAttachment[];
};

function Attachments({ items, label }: { items: TicketAttachment[]; label: string }) {
  const locale = useLocale();
  const t = useTranslations("tickets.messages");
  const formatBytes = (bytes: number) =>
    bytes >= 1024 * 1024
      ? t("sizeMb", { size: formatNumber(bytes / (1024 * 1024), locale, { maximumFractionDigits: 1 }) })
      : t("sizeKb", { size: formatNumber(Math.max(1, Math.round(bytes / 1024)), locale) });
  if (!items.length) return null;
  const images = items.filter((a) => isInlineImage(a.mime));
  const files = items.filter((a) => !isInlineImage(a.mime));
  return (
    <div className="mt-3 flex flex-col gap-2">
      {images.length ? (
        <ul aria-label={label} className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {images.map((a) => (
            <li key={a.key}>
              <a
                href={attachmentUrl(a.key)}
                target="_blank"
                rel="noopener noreferrer"
                className="group block overflow-hidden rounded-lg border bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                {/* Private, signed-in-only file (no-store) — not for the image optimizer. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={attachmentUrl(a.key)}
                  alt={a.name || label}
                  loading="lazy"
                  decoding="async"
                  className="aspect-square w-full object-cover transition-transform group-hover:scale-105"
                />
              </a>
            </li>
          ))}
        </ul>
      ) : null}
      {files.map((a) => (
        <a
          key={a.key}
          href={attachmentUrl(a.key)}
          className="inline-flex max-w-full items-center gap-2 rounded-lg border bg-background px-3 py-2 text-sm hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <FileText aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
          <span dir="auto" className="truncate">
            {a.name || label}
          </span>
          <span className="shrink-0 text-xs text-muted-foreground">
            {formatBytes(a.bytes)}
          </span>
        </a>
      ))}
    </div>
  );
}

export function TicketMessageList({
  messages,
  perspective = "user",
  requesterName,
  className,
}: {
  messages: TicketMessageItem[];
  perspective?: "user" | "staff";
  /** Staff view: the name shown on the user's messages (user or guest name). */
  requesterName?: string | null;
  className?: string;
}) {
  const t = useTranslations("tickets.messages");
  const locale = useLocale();
  const siteName = siteConfig.localizedName[locale as AppLocale] ?? siteConfig.name;
  const visible = perspective === "user" ? messages.filter((m) => !m.internal) : messages;

  if (!visible.length) {
    return <p className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">{t("empty")}</p>;
  }

  return (
    <ol aria-label={t("listLabel")} className={cn("flex flex-col gap-4", className)}>
      {visible.map((m) => {
        const mine = perspective === "user" ? !m.fromStaff : m.fromStaff;
        const author = m.fromStaff
          ? perspective === "user"
            ? m.authorName
              ? t("staffName", { name: m.authorName, siteName })
              : t("supportTeam", { siteName })
            : (m.authorName ?? t("staff"))
          : perspective === "user"
            ? t("you")
            : (requesterName ?? m.authorName ?? t("requester"));
        const AuthorIcon = m.fromStaff ? LifeBuoy : UserRound;
        const date = new Date(m.createdAt);

        return (
          <li
            key={m.id}
            id={`message-${m.id}`}
            className={cn("flex gap-2.5 sm:gap-3", mine && "flex-row-reverse", m.internal && "flex-row")}
          >
            <span
              aria-hidden="true"
              className={cn(
                "mt-1 flex size-8 shrink-0 items-center justify-center rounded-full sm:size-9",
                m.internal
                  ? "bg-warning-soft text-warning"
                  : m.fromStaff
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-secondary-foreground",
              )}
            >
              {m.internal ? <Lock className="size-4" /> : <AuthorIcon className="size-4" />}
            </span>
            <article
              className={cn(
                "min-w-0 rounded-2xl border px-4 py-3 shadow-card",
                m.internal
                  ? "flex-1 border-dashed border-warning/50 bg-warning-soft"
                  : mine
                    ? "max-w-[85%] rounded-se-md border-primary/15 bg-secondary sm:max-w-[75%]"
                    : "max-w-[85%] rounded-ss-md bg-card sm:max-w-[75%]",
              )}
            >
              <header className="mb-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span dir="auto" className="text-sm font-semibold">
                  {author}
                </span>
                {m.internal ? (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-foreground">
                    <Lock aria-hidden="true" className="size-3 text-warning" />
                    {t("internalNote")}
                  </span>
                ) : null}
                <time dateTime={date.toISOString()} className="text-xs text-muted-foreground">
                  {formatDate(date, locale, { dateStyle: "medium", timeStyle: "short" })}
                </time>
              </header>
              <p dir="auto" className="text-[0.95rem] leading-relaxed break-words whitespace-pre-wrap">
                {m.body}
              </p>
              <Attachments items={m.attachments} label={t("attachment")} />
            </article>
          </li>
        );
      })}
    </ol>
  );
}
