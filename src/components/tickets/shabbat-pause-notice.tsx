import { MoonStar } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { siteConfig } from "@/config/site";
import { Link } from "@/i18n/navigation";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Shown instead of (or above) a support form while Shabbat mode pauses support.
 * `endsAt` is when it opens again; it is shown in Israel time, the clock Shabbat mode follows.
 */
export function ShabbatPauseNotice({
  endsAt,
  className,
  compact = false,
}: {
  endsAt?: Date | string | null;
  className?: string;
  /** Inside a form after a failed submit: no links. */
  compact?: boolean;
}) {
  const t = useTranslations("tickets.shabbat");
  const locale = useLocale();
  const ends = endsAt ? new Date(endsAt) : null;
  const when =
    ends && !Number.isNaN(ends.getTime())
      ? formatDate(ends, locale, {
          weekday: "long",
          hour: "numeric",
          minute: "2-digit",
          timeZone: siteConfig.shabbat.israel.timezone,
        })
      : null;

  return (
    <div
      role="status"
      className={cn(
        "flex gap-4 rounded-2xl border border-primary/15 bg-secondary p-5 text-secondary-foreground shadow-card sm:p-6",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="flex size-11 shrink-0 items-center justify-center rounded-full bg-card text-primary shadow-card"
      >
        <MoonStar className="size-5" />
      </span>
      <div className="min-w-0">
        <p className="text-base font-semibold">{t("title")}</p>
        <p className="mt-1 text-sm leading-relaxed text-pretty">{t("body")}</p>
        {when ? <p className="mt-2 text-sm font-medium">{t("endsAt", { time: when })}</p> : null}
        {!compact ? (
          <p className="mt-3 text-sm leading-relaxed text-pretty">
            {t.rich("urgent", {
              safety: (chunks) => (
                <Link href="/safety" className="font-medium underline underline-offset-4 hover:text-primary">
                  {chunks}
                </Link>
              ),
            })}
          </p>
        ) : null}
      </div>
    </div>
  );
}
