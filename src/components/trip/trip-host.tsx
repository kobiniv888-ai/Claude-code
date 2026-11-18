import { getTranslations } from "next-intl/server";
import { Ltr } from "@/components/common/ltr";
import { ChannelIcon } from "@/components/contact/channel-icon";
import { buttonStyles } from "@/components/ds/button";
import { Card } from "@/components/ds/card";
import { SpriteIcon } from "@/components/ds/sprite-icons";
import type { AppLocale } from "@/config/site";
import { isolate } from "@/lib/format";
import { clockLabel } from "@/lib/listing/check-times";
import type { TripContactButton } from "@/lib/trip/contact";
import { cn } from "@/lib/utils";

/**
 * "יצירת קשר עם המארח" (round 3, brief 7.1): every way the host chose (src/lib/trip/contact.ts),
 * WhatsApp first in green when it is the host's first choice, the rest as outline buttons with the
 * number / username in an LTR island, and the host's contact hours.
 */
export async function TripHost({
  locale,
  hostName,
  buttons,
  contactHours,
}: {
  locale: AppLocale;
  hostName: string | null;
  buttons: TripContactButton[];
  contactHours: { from: string; to: string } | null;
}) {
  const [t, tb] = await Promise.all([getTranslations({ locale, namespace: "trips.host" }), getTranslations({ locale, namespace: "booking.trip" })]);
  return (
    <Card as="section" aria-labelledby="trip-host" className="grid gap-3">
      <div className="grid gap-0.5">
        <h2 id="trip-host" className="text-h2">
          {t("title")}
        </h2>
        {hostName ? (
          <p dir="auto" className="text-body font-medium">
            {hostName}
          </p>
        ) : null}
      </div>
      {buttons.length ? (
        <ul className="grid gap-2 sm:grid-cols-2">
          {buttons.map((button, index) => {
            const whatsappFirst = button.channel === "WHATSAPP" && index === 0;
            return (
              <li key={button.channel} className="min-w-0">
                <a
                  href={button.href}
                  {...(button.newTab ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                  className={cn(buttonStyles({ variant: whatsappFirst ? "whatsapp" : "outline", size: "md", block: true }), "h-auto min-h-12 justify-start py-2")}
                >
                  <ChannelIcon channel={button.channel} mono={whatsappFirst} />
                  <span className="grid min-w-0 text-start">
                    <span className="truncate">{t(`channel.${button.channel}`)}</span>
                    {button.display ? (
                      <Ltr className={cn("truncate text-caption font-normal", whatsappFirst ? "opacity-90" : "text-muted-foreground")}>{button.display}</Ltr>
                    ) : null}
                  </span>
                </a>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-small text-muted-foreground">{tb("noContact")}</p>
      )}
      {contactHours ? (
        <p className="flex items-center gap-2 text-small text-muted-foreground">
          <SpriteIcon name="clock" className="size-4.5 shrink-0" />
          <span>
            {t("contactHours", { from: isolate(clockLabel(contactHours.from, locale)), to: isolate(clockLabel(contactHours.to, locale)) })}
          </span>
        </p>
      ) : null}
    </Card>
  );
}
