import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Container } from "@/components/common/container";
import { EmptyState } from "@/components/ds/empty-state";
import { SpriteIcon, spriteIcon } from "@/components/ds/sprite-icons";
import { buttonStyles } from "@/components/ds/button";
import { ListingGrid } from "@/components/listing/listing-grid";
import { CopySharedListButton } from "@/components/lists/copy-shared-list";
import { siteConfig, type AppLocale } from "@/config/site";
import { isAppLocale } from "@/i18n/locale";
import { Link } from "@/i18n/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { formatNumber } from "@/lib/format";
import { getCardContext } from "@/lib/listing-page/context";
import { getListingCards } from "@/lib/listing/queries";
import { accountListPath, sharedListPath } from "@/lib/lists/paths";
import { getSharedList, publicListName } from "@/lib/lists/server";
import { pageMetadata } from "@/lib/seo";
import { recordIdMiss } from "@/lib/security/id-guess";

type Props = { params: Promise<{ locale: string; token: string }> };

const loadList = cache((token: string) => getSharedList(token));
const SearchXIcon = spriteIcon("search-x");

/** Never indexed, never cached by search engines: the link is private to whoever got it. */
const ROBOTS: Metadata["robots"] = { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, token } = await params;
  const t = await getTranslations({ locale, namespace: "lists" });
  const shared = await loadList(token);
  if (!shared) return { title: t("shared.eyebrow"), robots: ROBOTS };
  const name = publicListName(shared, { defaultName: t("saving.defaultName"), fallback: t("shared.eyebrow") });
  const count = shared.listingIds.length;
  return {
    ...pageMetadata({
      locale,
      path: sharedListPath(token),
      title: t("shared.metaTitle", { name }),
      description: t("shared.metaDescription", { count, countText: formatNumber(count, locale) }),
      // og:image comes from ./opengraph-image.tsx (the first place's photo and the list's name).
      image: "route",
    }),
    robots: ROBOTS,
    referrer: "no-referrer",
  };
}

/**
 * /lists/<token> — a shared list (round 3, brief 7.2; section 13.6): view only, for anyone with
 * the link, no account needed. It shows the list's name and the places in it that are public NOW
 * (hidden, removed or no-longer-shown demo listings are left out), as the usual cards. Nothing
 * about the owner: no name, no contact details (the cards carry only public listing data), and
 * their private notes never leave the account. A list whose sharing stopped is a 404.
 *
 * A signed-in viewer can copy the list into their own account; signed out, the login dialog opens
 * first. The owner sees a link to manage the list instead.
 */
export default async function SharedListPage({ params }: Props) {
  const { locale: raw, token } = await params;
  setRequestLocale(raw);
  const locale: AppLocale = isAppLocale(raw) ? raw : siteConfig.i18n.primaryLocale;
  const shared = await loadList(token);
  if (!shared) {
    // 4.7.a: a burst of links that match nothing alerts the founder (src/lib/security/id-guess.ts).
    await recordIdMiss("list");
    notFound();
  }

  const [t, ctx, viewer] = await Promise.all([getTranslations("lists"), getCardContext(locale), getCurrentUser().catch(() => null)]);
  const cards = await getListingCards(shared.listingIds, ctx);
  const name = publicListName(shared, { defaultName: t("saving.defaultName"), fallback: t("shared.eyebrow") });
  const isOwner = viewer?.id === shared.ownerId;

  return (
    <Container className="pb-12">
      <header className="grid gap-4 pt-6 pb-6 sm:pt-8 sm:pb-8">
        <div className="grid gap-2">
          <p className="inline-flex items-center gap-1.5 text-small font-medium text-primary-text">
            <SpriteIcon name="users" className="size-4" />
            {t("shared.eyebrow")}
          </p>
          <h1 className="text-h1 text-balance break-words">
            <span dir="auto">{name}</span>
          </h1>
          <p className="text-body text-muted-foreground">
            {t("saving.count", { count: cards.length, countText: formatNumber(cards.length, locale) })}
            <span aria-hidden> · </span>
            {t("shared.viewOnly")}
          </p>
        </div>
        {isOwner ? (
          <div className="flex flex-wrap items-center gap-3 rounded-card border border-primary-tint-border bg-primary-tint px-4 py-3">
            <p className="text-small text-pretty">{t("shared.yours")}</p>
            <Link href={accountListPath(shared.id)} className={buttonStyles({ variant: "secondary", className: "h-11" })}>
              {t("shared.manage")}
            </Link>
          </div>
        ) : (
          <CopySharedListButton token={token} />
        )}
      </header>

      <ListingGrid
        listings={cards}
        label={t("shared.placesLabel")}
        empty={
          <EmptyState
            icon={SearchXIcon}
            title={t("shared.emptyTitle")}
            description={t("shared.emptyBody")}
            action={{ label: t("shared.search"), href: "/search" }}
            className="rounded-card border bg-card px-6"
          />
        }
      />
    </Container>
  );
}
