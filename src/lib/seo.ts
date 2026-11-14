import type { Metadata, MetadataRoute } from "next";
import { locales, siteConfig, type AppLocale } from "@/config/site";
import { isAppLocale } from "@/i18n/locale";
import { readSiteEnv } from "@/lib/site-env";
import { isPermanentSiteUrl, absoluteUrl as siteAbsoluteUrl, siteUrl } from "@/lib/site-url";

/**
 * SEO helpers for generateMetadata — canonical URLs, hreflang alternates, Open Graph and
 * Twitter cards. Client-safe (pure).
 *
 *   export async function generateMetadata({ params }: PageProps<"/[locale]/about">) {
 *     const { locale } = await params;
 *     const t = await getTranslations({ locale, namespace: "about" });
 *     return pageMetadata({ locale, path: "/about", title: t("metaTitle"), description: t("metaDescription") });
 *   }
 */

/** The language search engines get when none of the five matches the visitor. */
export const X_DEFAULT_LOCALE: AppLocale = "en";

/**
 * The brand share image (1200×630) of a language, drawn by src/app/[locale]/opengraph-image.tsx:
 * purple, the white mark, the name and the tagline in that language.
 */
export function defaultOgImage(locale: AppLocale | string): { url: string; width: number; height: number } {
  const current = isAppLocale(locale) ? locale : X_DEFAULT_LOCALE;
  return { url: `/${current}/opengraph-image`, width: 1200, height: 630 };
}

/** The English brand share image (pages that know their language use `defaultOgImage(locale)`). */
export const DEFAULT_OG_IMAGE = defaultOgImage(X_DEFAULT_LOCALE);

const OG_LOCALES: Record<AppLocale, string> = {
  he: "he_IL",
  en: "en_US",
  ru: "ru_RU",
  ar: "ar_AR",
  ka: "ka_GE",
};

/** Open Graph locale for a site language: "he" → "he_IL". */
export function ogLocale(locale: AppLocale | string): string {
  return isAppLocale(locale) ? OG_LOCALES[locale] : OG_LOCALES[X_DEFAULT_LOCALE];
}

/** The brand name as written in `locale` ("בית" in Hebrew). */
export function siteName(locale: AppLocale | string): string {
  return isAppLocale(locale) ? siteConfig.localizedName[locale] : siteConfig.name;
}

/** The site's public address (SITE_URL, see @/lib/site-url), without a trailing slash. */
export function siteOrigin(): string {
  return siteUrl();
}

/** "/about" → "https://bayit.example/about". Absolute URLs are returned unchanged. */
export function absoluteUrl(path: string = "/"): string {
  return siteAbsoluteUrl(path);
}

/** "/about" in Hebrew → "/he/about"; "/" → "/he". Keeps a query string or hash. */
export function localizedPath(locale: AppLocale | string, pathWithoutLocale: string = "/"): string {
  const path = pathWithoutLocale.startsWith("/") ? pathWithoutLocale : `/${pathWithoutLocale}`;
  const rest = /^\/(?=[?#]|$)/.test(path) ? path.slice(1) : path;
  return `/${locale}${rest}`;
}

/**
 * Canonical URL and hreflang alternates for a page that exists in all five languages.
 * `pathWithoutLocale` is the page path as the site links it: "/about", "/listing/1234-vake".
 */
export function localizedAlternates(
  pathWithoutLocale: string,
  locale: AppLocale | string,
): { canonical: string; languages: Record<AppLocale | "x-default", string> } {
  const languages = Object.fromEntries(
    locales.map((l) => [l, absoluteUrl(localizedPath(l, pathWithoutLocale))]),
  ) as Record<AppLocale | "x-default", string>;
  languages["x-default"] = absoluteUrl(localizedPath(X_DEFAULT_LOCALE, pathWithoutLocale));
  const current = isAppLocale(locale) ? locale : X_DEFAULT_LOCALE;
  return { canonical: languages[current], languages };
}

/** Search results show about this many characters of a description. */
export const META_DESCRIPTION_LENGTH = 160;

/**
 * A page's description from a short lead ("₾120 / night · Old Batumi, Batumi") and its own text:
 * "lead · start of the text…", cut at a word near META_DESCRIPTION_LENGTH characters. Whitespace
 * (line breaks in an owner's text) becomes single spaces.
 */
export function metaDescription(lead: string, text: string, max: number = META_DESCRIPTION_LENGTH): string {
  const clean = (value: string) => value.replace(/\s+/g, " ").trim();
  const full = [clean(lead), clean(text)].filter(Boolean).join(" · ");
  if (full.length <= max) return full;
  const cut = full.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s·,.;:–—-]+$/u, "")}…`;
}

export type SeoImage = string | { url: string; width?: number; height?: number; alt?: string };

export type PageMetadataInput = {
  locale: AppLocale | string;
  /** Page path without the locale: "/about", "/search", "/listing/1234-sunny-flat". */
  path: string;
  /** Page title without the site name (the layout adds " · Bayit"). */
  title: string;
  description: string;
  /**
   * Social image (a photo…). Defaults to the brand image of the page's language. "route": leave
   * og:image and twitter:image to the route's own opengraph-image file (Next 16 only uses that file
   * when the page's metadata sets no images), e.g. the listing page's photo-with-logo image.
   */
  image?: SeoImage | "route";
  /** Keep the page out of search results (account pages, filtered result pages…). */
  noIndex?: boolean;
  /**
   * With `noIndex`: also ask search engines not to follow the page's links ("noindex, nofollow"),
   * e.g. demo listings (round 3, brief 10). Without it a noindex page still passes its links on.
   */
  noFollow?: boolean;
  /** Open Graph type; "article" for guides. */
  type?: "website" | "article";
};

function normalizeImage(image: SeoImage | undefined, alt: string, locale: AppLocale) {
  if (!image) {
    const fallback = defaultOgImage(locale);
    return { ...fallback, url: absoluteUrl(fallback.url), alt };
  }
  if (typeof image === "string") return { url: absoluteUrl(image), alt };
  return { ...image, url: absoluteUrl(image.url), alt: image.alt ?? alt };
}

/** Complete metadata for a page: title, description, canonical, hreflang, Open Graph and Twitter. */
export function pageMetadata({
  locale,
  path,
  title,
  description,
  image,
  noIndex = false,
  noFollow = false,
  type = "website",
}: PageMetadataInput): Metadata {
  const alternates = localizedAlternates(path, locale);
  const current = isAppLocale(locale) ? locale : X_DEFAULT_LOCALE;
  const ogImage = image === "route" ? null : normalizeImage(image, title, current);
  return {
    title,
    description,
    alternates,
    openGraph: {
      type,
      siteName: siteName(current),
      locale: ogLocale(current),
      alternateLocale: locales.filter((l) => l !== current).map((l) => OG_LOCALES[l]),
      url: alternates.canonical,
      title,
      description,
      ...(ogImage ? { images: [ogImage] } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      ...(ogImage ? { images: [ogImage.url] } : {}),
    },
    ...(noIndex ? { robots: { index: false, follow: !noFollow } } : {}),
  };
}

// ─── Production host only (round 3, brief 10: "never let Google index non-production addresses") ──

/** The header every non-production response carries, and the private pages everywhere. */
export const NOINDEX_HEADER_VALUE = "noindex, nofollow";

type HostEnv = { SITE_URL?: string; SITE_ENV?: string };

/**
 * "Bayit.GE." / "bayit.ge:443" → "bayit.ge"; "localhost:4691" keeps its port. null for anything
 * that is not a plain host[:port] (a forged or broken header never matches the site's host).
 */
export function normalizeRequestHost(value: string | null | undefined): string | null {
  const raw = value?.trim().toLowerCase();
  if (!raw) return null;
  const match = /^(\[[0-9a-f:.]+\]|[a-z0-9-]+(?:\.[a-z0-9-]+)*\.?)(?::(\d{1,5}))?$/.exec(raw);
  if (!match) return null;
  const hostname = match[1].replace(/\.$/, "");
  const port = match[2] && match[2] !== "80" && match[2] !== "443" ? `:${Number(match[2])}` : "";
  return hostname ? `${hostname}${port}` : null;
}

/**
 * The host of the configured permanent address, SITE_URL (not NEXT_PUBLIC_SITE_URL, which is the
 * address a codespace or a test server runs on): null while SITE_URL is unset or invalid.
 */
export function productionHost(env: HostEnv = process.env as HostEnv): string | null {
  const raw = env.SITE_URL?.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return normalizeRequestHost(url.host);
  } catch {
    return null;
  }
}

/**
 * True only when `host` is SITE_URL's host (contract 2) AND this is the real site
 * (SITE_ENV=production exactly: development and staging sites, and a missing SITE_ENV, are never
 * indexed). Every other address (a codespace, localhost, a Vercel preview, an IP, a forged header)
 * and any host while SITE_URL is unset: false.
 */
export function isProductionHost(host: string | null, env: HostEnv = process.env as HostEnv): boolean {
  if (readSiteEnv(env) !== "production") return false;
  const site = productionHost(env);
  const current = normalizeRequestHost(host);
  return site !== null && current !== null && current === site;
}

export type IndexingEnv = HostEnv & {
  NODE_ENV?: string;
  NEXT_PUBLIC_SITE_URL?: string;
  VERCEL?: string;
  VERCEL_ENV?: string;
  /** Vercel: the project's production domain (its shortest custom domain, else the *.vercel.app one). */
  VERCEL_PROJECT_PRODUCTION_URL?: string;
};

/**
 * The startup message about Google indexing (src/instrumentation.ts), or null when all is well.
 * Only SITE_URL's host is ever indexed (isProductionHost), so a server on a real domain
 * (NEXT_PUBLIC_SITE_URL) without a valid SITE_URL silently says noindex on every page: a loud
 * error (seo-3). Not in development, not on a Vercel preview, and only a short note while the
 * site runs on a test or temporary address (localhost, a codespace, *.vercel.app), where noindex is
 * right (siteUrlWarning already warns about that address). On Vercel's production deployment, also
 * an error when SITE_URL's host is not the project's production domain (bayit.ge against
 * www.bayit.ge): requests to the other host are noindex.
 */
export function indexingWarning(env: IndexingEnv = process.env as IndexingEnv): { level: "error" | "info"; text: string } | null {
  if (env.NODE_ENV !== "production") return null;
  const onVercel = Boolean(env.VERCEL?.trim());
  if (onVercel && env.VERCEL_ENV !== "production") return null;
  const host = productionHost(env);
  const line = "!".repeat(78);
  if (!host) {
    if (!isPermanentSiteUrl(siteUrl(env))) {
      return { level: "info", text: "[seo] SITE_URL is not set: every page says noindex and robots.txt names no sitemap (right for a test or preview address)." };
    }
    return {
      level: "error",
      text: [
        line,
        "!! SITE_URL is not set or not a valid address, so Google will NOT index the site:",
        "!! every page says \"noindex, nofollow\" (X-Robots-Tag) and robots.txt names no sitemap.",
        "!! Only requests to SITE_URL's host count as the real site (NEXT_PUBLIC_SITE_URL does not).",
        "!! Set SITE_URL to the exact address visitors open (e.g. https://bayit.ge: with or without",
        "!! www, as the site is served) and restart. Behind your own reverse proxy, pass the original",
        "!! Host header (or X-Forwarded-Host). See OWNER_TODO.md.",
        line,
      ].join("\n"),
    };
  }
  const vercelHost = env.VERCEL_ENV === "production" ? normalizeRequestHost(env.VERCEL_PROJECT_PRODUCTION_URL) : null;
  if (vercelHost && vercelHost !== host) {
    return {
      level: "error",
      text: [
        line,
        `!! SITE_URL's host is ${host}, but Vercel's production domain is ${vercelHost}.`,
        `!! Only requests to ${host} can be indexed by Google: pages opened on ${vercelHost} say noindex.`,
        "!! If visitors land on that address, set SITE_URL to it (or redirect it to SITE_URL) and redeploy.",
        line,
      ].join("\n"),
    };
  }
  return null;
}

type HeaderReader = { get(name: string): string | null };

/**
 * Every host a request names: the Host header, each X-Forwarded-Host entry (a proxy chain lists
 * several) and each `host=` of a Forwarded header. Hosting platforms (Vercel, Codespaces, tunnels)
 * put the address the visitor opened in X-Forwarded-Host, so a preview that forwards to a server
 * whose Host is the real domain still counts as a preview.
 */
export function requestHosts(headers: HeaderReader): string[] {
  const hosts: string[] = [];
  const host = headers.get("host");
  if (host) hosts.push(host);
  for (const entry of headers.get("x-forwarded-host")?.split(",") ?? []) {
    if (entry.trim()) hosts.push(entry.trim());
  }
  for (const part of headers.get("forwarded")?.split(/[,;]/) ?? []) {
    const match = /^\s*host\s*=\s*"?([^";]*)"?\s*$/i.exec(part);
    if (match?.[1]) hosts.push(match[1]);
  }
  return hosts;
}

/**
 * A request to the real site: at least one host, and EVERY host it names is SITE_URL's host. The
 * conservative reading: one other host anywhere (a preview's forwarded address, a forged header)
 * and the response is treated as non-production (noindex, robots.txt "Disallow: /"). Cheap: no
 * database, so the proxy runs it on every page.
 */
export function isProductionRequest(headers: HeaderReader, env: HostEnv = process.env as HostEnv): boolean {
  const hosts = requestHosts(headers);
  return hosts.length > 0 && hosts.every((host) => isProductionHost(host, env));
}

/**
 * Areas that are never indexed, under every language: their responses carry X-Robots-Tag on every
 * host, and robots.txt keeps crawlers out of the ones no public page links to (see below). Trip
 * pages live under /account.
 */
export const PRIVATE_AREAS = [
  "admin",
  "account",
  "post",
  "login",
  "two-factor",
  "verify-phone",
  "saved",
  "lists",
  "unsubscribe",
] as const;

/**
 * Private areas that public pages link to: shared lists (/lists/<token>, made to be passed around)
 * and the post form, login, 2-step login, phone check, saved places and unsubscribe pages (linked
 * from the header, footer, bottom bar and emails of every page). A robots.txt "Disallow" would stop
 * Google from reading their noindex, and Google may then list the bare link anyway ("Indexed,
 * though blocked by robots.txt"); so they stay crawlable and say noindex themselves (X-Robots-Tag
 * from the proxy and the page's robots meta). Only /admin, /account and /api/ stay disallowed.
 */
export const CRAWLABLE_PRIVATE_AREAS: readonly (typeof PRIVATE_AREAS)[number][] = [
  "post",
  "login",
  "two-factor",
  "verify-phone",
  "saved",
  "lists",
  "unsubscribe",
];

const PRIVATE_PATH = new RegExp(`^/(?:${locales.join("|")})/(?:${PRIVATE_AREAS.join("|")})(?:/|$)`);

/** "/he/account/trips/AB12" → true; "/he/search" → false. */
export function isPrivatePath(pathname: string): boolean {
  return PRIVATE_PATH.test(pathname);
}

/**
 * The X-Robots-Tag a response gets (src/proxy.ts), or null for none: "noindex, nofollow" on every
 * response of a non-production host (pages, the API, images, public files, robots.txt and
 * sitemap.xml), and on the private areas of the real site.
 */
export function robotsHeaderFor(request: { headers: HeaderReader; pathname: string }, env: HostEnv = process.env as HostEnv): string | null {
  if (!isProductionRequest(request.headers, env)) return NOINDEX_HEADER_VALUE;
  return isPrivatePath(request.pathname) ? NOINDEX_HEADER_VALUE : null;
}

/**
 * robots.txt "Disallow" lines of the real site: the private areas no public page links to (admin,
 * account) in each language, and the API. Each area is matched exactly ("/he/admin",
 * "/he/admin/…", "/he/admin?…"), never as a prefix, so a city page such as "/he/adminville"
 * stays open.
 */
export function privateDisallowRules(): string[] {
  const areas = PRIVATE_AREAS.filter((area) => !CRAWLABLE_PRIVATE_AREAS.includes(area));
  return [
    ...locales.flatMap((locale) => areas.flatMap((area) => [`/${locale}/${area}$`, `/${locale}/${area}/`, `/${locale}/${area}?`])),
    "/api/",
  ];
}

/**
 * robots.txt (src/app/robots.ts). The real site: the public pages are open, /admin, /account and
 * the API are closed, and the sitemap is named. Any other host: everything open and no sitemap. A
 * "Disallow: /" there would stop crawlers from ever reading the noindex every response of that host
 * carries (src/proxy.ts), so a linked preview URL could linger as a bare search result; open, it is
 * fetched, seen as noindex and dropped.
 */
export function robotsFor(production: boolean): MetadataRoute.Robots {
  if (!production) return { rules: [{ userAgent: "*", allow: "/" }] };
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: privateDisallowRules() }],
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}

// ─── Structured data (only types Google supports; never Review or AggregateRating) ──────────

export type BreadcrumbItem = { name: string; path: string };

/** The square app icon (512×512 PNG, public/icons), as the organization's logo. */
export const ORGANIZATION_LOGO = "/icons/icon-512.png";

/**
 * schema.org BreadcrumbList for a page (contract 2): `path` without the locale, as for pageMetadata
 * ("/" for the home page, "/batumi/short-stays"). Names are trimmed; items without a name are left
 * out. Render it with <JsonLd> (@/components/common/json-ld).
 */
export function breadcrumbJsonLd(items: BreadcrumbItem[], locale: AppLocale | string): Record<string, unknown> {
  const current = isAppLocale(locale) ? locale : X_DEFAULT_LOCALE;
  const named = items
    .map((item) => ({ name: item.name.replace(/\s+/g, " ").trim(), path: item.path }))
    .filter((item) => item.name.length > 0);
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: named.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: absoluteUrl(localizedPath(current, item.path)),
    })),
  };
}

/**
 * The home page's WebSite and Organization (one JSON-LD graph). No SearchAction: Google retired the
 * search box it powered (November 2024). The organization has only facts the site itself states:
 * its name, address on the web and logo; no reviews, ratings, phone numbers or social profiles.
 */
export function homeJsonLd(locale: AppLocale | string): Record<string, unknown> {
  const current = isAppLocale(locale) ? locale : X_DEFAULT_LOCALE;
  const home = absoluteUrl(localizedPath(current, "/"));
  const organizationId = `${absoluteUrl("/")}#organization`;
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": `${home}#website`,
        name: siteName(current),
        alternateName: siteConfig.name,
        url: home,
        inLanguage: current,
        publisher: { "@id": organizationId },
      },
      {
        "@type": "Organization",
        "@id": organizationId,
        name: siteConfig.name,
        url: absoluteUrl("/"),
        logo: absoluteUrl(ORGANIZATION_LOGO),
      },
    ],
  };
}
