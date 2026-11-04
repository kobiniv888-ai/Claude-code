import {
  BellOff,
  CalendarX2,
  CheckCircle2,
  ChevronRight,
  Flag,
  Inbox,
  Mail,
  MailWarning,
  ShieldAlert,
  UserRoundX,
  UserX,
  type LucideIcon,
} from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { ATTENTION_EVENT_DAYS, attentionRows, attentionTotal, type AttentionCounts, type AttentionKey } from "@/lib/admin/attention";
import { HOST_REPORT_FLAG_MIN } from "@/lib/admin/flags";
import { isEmailDeliveryConfigured } from "@/lib/email";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

const ICONS: Record<AttentionKey, LucideIcon> = {
  turnedAwayReports: ShieldAlert,
  inReview: Inbox,
  otherReports: Flag,
  flagCancellations: CalendarX2,
  flagHosts: UserRoundX,
  flagNoShows: UserX,
  hostUnreachable: BellOff,
  failedEmails: MailWarning,
  outboxWaiting: Mail,
};

/**
 * Admin home "דורש טיפול" (round 3, brief 9): what waits for staff, one row per queue with its
 * count and a link, urgent first (turned-away reports). Only rows the role may open, only
 * non-zero ones; "all clear" otherwise.
 */
export async function AttentionBlock({ counts, role, locale }: { counts: AttentionCounts | null; role: string; locale: string }) {
  const t = await getTranslations("admin.overview.attention");
  const rows = attentionRows(counts, role);
  const total = attentionTotal(rows);
  const resend = isEmailDeliveryConfigured();

  return (
    <section aria-labelledby="attention-title" className="mb-6 rounded-xl border bg-card shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
        <div className="min-w-0">
          <h2 id="attention-title" className="text-base font-semibold">
            {t("title")}
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{counts ? t("description") : t("unavailable")}</p>
        </div>
        {total > 0 ? (
          <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-primary px-2 text-xs font-semibold text-primary-foreground tabular-nums">
            {formatNumber(total, locale)}
          </span>
        ) : null}
      </div>
      {rows.length === 0 ? (
        <div className="flex items-center gap-3 px-4 py-5">
          <CheckCircle2 aria-hidden className="size-6 shrink-0 text-success" />
          <div className="min-w-0">
            <p className="text-sm font-medium">{t("clearTitle")}</p>
            <p className="text-xs text-muted-foreground">{t("clearDescription")}</p>
          </div>
        </div>
      ) : (
        <ul className="divide-y">
          {rows.map((row) => {
            const Icon = ICONS[row.key];
            const hintKey = row.key === "outboxWaiting" ? (resend ? "hints.outboxWaitingResend" : "hints.outboxWaitingNoResend") : `hints.${row.key}`;
            return (
              <li key={row.key}>
                <Link
                  href={row.href}
                  className="flex items-center gap-3 px-4 py-3 outline-none transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset"
                >
                  <span
                    aria-hidden
                    className={cn(
                      "flex size-9 shrink-0 items-center justify-center rounded-full",
                      row.tone === "urgent" ? "bg-destructive/10 text-destructive" : row.tone === "attention" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
                    )}
                  >
                    <Icon className="size-4.5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="text-sm font-medium">{t(`rows.${row.key}`, { count: row.count })}</span>
                      {row.tone === "urgent" ? (
                        <span className="rounded-full bg-destructive px-2 py-0.5 text-[11px] font-semibold text-destructive-foreground">{t("urgent")}</span>
                      ) : null}
                    </span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">{t(hintKey, { days: ATTENTION_EVENT_DAYS, min: HOST_REPORT_FLAG_MIN })}</span>
                  </span>
                  <ChevronRight aria-hidden className="size-4 shrink-0 text-muted-foreground rtl:-scale-x-100" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
