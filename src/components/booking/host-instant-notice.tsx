"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { BellOffIcon, HotelIcon } from "lucide-react";
import { Ltr } from "@/components/common/ltr";
import { buttonStyles } from "@/components/ds/button";
import { Link } from "@/i18n/navigation";
import { hostAlertStatusAction } from "@/lib/booking/alert-actions";
import type { HostAlertStatus } from "@/lib/booking/alerts";

/**
 * What the host sees about instant booking (round 3) in the "הזמנות ומחיר" step and on the place
 * calendar:
 * - hotels: instant booking for hotels is coming (booking by room type, phase 4); guests ask the
 *   host until then, and the check-in/out times and rules filled in here still show;
 * - a host Bayit can't alert (no email address, emails bounce, the site's email service is not
 *   connected): why instant booking is off, and where to fix it.
 * Nothing when instant booking works.
 *
 *   <HostInstantNotice hotel={isHotel} />                 // fetches the host's status
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
  return <InstantOff reason={status.reason} address={status.address} />;
}

function HotelInstantLater() {
  const t = useTranslations("booking.hostAlerts");
  return (
    <div className="flex items-start gap-3 rounded-card border border-primary-tint-border bg-primary-tint p-4">
      <HotelIcon className="mt-0.5 size-5 shrink-0 text-primary-text" aria-hidden />
      <div className="grid min-w-0 gap-1">
        <p className="text-body font-semibold">{t("hotelLaterTitle")}</p>
        <p className="text-small text-pretty text-muted-foreground">{t("hotelLaterBody")}</p>
      </div>
    </div>
  );
}

function InstantOff({ reason, address }: { reason: Exclude<HostAlertStatus, { ok: true }>["reason"]; address: string | null }) {
  const t = useTranslations("booking.hostAlerts");
  const fixable = reason === "no_email" || reason === "email_failing";
  return (
    <div role="status" className="grid gap-3 rounded-card border border-border-strong bg-surface-muted p-4">
      <div className="flex items-start gap-3">
        <BellOffIcon className="mt-0.5 size-5 shrink-0 text-foreground" aria-hidden />
        <div className="grid min-w-0 gap-1">
          <p className="text-body font-semibold">{t("offTitle")}</p>
          <p className="text-small text-pretty text-muted-foreground">
            {t.rich(`reason.${reason}`, { address: () => <Ltr className="font-medium text-foreground">{address ?? ""}</Ltr> })}
          </p>
        </div>
      </div>
      {fixable ? (
        <Link href="/account/settings" className={buttonStyles({ variant: "secondary", className: "justify-self-start" })}>
          {t("fixEmail")}
        </Link>
      ) : null}
    </div>
  );
}
