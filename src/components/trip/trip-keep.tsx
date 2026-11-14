import { getTranslations } from "next-intl/server";
import { CalendarPlusIcon } from "lucide-react";
import { GoogleIcon } from "@/components/common/brand-icons";
import { buttonStyles } from "@/components/ds/button";
import { Card } from "@/components/ds/card";
import type { AppLocale } from "@/config/site";
import { OfflineSave, type OfflineTripProps } from "./offline-save";

/**
 * "לשמור את הפרטים" (round 3, brief 7.1): "הוספה ליומן" — the .ics file (the stay, the address,
 * the booking number) and a Google Calendar link — and, under it, "שמירה לשימוש בלי אינטרנט"
 * (./offline-save.tsx). The calendar part only for a confirmed booking (`calendar` null otherwise);
 * the offline part only while a copy may be kept (`offline` null otherwise: offlineSaveAllowed in
 * src/lib/trip/offline.ts). Nothing at all when neither applies.
 */
export async function TripKeep({
  locale,
  calendar,
  offline,
}: {
  locale: AppLocale;
  calendar: { icsHref: string; fileName: string; googleUrl: string } | null;
  offline: OfflineTripProps | null;
}) {
  if (!calendar && !offline) return null;
  const t = await getTranslations({ locale, namespace: "trips" });
  return (
    <Card as="section" aria-labelledby="trip-keep" className="grid gap-4">
      <h2 id="trip-keep" className="text-h2">
        {t("keep.title")}
      </h2>
      {calendar ? (
        <div className="grid gap-2">
          <div className="grid gap-2 sm:flex sm:flex-wrap">
            <a href={calendar.icsHref} download={calendar.fileName} className={buttonStyles({ variant: "soft", size: "md" })}>
              <CalendarPlusIcon aria-hidden />
              {t("keep.calendar")}
            </a>
            <a href={calendar.googleUrl} target="_blank" rel="noopener noreferrer" className={buttonStyles({ variant: "secondary", size: "md" })}>
              <GoogleIcon className="size-5" />
              {t("keep.google")}
            </a>
          </div>
          <p className="text-caption text-muted-foreground">{t("keep.calendarHint")}</p>
        </div>
      ) : null}
      {offline ? (
        <div className={calendar ? "grid gap-2 border-t border-border pt-4" : "grid gap-2"}>
          <h3 className="text-h3 font-semibold">{t("offline.title")}</h3>
          <OfflineSave {...offline} />
        </div>
      ) : null}
    </Card>
  );
}
