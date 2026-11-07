import { getTranslations } from "next-intl/server";
import { PhoneIcon, ShieldAlertIcon } from "lucide-react";
import { Ltr } from "@/components/common/ltr";
import { buttonStyles } from "@/components/ds/button";
import { Card } from "@/components/ds/card";
import { SpriteIcon } from "@/components/ds/sprite-icons";
import { siteConfig, type AppLocale } from "@/config/site";
import { Link } from "@/i18n/navigation";
import { telHref } from "@/lib/phone";

/**
 * "בטיחות" (round 3, brief 7.1): the safety note exactly as the brief words it ("בית לא גובה
 * תשלום. לעולם אל תשלמו מראש בקישור ששלחו לכם."), the emergency number of the place's country as
 * a call button, and the emergency numbers page.
 */
export async function TripSafety({ locale, emergencyNumber }: { locale: AppLocale; emergencyNumber: string }) {
  const t = await getTranslations({ locale, namespace: "trips.safety" });
  const brand = siteConfig.localizedName[locale] ?? siteConfig.name;
  const call = telHref(emergencyNumber);
  return (
    <Card as="section" aria-labelledby="trip-safety" className="grid gap-3">
      <h2 id="trip-safety" className="text-h2">
        {t("title")}
      </h2>
      <p className="flex items-start gap-2 rounded-input bg-surface-muted p-3 text-body font-medium">
        <ShieldAlertIcon className="mt-0.5 size-5 shrink-0 text-primary-text" aria-hidden />
        <span>{t("note", { brand })}</span>
      </p>
      <div className="grid gap-2 sm:flex sm:flex-wrap sm:items-center">
        {call ? (
          <a href={call} className={buttonStyles({ variant: "secondary", size: "md" })}>
            <PhoneIcon aria-hidden />
            <span>
              {t.rich("call", { number: emergencyNumber, ltr: (chunks) => <Ltr>{chunks}</Ltr> })}
            </span>
          </a>
        ) : null}
        <Link
          href="/safety#emergency"
          className="inline-flex min-h-11 items-center gap-2 justify-self-start rounded-md px-1 text-small font-medium text-primary-text underline underline-offset-4 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <SpriteIcon name="life-buoy" className="size-4.5" />
          {t("emergency")}
        </Link>
      </div>
    </Card>
  );
}
