import { House, LifeBuoy, Search } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { Container } from "@/components/common/container";
import { NotFoundState } from "@/components/common/states";
import { Link } from "@/i18n/navigation";
import { siteName } from "@/lib/seo";
import { NAV_ITEMS } from "./nav-items";

const SUGGESTIONS = ["shortStay", "monthly", "buy", "hotels", "jewishLife"] as const;

/**
 * The designed 404 content (title, "search" and "home", the main sections and help), without the
 * site frame: app/[locale]/(site)/not-found.tsx shows it inside the (site) layout's header and
 * footer, app/[locale]/not-found.tsx (admin and dev addresses) on its own.
 *
 * Why the frame is not part of it: Next.js renders a segment's not-found page into the data of
 * every page below that segment (so a client-side notFound() shows at once). With the frame in
 * app/[locale]/not-found.tsx, every page carried a second header, footer, bottom bar and cookie
 * banner (~40 KB of page data).
 */
export async function NotFoundView() {
  const [t, tNav, locale] = await Promise.all([getTranslations("states.notFound"), getTranslations("nav"), getLocale()]);
  const suggestions = NAV_ITEMS.filter((item) => (SUGGESTIONS as readonly string[]).includes(item.key));

  return (
    <>
      {/* not-found files cannot export metadata; React places this <title> in <head>. */}
      <title>{`${t("title")} · ${siteName(locale)}`}</title>
      <Container size="narrow" className="relative isolate">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-80 bg-[radial-gradient(55%_80%_at_50%_0%,color-mix(in_oklab,var(--primary)_9%,transparent),transparent)]"
        />
        <NotFoundState
          size="lg"
          headingLevel="h1"
          eyebrow={t("eyebrow")}
          title={t("title")}
          description={t("description")}
          action={{ label: t("search"), href: "/search", icon: Search }}
          secondaryAction={{ label: t("home"), href: "/", icon: House }}
        >
          <nav aria-labelledby="not-found-suggestions" className="mt-4 grid w-full gap-3 border-t pt-6">
            <h2 id="not-found-suggestions" className="text-sm font-semibold text-muted-foreground">
              {t("suggestions")}
            </h2>
            <ul className="flex flex-wrap justify-center gap-2">
              {suggestions.map(({ key, href, icon: Icon }) => (
                <li key={key}>
                  <Link
                    href={href}
                    className="inline-flex min-h-11 items-center gap-2 rounded-full border bg-card px-4 text-sm font-medium shadow-xs outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    <Icon aria-hidden className="size-4 text-primary" />
                    {tNav(`tabs.${key}`)}
                  </Link>
                </li>
              ))}
              <li>
                <Link
                  href="/help"
                  className="inline-flex min-h-11 items-center gap-2 rounded-full border bg-card px-4 text-sm font-medium shadow-xs outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <LifeBuoy aria-hidden className="size-4 text-primary" />
                  {t("help")}
                </Link>
              </li>
            </ul>
          </nav>
        </NotFoundState>
      </Container>
    </>
  );
}
