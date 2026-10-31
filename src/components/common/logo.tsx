import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import { siteConfig, type AppLocale } from "@/config/site";
import { Link } from "@/i18n/navigation";
import { isAppLocale } from "@/i18n/locale";
import { cn } from "@/lib/utils";

/**
 * The brand: the mark from public/brand (siteConfig.logo.mark) and the name as written in
 * the current language ("בית" in Hebrew, "Bayit" elsewhere). Works in server and client components.
 */

const sizes = {
  sm: { mark: 28, text: "text-lg" },
  md: { mark: 34, text: "text-xl" },
  lg: { mark: 44, text: "text-2xl" },
} as const;

export function LogoMark({ size = 34, className }: { size?: number; className?: string }) {
  return (
    <Image
      src={siteConfig.logo.mark}
      alt=""
      width={size}
      height={size}
      unoptimized
      loading="eager"
      className={cn("shrink-0 select-none", className)}
      draggable={false}
    />
  );
}

export function Logo({
  size = "md",
  showName = true,
  className,
}: {
  size?: keyof typeof sizes;
  showName?: boolean;
  className?: string;
}) {
  const locale = useLocale();
  const name = isAppLocale(locale) ? siteConfig.localizedName[locale as AppLocale] : siteConfig.name;
  const s = sizes[size];
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark size={s.mark} />
      {showName ? (
        <span className={cn("font-extrabold leading-none tracking-tight text-primary", s.text)}>{name}</span>
      ) : null}
    </span>
  );
}

/** The logo as a link to the home page (header, footer, error pages). */
export function LogoLink({
  size = "md",
  showName = true,
  className,
  onClick,
}: {
  size?: keyof typeof sizes;
  showName?: boolean;
  className?: string;
  onClick?: () => void;
}) {
  const t = useTranslations("nav");
  const locale = useLocale();
  const name = isAppLocale(locale) ? siteConfig.localizedName[locale as AppLocale] : siteConfig.name;
  return (
    <Link
      href="/"
      aria-label={t("homeLink", { name })}
      onClick={onClick}
      className={cn(
        "-m-1 inline-flex shrink-0 rounded-xl p-1 outline-none transition-opacity hover:opacity-90 focus-visible:ring-3 focus-visible:ring-ring/50",
        className,
      )}
    >
      <Logo size={size} showName={showName} />
    </Link>
  );
}
