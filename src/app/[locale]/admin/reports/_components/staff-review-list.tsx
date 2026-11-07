import { EyeOffIcon, MessageSquareReplyIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { WhenText } from "@/components/admin/listing-bits";
import { Ltr } from "@/components/common/ltr";
import { Stars } from "@/components/reviews/stars";
import type { AppLocale } from "@/config/site";
import { Link } from "@/i18n/navigation";
import type { StaffReviewRow } from "@/lib/reviews/queries";

/**
 * Reviews in a staff list (round 3 phase-5 hardening, reviews-2): the stars, the place, who wrote
 * it, the start of the text, "hidden" and "has a reply" — each opens /admin/reviews/<id>, where
 * staff can hide it (never edit it) whether or not anyone reported it.
 */
export async function StaffReviewList({ rows, locale, empty }: { rows: StaffReviewRow[]; locale: AppLocale; empty: string }) {
  const t = await getTranslations({ locale, namespace: "reviews" });
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <ul className="divide-y overflow-hidden rounded-xl border bg-card">
      {rows.map((row) => (
        <li key={row.id} className="relative flex flex-col gap-1 p-3 hover:bg-muted/40">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            <Stars value={row.rating} size="xs" label={t("stars.label", { count: row.rating })} />
            <Ltr className="text-xs text-muted-foreground">ID {row.listing.publicId}</Ltr>
            <Link href={`/admin/reviews/${row.id}`} className="min-w-0 truncate font-medium text-primary after:absolute after:inset-0 hover:underline">
              <span dir="auto">{row.listing.title}</span>
            </Link>
            {row.hidden ? (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-destructive">
                <EyeOffIcon aria-hidden className="size-3.5" />
                {t("admin.hiddenBadge")}
              </span>
            ) : null}
            {row.hostReply ? <MessageSquareReplyIcon aria-label={t("item.reply")} className="size-3.5 text-muted-foreground rtl:-scale-x-100" /> : null}
          </p>
          <p dir="auto" className="line-clamp-2 text-sm text-muted-foreground">
            {row.text}
          </p>
          <p className="text-xs text-muted-foreground">
            <span dir="auto">{row.guest.name}</span> · <WhenText date={row.createdAt} />
          </p>
        </li>
      ))}
    </ul>
  );
}
