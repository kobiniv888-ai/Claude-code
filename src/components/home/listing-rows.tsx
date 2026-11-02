import { MegaphoneIcon as Megaphone, SparklesIcon as Sparkles } from "@/components/ds/sprite-icons";
import { getTranslations } from "next-intl/server";
import { Container } from "@/components/common/container";
import { CardCarousel } from "@/components/ds/card-carousel";
import { EmptyState } from "@/components/ds/empty-state";
import { ListingCard } from "@/components/listing/listing-card";
import type { AppLocale } from "@/config/site";
import type { ListingCardData } from "@/lib/listing/types";
import { HomeSection } from "./home-section";

/** The shared listing card in a scroll-snap carousel (the next card peeks in on phones). */
function CardRow({ listings, label }: { listings: ListingCardData[]; label: string }) {
  return (
    <CardCarousel label={label}>
      {listings.map((listing) => (
        <ListingCard key={listing.id} listing={listing} />
      ))}
    </CardCarousel>
  );
}

/** Featured listings — paid or hand-picked, and always labeled "Promoted". Hidden when there are none. */
export async function FeaturedListings({ locale, listings }: { locale: AppLocale; listings: ListingCardData[] }) {
  if (listings.length === 0) return null;
  const t = await getTranslations({ locale, namespace: "home.featured" });
  return (
    <HomeSection
      id="home-featured-title"
      eyebrow={
        <p className="mb-1 inline-flex items-center gap-1.5 text-small font-semibold text-coral-strong">
          <Megaphone className="size-4" aria-hidden="true" />
          {t("eyebrow")}
        </p>
      }
      title={t("title")}
      subtitle={t("lead")}
      href="/search"
      linkLabel={t("all")}
      bleed
    >
      <CardRow listings={listings} label={t("title")} />
    </HomeSection>
  );
}

/** "New homes": the newest live listings, or an invitation to be the first. */
export async function NewestListings({ locale, listings }: { locale: AppLocale; listings: ListingCardData[] }) {
  const t = await getTranslations({ locale, namespace: "home.newest" });
  if (listings.length === 0) {
    return (
      <section aria-labelledby="home-newest-title" className="py-[calc(var(--section-space)*0.55)]">
        <Container>
          <h2 id="home-newest-title" className="sr-only">
            {t("title")}
          </h2>
          <EmptyState icon={Sparkles} title={t("emptyTitle")} description={t("emptyText")} action={{ label: t("emptyAction"), href: "/post" }} />
        </Container>
      </section>
    );
  }
  return (
    <HomeSection
      id="home-newest-title"
      title={t("title")}
      subtitle={t("lead")}
      href="/search?sort=newest"
      linkLabel={t("all")}
      bleed
    >
      <CardRow listings={listings} label={t("title")} />
    </HomeSection>
  );
}
