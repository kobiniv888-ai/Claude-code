import { Megaphone, Sparkles } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Container } from "@/components/common/container";
import { SectionHeading } from "@/components/common/section-heading";
import { EmptyState } from "@/components/common/states";
import { ListingCard } from "@/components/listing/listing-card";
import type { AppLocale } from "@/config/site";
import type { ListingCardData } from "@/lib/listing/types";

/** Cards in a swipeable row on phones and a grid from the lg breakpoint. */
function CardRow({ listings, label }: { listings: ListingCardData[]; label: string }) {
  return (
    <ul
      aria-label={label}
      className="-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-4 overflow-x-auto px-4 pb-2 [scrollbar-width:none] sm:grid sm:grid-cols-2 sm:overflow-visible lg:grid-cols-4 [&::-webkit-scrollbar]:hidden"
    >
      {listings.map((listing, index) => (
        <li key={listing.id} className="w-[82%] max-w-80 shrink-0 snap-start sm:w-auto sm:max-w-none">
          <ListingCard listing={listing} priority={index < 2} />
        </li>
      ))}
    </ul>
  );
}

/** Featured listings — paid or hand-picked, and always labeled "Promoted". Hidden when there are none. */
export async function FeaturedListings({ locale, listings }: { locale: AppLocale; listings: ListingCardData[] }) {
  if (listings.length === 0) return null;
  const t = await getTranslations({ locale, namespace: "home.featured" });
  return (
    <section aria-labelledby="home-featured-title" className="py-10 sm:py-14">
      <Container>
        <SectionHeading
          id="home-featured-title"
          eyebrow={
            <span className="inline-flex items-center gap-1.5">
              <Megaphone className="size-4" aria-hidden="true" />
              {t("eyebrow")}
            </span>
          }
          title={t("title")}
          description={t("lead")}
          action={{ label: t("all"), href: "/search" }}
        />
        <CardRow listings={listings} label={t("title")} />
      </Container>
    </section>
  );
}

/** The newest live listings, or an invitation to be the first. */
export async function NewestListings({ locale, listings }: { locale: AppLocale; listings: ListingCardData[] }) {
  const t = await getTranslations({ locale, namespace: "home.newest" });
  return (
    <section aria-labelledby="home-newest-title" className="py-10 sm:py-14">
      <Container>
        <SectionHeading
          id="home-newest-title"
          title={t("title")}
          description={t("lead")}
          action={listings.length > 0 ? { label: t("all"), href: "/search?sort=newest" } : undefined}
        />
        {listings.length > 0 ? (
          <CardRow listings={listings} label={t("title")} />
        ) : (
          <EmptyState
            icon={Sparkles}
            bordered
            title={t("emptyTitle")}
            description={t("emptyText")}
            action={{ label: t("emptyAction"), href: "/post" }}
          />
        )}
      </Container>
    </section>
  );
}
