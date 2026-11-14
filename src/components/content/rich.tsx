import type { ReactNode } from "react";
import { Ltr } from "@/components/common/ltr";
import { siteConfig, type AppLocale } from "@/config/site";
import { Link } from "@/i18n/navigation";
import { SCAM_REPORT_PATH } from "@/lib/reports/scam";

const linkClass =
  "font-medium text-primary underline decoration-primary/40 underline-offset-4 transition-colors hover:decoration-primary focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

/** The brand name as written in `locale` (from the config, never hard-coded). */
export function siteNameFor(locale: AppLocale | string): string {
  return (siteConfig.localizedName as Record<string, string>)[locale] ?? siteConfig.name;
}

/**
 * ICU arguments every content message may use. Numbers are passed as strings so they are
 * never rendered with Arabic-Indic digits.
 */
export function contentValues(locale: AppLocale | string) {
  return {
    siteName: siteNameFor(locale),
    email: siteConfig.supportEmail,
    minPhotos: String(siteConfig.listings.minPhotos),
    expiryDays: String(siteConfig.listings.defaultExpiryDays),
    locationMeters: String(siteConfig.listings.approximateLocationMeters),
  };
}

function internal(href: string) {
  function InternalLink(chunks: ReactNode) {
    return (
      <Link href={href} className={linkClass}>
        {chunks}
      </Link>
    );
  }
  return InternalLink;
}

/**
 * Rich-text tags shared by the content pages: <b>, <ltr>, <mailto>{email}</mailto>, <todo> and links to
 * the site's own pages (<help>, <contact>, <scamTicket>, <privacy>…).
 */
export const contentTags = {
  b: (chunks: ReactNode) => <strong className="font-semibold text-foreground">{chunks}</strong>,
  ltr: (chunks: ReactNode) => <Ltr>{chunks}</Ltr>,
  mailto: (chunks: ReactNode) => (
    <a href={`mailto:${siteConfig.supportEmail}`} className={linkClass}>
      <Ltr>{chunks}</Ltr>
    </a>
  ),
  /** Marks text a founder or lawyer still has to fill in, e.g. <todo>Company name</todo>. */
  todo: (chunks: ReactNode) => (
    <mark className="rounded-md bg-surface-muted box-decoration-clone px-1 py-0.5 text-foreground ring-1 ring-border-strong/30">
      [{chunks}]
    </mark>
  ),
  about: internal("/about"),
  howItWorks: internal("/how-it-works"),
  safety: internal("/safety"),
  help: internal("/help"),
  contact: internal("/contact"),
  ticket: internal("/help/new-ticket"),
  scamTicket: internal(SCAM_REPORT_PATH),
  search: internal("/search"),
  post: internal("/post"),
  settings: internal("/account/settings"),
  verification: internal("/account/verification"),
  terms: internal("/legal/terms"),
  privacy: internal("/legal/privacy"),
  cookies: internal("/legal/cookies"),
  listingRules: internal("/legal/listing-rules"),
  accessibility: internal("/legal/accessibility"),
};

/** Values + tags in one object, ready for `t.rich(key, richValues(locale))`. */
export function richValues(locale: AppLocale | string, extra?: Record<string, string>) {
  return { ...contentValues(locale), ...extra, ...contentTags };
}
