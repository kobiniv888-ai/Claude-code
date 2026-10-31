import { ImageOff } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Ltr } from "@/components/common/ltr";
import type { CurrencyCode } from "@/config/site";
import type { PricePeriod } from "@/generated/prisma/enums";
import { formatDate, formatMoney, formatRelativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Small pieces for listing rows in the admin panel (Server and Client Components). */

export function ListingThumb({ src, alt, className }: { src: string | null; alt: string; className?: string }) {
  if (!src) {
    return (
      <span className={cn("flex size-12 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground", className)}>
        <ImageOff aria-hidden className="size-4" />
      </span>
    );
  }
  return (
    // Admin-only thumbnails of any origin; the public site uses next/image.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} loading="lazy" decoding="async" className={cn("size-12 shrink-0 rounded-lg bg-muted object-cover", className)} />
  );
}

/** The owner's price in the owner's currency ("₾120 per night"). */
export function AdminPrice({
  amount,
  currency,
  period,
  className,
}: {
  amount: { toString(): string } | number | null;
  currency: string;
  period: PricePeriod;
  className?: string;
}) {
  const t = useTranslations("listingFields");
  const tAdmin = useTranslations("admin.common");
  const locale = useLocale();
  const value = amount == null ? null : Number(amount.toString());
  if (value == null || !Number.isFinite(value)) return <span className={className}>{tAdmin("priceOnRequest")}</span>;
  return (
    <span className={cn("whitespace-nowrap", className)}>
      <Ltr>{formatMoney(value, currency as CurrencyCode, locale)}</Ltr>
      {period !== "TOTAL" ? <span className="ms-1 text-muted-foreground">{t(`pricePeriod.${period}`)}</span> : null}
    </span>
  );
}

/** "#1234" as an LTR island. */
export function PublicId({ id, className }: { id: number; className?: string }) {
  return <Ltr className={cn("font-mono text-xs text-muted-foreground", className)}>#{id}</Ltr>;
}

/** A date with the relative time ("Oct 30, 2026 · 2 days ago"). */
export function WhenText({ date, relative = true, className }: { date: Date | string; relative?: boolean; className?: string }) {
  const locale = useLocale();
  const d = new Date(date);
  return (
    <time dateTime={d.toISOString()} title={formatDate(d, locale)} className={className}>
      {relative ? formatRelativeTime(d, locale) : formatDate(d, locale)}
    </time>
  );
}
