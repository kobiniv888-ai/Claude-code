import { ChevronRight, Mail, MessageSquarePlus, ShieldAlert, ShieldCheck, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

type Option = {
  key: "ticket" | "contact" | "safety" | "scam";
  href: string;
  icon: LucideIcon;
  tone: "primary" | "verified" | "urgent";
};

const OPTIONS: Option[] = [
  { key: "ticket", href: "/help/new-ticket", icon: MessageSquarePlus, tone: "primary" },
  { key: "contact", href: "/contact", icon: Mail, tone: "primary" },
  { key: "safety", href: "/safety", icon: ShieldCheck, tone: "verified" },
  { key: "scam", href: "/help/new-ticket?category=SCAM_REPORT", icon: ShieldAlert, tone: "urgent" },
];

const iconTone = {
  primary: "bg-secondary text-primary",
  verified: "bg-verified-soft text-verified",
  urgent: "bg-terracotta text-terracotta-foreground",
} as const;

/** "Still need help?" — open a ticket, the contact form, the Safety Center, or an urgent scam report. */
export function ContactOptions({ className }: { className?: string }) {
  const t = useTranslations("help.contactOptions");
  return (
    <section aria-labelledby="help-contact-title" className={cn("rounded-3xl border bg-card p-5 shadow-card sm:p-8", className)}>
      <h2 id="help-contact-title" className="text-xl font-bold tracking-tight sm:text-2xl">
        {t("title")}
      </h2>
      <p className="mt-2 max-w-2xl text-sm text-pretty text-muted-foreground sm:text-base">{t("lead")}</p>
      <ul className="mt-6 grid gap-3 sm:grid-cols-2">
        {OPTIONS.map(({ key, href, icon: Icon, tone }) => (
          <li key={key} className="flex">
            <Link
              href={href}
              className={cn(
                "group flex w-full items-center gap-4 rounded-2xl border bg-background p-4 transition-all hover:-translate-y-0.5 hover:shadow-card-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                tone === "urgent" && "border-terracotta/40 bg-accent",
              )}
            >
              <span aria-hidden="true" className={cn("flex size-12 shrink-0 items-center justify-center rounded-xl", iconTone[tone])}>
                <Icon className="size-6" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{t(`${key}.title`)}</span>
                <span className="mt-0.5 block text-sm text-pretty text-muted-foreground">{t(`${key}.body`)}</span>
              </span>
              <ChevronRight
                aria-hidden="true"
                className="size-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 rtl:-scale-x-100 rtl:group-hover:-translate-x-0.5"
              />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
