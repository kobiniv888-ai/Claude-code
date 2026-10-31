import { getLocale, getTranslations } from "next-intl/server";
import { brandIcons } from "@/components/common/brand-icons";
import { Container } from "@/components/common/container";
import { LogoLink } from "@/components/common/logo";
import { siteConfig } from "@/config/site";
import { Link } from "@/i18n/navigation";
import { siteName } from "@/lib/seo";
import { CurrencySwitcher } from "./currency-switcher";
import { LanguageSwitcher } from "./language-switcher";

const COLUMNS = [
  {
    key: "explore",
    links: [
      { key: "rent", href: "/search?deal=rent" },
      { key: "buy", href: "/search?deal=buy" },
      { key: "hotels", href: "/search?deal=hotels" },
      { key: "map", href: "/search?view=map" },
      { key: "jewishLife", href: "/jewish-life" },
      { key: "post", href: "/post" },
    ],
  },
  {
    key: "company",
    links: [
      { key: "about", href: "/about" },
      { key: "howItWorks", href: "/how-it-works" },
      { key: "contact", href: "/contact" },
    ],
  },
  {
    key: "support",
    links: [
      { key: "help", href: "/help" },
      { key: "safety", href: "/safety" },
      { key: "listingRules", href: "/legal/listing-rules" },
    ],
  },
  {
    key: "legal",
    links: [
      { key: "terms", href: "/legal/terms" },
      { key: "privacy", href: "/legal/privacy" },
      { key: "cookies", href: "/legal/cookies" },
      { key: "accessibility", href: "/legal/accessibility" },
    ],
  },
] as const;

const SOCIAL = ["facebook", "instagram", "telegram", "whatsapp"] as const;

export async function Footer() {
  const t = await getTranslations("footer");
  const locale = await getLocale();
  const name = siteName(locale);
  const social = SOCIAL.filter((key) => siteConfig.social[key]);

  return (
    <footer className="mt-auto border-t bg-card/60">
      <Container className="py-12 sm:py-14">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1.3fr)_repeat(4,minmax(0,1fr))] lg:gap-8">
          <div className="grid content-start gap-4">
            <LogoLink />
            <p className="max-w-sm text-sm leading-relaxed text-pretty text-muted-foreground">{t("mission")}</p>
            {social.length > 0 ? (
              <div className="grid gap-2">
                <p className="text-xs font-semibold text-muted-foreground">{t("social.title")}</p>
                <ul className="flex flex-wrap gap-2">
                  {social.map((key) => {
                    const Icon = brandIcons[key];
                    return (
                      <li key={key}>
                        <a
                          href={siteConfig.social[key]}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={t(`social.${key}`, { name })}
                          className="inline-flex size-11 items-center justify-center rounded-full border bg-background text-foreground/80 outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
                        >
                          <Icon size={18} />
                        </a>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-x-6 gap-y-8 sm:grid-cols-4 lg:col-span-4">
            {COLUMNS.map((column) => (
              <nav key={column.key} aria-labelledby={`footer-${column.key}`}>
                <h2 id={`footer-${column.key}`} className="mb-3 text-sm font-semibold wrap-break-word text-foreground">
                  {t(`columns.${column.key}`, { name })}
                </h2>
                <ul className="grid gap-0.5">
                  {column.links.map((link) => (
                    <li key={link.key}>
                      <Link
                        href={link.href}
                        className="-mx-1 inline-flex min-h-9 items-center rounded-md px-1 text-sm wrap-break-word text-muted-foreground underline-offset-4 outline-none transition-colors hover:text-foreground hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
                      >
                        {t(`links.${link.key}`)}
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
            ))}
          </div>
        </div>

        <div className="mt-12 flex flex-col-reverse gap-5 border-t pt-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="grid gap-1 text-xs text-muted-foreground">
            <p>{t("copyright", { year: String(new Date().getFullYear()), name })}</p>
            <p>{t("madeFor")}</p>
          </div>
          <div role="group" aria-label={t("preferences")} className="flex flex-wrap items-center gap-2">
            <LanguageSwitcher variant="footer" align="end" />
            <CurrencySwitcher variant="footer" align="end" />
          </div>
        </div>
      </Container>
    </footer>
  );
}
