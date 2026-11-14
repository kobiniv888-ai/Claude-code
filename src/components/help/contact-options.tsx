import { Bug, Clock, Mail, MessageSquarePlus, ShieldAlert, ShieldCheck, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { ChevronEnd } from "@/components/common/directional-icon";
import { IconCircle, type IconCircleProps } from "@/components/ds/icon-circle";
import { Link } from "@/i18n/navigation";
import { SCAM_REPORT_PATH } from "@/lib/reports/scam";
import { cn } from "@/lib/utils";

type Option = {
  key: "ticket" | "contact" | "safety" | "scam";
  href: string;
  icon: LucideIcon;
  tone: NonNullable<IconCircleProps["tone"]>;
};

const OPTIONS: Option[] = [
  { key: "scam", href: SCAM_REPORT_PATH, icon: ShieldAlert, tone: "coral-solid" },
  { key: "ticket", href: "/help/new-ticket", icon: MessageSquarePlus, tone: "navy" },
  { key: "contact", href: "/contact", icon: Mail, tone: "navy" },
  { key: "safety", href: "/safety", icon: ShieldCheck, tone: "green" },
];

/**
 * "Still need help?" as four icon cards: the urgent scam report first (coral), then a ticket, the
 * contact form and the Safety Center. Below them, one line for security researchers: how to report
 * a security problem in the site itself (SECURITY_REPORT 18.2, the /security page).
 */
export function ContactOptions({ className, replyPromise }: { className?: string; replyPromise?: ReactNode }) {
  const t = useTranslations("help.contactOptions");
  return (
    <section aria-labelledby="help-contact-title" className={className}>
      <h2 id="help-contact-title" className="text-h2 text-balance">
        {t("title")}
      </h2>
      <p className="mt-1.5 max-w-2xl text-body text-pretty text-muted-foreground">{t("lead")}</p>
      {replyPromise ? (
        // SECURITY_REPORT 19.b: the honest reply time, from Admin → Settings (founder's answer 9).
        <div className="mt-3 flex max-w-2xl items-start gap-2 rounded-input bg-muted/60 p-3">
          <Clock aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
          <div className="min-w-0">
            <span className="block text-small font-semibold">{t("replyTitle")}</span>
            {replyPromise}
          </div>
        </div>
      ) : null}
      <ul className="mt-5 grid gap-3 sm:grid-cols-2">
        {OPTIONS.map(({ key, href, icon, tone }) => (
          <li key={key} className="flex">
            <Link
              href={href}
              className={cn(
                "group flex w-full items-center gap-3.5 rounded-card border bg-card p-4 transition-transform duration-(--motion-fast) hover:-translate-y-0.5 active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none",
                key === "scam" && "border-primary/40 bg-primary-tint",
              )}
            >
              <IconCircle icon={icon} tone={tone} size="md" />
              <span className="min-w-0 flex-1">
                <span className="block text-body font-semibold">{t(`${key}.title`)}</span>
                <span className="mt-0.5 block text-small text-pretty text-muted-foreground">{t(`${key}.body`)}</span>
              </span>
              <ChevronEnd
                aria-hidden="true"
                className="size-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5"
              />
            </Link>
          </li>
        ))}
      </ul>
      <p className="mt-4 flex flex-wrap items-center gap-x-1.5 text-small text-pretty text-muted-foreground">
        <Bug aria-hidden="true" className="size-4 shrink-0" />
        <span>{t("security.lead")}</span>
        <Link
          href="/security"
          className="inline-flex min-h-11 items-center rounded-md font-medium text-primary-text underline underline-offset-4 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {t("security.link")}
        </Link>
      </p>
    </section>
  );
}
