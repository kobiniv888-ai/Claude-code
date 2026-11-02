import { Mail, MessageSquarePlus, ShieldAlert, ShieldCheck, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { ChevronEnd } from "@/components/common/directional-icon";
import { IconCircle, type IconCircleProps } from "@/components/ds/icon-circle";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

type Option = {
  key: "ticket" | "contact" | "safety" | "scam";
  href: string;
  icon: LucideIcon;
  tone: NonNullable<IconCircleProps["tone"]>;
};

const OPTIONS: Option[] = [
  { key: "scam", href: "/help/new-ticket?category=SCAM_REPORT", icon: ShieldAlert, tone: "coral-solid" },
  { key: "ticket", href: "/help/new-ticket", icon: MessageSquarePlus, tone: "navy" },
  { key: "contact", href: "/contact", icon: Mail, tone: "navy" },
  { key: "safety", href: "/safety", icon: ShieldCheck, tone: "green" },
];

/**
 * "Still need help?" as four icon cards: the urgent scam report first (coral), then a ticket, the
 * contact form and the Safety Center.
 */
export function ContactOptions({ className }: { className?: string }) {
  const t = useTranslations("help.contactOptions");
  return (
    <section aria-labelledby="help-contact-title" className={className}>
      <h2 id="help-contact-title" className="text-h2 text-balance">
        {t("title")}
      </h2>
      <p className="mt-1.5 max-w-2xl text-body text-pretty text-muted-foreground">{t("lead")}</p>
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
    </section>
  );
}
