import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { Tag } from "@/components/ds/tag";
import { SpriteIcon } from "@/components/ds/sprite-icons";
import { Ltr } from "@/components/common/ltr";
import type { BookingStatus } from "@/generated/prisma/enums";
import { Link } from "@/i18n/navigation";
import type { HostBookingSummary } from "@/lib/booking/queries";
import { formatDateRange, formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Green only for "confirmed" (brief 3.2); every other status is a quiet grey tag. */
export function BookingStatusTag({ status, label }: { status: BookingStatus; label: string }) {
  return <Tag variant={status === "CONFIRMED" ? "success" : "neutral"}>{label}</Tag>;
}

/**
 * One booking in "הזמנות לנכסים שלי" (and under a listing's calendar): the guest, the place, the
 * dates and the amount the guest pays at check-in. The whole row links to the booking.
 */
export async function HostBookingRow({
  booking,
  locale,
  showListing = true,
}: {
  booking: HostBookingSummary;
  locale: string;
  showListing?: boolean;
}) {
  const tb = await getTranslations("booking");
  const t = await getTranslations("hostBooking.list");
  const guests = booking.adults + booking.children;
  const cancelled = booking.status === "CANCELLED_BY_GUEST" || booking.status === "CANCELLED_BY_HOST";
  return (
    <li>
      <Link
        href={booking.path}
        className="flex items-center gap-3 rounded-card border border-border bg-card p-3 outline-none transition-colors duration-(--motion-fast) hover:border-border-strong focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        {showListing && (
          <span className="relative size-16 shrink-0 overflow-hidden rounded-xl bg-surface-muted">
            {booking.listing.photo && (
              <Image src={booking.listing.photo} alt="" fill sizes="64px" className="object-cover" />
            )}
          </span>
        )}
        <span className="grid min-w-0 flex-1 gap-0.5">
          <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <span className="truncate font-medium" dir="auto">
              {booking.guestName}
            </span>
            <BookingStatusTag status={booking.status} label={tb(`status.${booking.status}`)} />
          </span>
          {showListing && (
            <span className="truncate text-small text-muted-foreground" dir="auto">
              {booking.listing.title}
            </span>
          )}
          <span className={cn("text-small", cancelled ? "text-muted-foreground line-through" : "text-foreground")}>
            {formatDateRange(booking.checkIn, booking.checkOut, locale)} · {tb("nights", { count: booking.nights })} ·{" "}
            {tb("guests.total", { count: guests })}
          </span>
          <span className="flex flex-wrap items-center gap-x-2 text-caption text-muted-foreground">
            <Ltr>{booking.code}</Ltr>
            <span aria-hidden>·</span>
            <span>
              {t("total")} <Ltr className="font-medium text-foreground">{formatMoney(booking.total, booking.currency, locale)}</Ltr>
            </span>
          </span>
        </span>
        <SpriteIcon name="chevron-right" className="size-5 shrink-0 text-muted-foreground rtl:-scale-x-100" />
      </Link>
    </li>
  );
}
