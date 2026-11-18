import { getTranslations } from "next-intl/server";
import { FlagIcon, PhoneIcon, ShieldAlertIcon, TriangleAlertIcon } from "lucide-react";
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
 * a call button, and the emergency numbers page. SECURITY_REPORT 14.2.b/c: the note carries the
 * founder's exact sentence ("לעולם אל תשלמו מראש בקישור או בהעברה. משלמים למארח כשמגיעים.") and a
 * one-tap "דיווח על הונאה" for this booking; 14.3.c: "פרטי הקשר של המארח שונו לאחרונה" for 7 days
 * after the host changed the listing's contact details (src/lib/contact/changed.ts).
 */
export async function TripSafety({
  locale,
  emergencyNumber,
  reportHref,
  contactChanged = false,
}: {
  locale: AppLocale;
  emergencyNumber: string;
  /** The scam report page for this booking (src/lib/reports/scam.ts scamReportHref). */
  reportHref: string;
  contactChanged?: boolean;
}) {
  const t = await getTranslations({ locale, namespace: "trips.safety" });
  const brand = siteConfig.localizedName[locale] ?? siteConfig.name;
  const call = telHref(emergencyNumber);
  return (
    <Card as="section" aria-labelledby="trip-safety" className="grid gap-3">
      <h2 id="trip-safety" className="text-h2">
        {t("title")}
      </h2>
      {contactChanged ? (
        <div role="status" data-testid="contact-changed-notice" className="grid gap-1 rounded-input border border-border bg-warning-soft p-3 text-foreground">
          <p className="flex items-start gap-2 text-body font-semibold">
            <TriangleAlertIcon className="mt-0.5 size-5 shrink-0 text-primary-text" aria-hidden />
            <span>{t("contactChanged.title")}</span>
          </p>
          <p className="ps-7 text-small text-pretty">{t("contactChanged.body")}</p>
        </div>
      ) : null}
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
        <Link
          href={reportHref}
          prefetch={false}
          data-testid="scam-report-button"
          className="inline-flex min-h-11 items-center gap-2 justify-self-start rounded-md px-1 text-small font-semibold text-primary-text underline underline-offset-4 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <FlagIcon className="size-4.5" aria-hidden />
          {t("reportScam")}
        </Link>
      </div>
    </Card>
  );
}
