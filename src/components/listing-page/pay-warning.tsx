import { useTranslations } from "next-intl";
import { SpriteIcon } from "@/components/ds/sprite-icons";
import { Link } from "@/i18n/navigation";
import { scamReportHref } from "@/lib/reports/scam";
import { cn } from "@/lib/utils";

/**
 * Next to the contact and booking buttons (SECURITY_REPORT 14.2.b, 14.2.c): the founder's exact
 * warning "לעולם אל תשלמו מראש בקישור או בהעברה. משלמים למארח כשמגיעים." and the one-tap
 * "דיווח על הונאה" (the scam report, pre-set to "asked to pay", open to visitors too). A server
 * component: no script on the listing page.
 */
export function PayWarning({ listingNumber, className }: { listingNumber: number; className?: string }) {
  const t = useTranslations("listing.payWarning");
  return (
    <div
      data-testid="pay-warning"
      className={cn("grid gap-2 rounded-card border border-primary/30 bg-primary-tint p-4 text-small text-foreground", className)}
    >
      <p className="flex items-start gap-2 text-pretty">
        <SpriteIcon name="shield-check" className="mt-0.5 size-4.5 shrink-0 text-primary-text" />
        <span>{t("text")}</span>
      </p>
      <Link
        href={scamReportHref({ listing: listingNumber })}
        prefetch={false}
        rel="nofollow"
        data-testid="scam-report-button"
        className="inline-flex min-h-11 items-center gap-1.5 justify-self-start rounded font-semibold text-primary-text underline underline-offset-4 outline-none hover:no-underline focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <SpriteIcon name="flag" className="size-4 shrink-0" />
        {t("report")}
      </Link>
    </div>
  );
}
