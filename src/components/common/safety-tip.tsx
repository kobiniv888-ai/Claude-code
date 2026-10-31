import type { ReactNode } from "react";
import { ShieldAlert, ShieldCheck } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { siteName } from "@/lib/seo";
import { cn } from "@/lib/utils";
import { ArrowEnd } from "./directional-icon";

/**
 * A short safety callout that links to the Safety Center. Without props it shows the general
 * "never pay before you've checked" tip.
 *
 *   <SafetyTip />
 *   <SafetyTip variant="warning" title={t("videoTipTitle")} linkLabel={t("more")}>{t("videoTip")}</SafetyTip>
 */
export function SafetyTip({
  variant = "info",
  title,
  children,
  linkLabel,
  href = "/safety",
  compact = false,
  className,
}: {
  variant?: "info" | "warning";
  title?: ReactNode;
  children?: ReactNode;
  linkLabel?: string | null;
  href?: string;
  compact?: boolean;
  className?: string;
}) {
  const t = useTranslations("states.safetyTip");
  const locale = useLocale();
  const Icon = variant === "warning" ? ShieldAlert : ShieldCheck;
  const link = linkLabel === null ? null : (linkLabel ?? t("link"));
  return (
    <aside
      className={cn(
        "flex gap-3 rounded-2xl border p-4",
        variant === "info" && "border-primary/15 bg-secondary/70",
        variant === "warning" && "border-warning/30 bg-warning-soft",
        compact ? "text-sm" : "sm:gap-4 sm:p-5",
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          "inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-card shadow-xs",
          variant === "info" ? "text-primary" : "text-warning",
          !compact && "sm:size-10",
        )}
      >
        <Icon className="size-5" strokeWidth={1.9} />
      </span>
      <div className="grid min-w-0 gap-1">
        <p className="font-semibold text-foreground">{title ?? t("title")}</p>
        <div className="text-sm leading-relaxed text-pretty text-foreground/80">
          {children ?? t("text", { name: siteName(locale) })}
        </div>
        {link ? (
          <Link
            href={href}
            className="group mt-1 inline-flex min-h-6 w-fit items-center gap-1 rounded-md text-sm font-semibold text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {link}
            <ArrowEnd aria-hidden className="size-3.5" />
          </Link>
        ) : null}
      </div>
    </aside>
  );
}
