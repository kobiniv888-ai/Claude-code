"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { BellOffIcon, HotelIcon } from "lucide-react";
import { Ltr } from "@/components/common/ltr";
import { buttonStyles } from "@/components/ds/button";
import { Link } from "@/i18n/navigation";
import { hostAlertStatusAction } from "@/lib/booking/alert-actions";
import type { HostAlertStatus } from "@/lib/booking/alerts";

/** The "Booking alerts" section of the account settings (src/components/account/booking-alerts.tsx). */
const ALERT_SETTINGS_HREF = "/account/settings#booking-alerts";

/**
 * What the host sees about instant booking (round 3) in the "הזמנות ומחיר" step and on the place
 * calendar:
 * - `hotel`: a hotel without an active room type priced per night (round 3, phase 4: hotels are
 *   booked by room type): guests ask the host until one is added, and the check-in/out times and
 *   rules filled in here still show;
 * - a host Bayit can't alert on a channel that confirms delivery (no email address, emails bounce,
 *   Telegram blocked, the site's email service not connected): why instant booking is off, and a
 *   link to the booking alert settings.
 * Nothing when instant booking works.
 *
 *   <HostInstantNotice hotel={isHotel && !hasRoomTypes} />  // fetches the host's status
 *   <HostInstantNotice hotel={false} status={status} />   // from a server component
 */
export function HostInstantNotice({ hotel, status: given }: { hotel: boolean; status?: HostAlertStatus }) {
  const [fetched, setFetched] = useState<HostAlertStatus | null>(null);
  useEffect(() => {
    if (hotel || given) return;
    let alive = true;
    hostAlertStatusAction()
      .then((result) => {
        if (alive && result.ok) setFetched(result.data);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [hotel, given]);
  if (hotel) return <HotelInstantLater />;
  const status = given ?? fetched;
  if (!status || status.ok) return null;
  return <InstantOff status={status} />;
}

/** A hotel takes instant bookings once it has an active room type with a nightly price. */
function HotelInstantLater() {
  const t = useTranslations("booking.hotelNotice");
  return (
    <div className="flex items-start gap-3 rounded-card border border-primary-tint-border bg-primary-tint p-4">
      <HotelIcon className="mt-0.5 size-5 shrink-0 text-primary-text" aria-hidden />
      <div className="grid min-w-0 gap-1">
        <p className="text-body font-semibold">{t("title")}</p>
        <p className="text-small text-pretty text-muted-foreground">{t("body")}</p>
      </div>
    </div>
  );
}

function InstantOff({ status }: { status: Extract<HostAlertStatus, { ok: false }> }) {
  const t = useTranslations("alerts");
  return (
    <div role="status" className="grid gap-3 rounded-card border border-border-strong bg-surface-muted p-4">
      <div className="flex items-start gap-3">
        <BellOffIcon className="mt-0.5 size-5 shrink-0 text-foreground" aria-hidden />
        <div className="grid min-w-0 gap-1">
          <p className="text-body font-semibold">{t("notice.offTitle")}</p>
          <p className="text-small text-pretty text-muted-foreground">
            {t.rich(`reason.${status.reason}`, {
              telegram: status.telegram ? "yes" : "no",
              address: () => <Ltr className="font-medium wrap-anywhere text-foreground">{status.address ?? ""}</Ltr>,
            })}
          </p>
        </div>
      </div>
      <Link href={ALERT_SETTINGS_HREF} className={buttonStyles({ variant: "secondary", className: "justify-self-start" })}>
        {t("notice.fix")}
      </Link>
    </div>
  );
}
