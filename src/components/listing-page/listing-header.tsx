import { useLocale, useTranslations } from "next-intl";
import { SpriteIcon } from "@/components/ds/sprite-icons";
import { Tag } from "@/components/ds/tag";
import { Link } from "@/i18n/navigation";
import { visitedMonthDate } from "@/lib/listing/visited";
import { formatArea, formatDate } from "@/lib/format";
import type { Highlight, WalkHighlight } from "@/lib/listing-page/highlights";
import type { ListingPageData } from "@/lib/listing-page/types";
import { ownerPath } from "@/lib/listing/urls";
import { HIGHLIGHT_SPRITE } from "./icons";
import { HeadlinePrice } from "./headline-price";
import { RatingLine } from "@/components/reviews/rating-line";
import { ListingTitle, OriginalLanguageNote } from "./listing-text";
import { OwnerAvatar } from "./owner-avatar";

/**
 * The top of the listing: the title (22px, at most 3 lines), the main price (round 3 brief 2.3:
 * <HeadlinePrice>, for every viewer), "Area · City", and ONE line of facts
 * (guests · bedrooms · beds · baths; rooms and size for rentals and sales). Honest status tags
 * (demo, promoted) sit above the title, in grey. Real data only.
 */
export function TitleBlock({ data, tags }: { data: ListingPageData; tags: ("demo" | "promoted")[] }) {
  const t = useTranslations("listing.header");
  const f = useTranslations("listingFields.facts");
  const locale = useLocale();
  const place = [data.neighborhoodName, data.city?.name].filter(Boolean).join(" · ");
  const stay = data.dealType === "SHORT_STAY" || data.dealType === "HOTEL_ROOM";
  const beds = (data.bedsSingle ?? 0) + (data.bedsDouble ?? 0) + (data.bedsSofa ?? 0);
  const facts = [
    stay && data.maxGuests ? f("guests", { count: data.maxGuests }) : null,
    !stay && data.rooms ? f("rooms", { count: data.rooms }) : null,
    data.propertyType === "STUDIO" ? f("studio") : data.bedrooms ? f("bedrooms", { count: data.bedrooms }) : null,
    stay && beds > 0 ? f("beds", { count: beds }) : null,
    data.bathrooms ? f("bathrooms", { count: data.bathrooms }) : null,
    !stay && data.sizeSqm ? formatArea(data.sizeSqm, locale) : null,
  ].filter((fact): fact is string => !!fact);

  return (
    <header className="grid content-start gap-1.5">
      {tags.length ? (
        <div className="mb-1 flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <Tag key={tag} size="sm">
              {t(`tag.${tag}`)}
            </Tag>
          ))}
        </div>
      ) : null}
      <ListingTitle />
      <OriginalLanguageNote className="-mt-1" />
      <HeadlinePrice
        dealType={data.dealType}
        price={data.price}
        currency={data.currency}
        pricePeriod={data.pricePeriod}
        priceIsFrom={data.priceIsFrom}
        sizeSqm={data.sizeSqm}
      />
      {place ? <p className="text-body text-muted-foreground">{place}</p> : null}
      {/* Real reviews (round 3, brief 8.1): "★ 4.7 · 12 ביקורות", only from 3 visible reviews. */}
      {stay ? <RatingLine reviewCount={data.reviewCount ?? 0} ratingSum={data.ratingSum ?? 0} /> : null}
      {facts.length ? (
        // Wraps between facts (never inside one), so long Georgian or Russian words never widen the page.
        <ul className="flex flex-wrap items-center gap-x-1.5 text-small text-foreground">
          {facts.map((fact, i) => (
            <li key={fact} className="flex items-center gap-x-1.5 whitespace-nowrap">
              {i > 0 ? <span aria-hidden="true" className="text-muted-foreground">·</span> : null}
              {fact}
            </li>
          ))}
        </ul>
      ) : null}
    </header>
  );
}

/**
 * The host line under the title: avatar or initials, "Hosted by [name] · Verified" (only when an
 * ID, the ownership or the property was checked), "ביקרנו במקום · נובמבר 2026" (round 3, brief
 * 8.3: a Bayit team member visited, month only), and the pledge with a shield: the ONLY place the
 * promise appears on this page.
 */
export function HostLine({ data, verified, welcomes }: { data: ListingPageData; verified: boolean; welcomes: boolean }) {
  const t = useTranslations("listing.hostLine");
  const locale = useLocale();
  const sale = data.dealType === "SALE";
  const visited = data.visitedMonth
    ? formatDate(visitedMonthDate(data.visitedMonth), locale, { month: "long", year: "numeric", timeZone: "UTC" })
    : null;
  const name = (
    <Link href={ownerPath(data.owner.id)} dir="auto" className="rounded font-semibold underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50">
      {data.owner.name}
    </Link>
  );
  return (
    <div className="grid gap-2.5 border-y border-border py-4">
      <div className="flex items-center gap-3">
        <OwnerAvatar name={data.owner.name} image={data.owner.image} size={44} />
        <p className="min-w-0 text-body">
          {t.rich(sale ? "listedBy" : "hostedBy", { name: () => name })}
          {verified ? (
            <>
              <span aria-hidden="true" className="px-1.5 text-muted-foreground">·</span>
              <span className="inline-flex items-center gap-1 font-medium whitespace-nowrap text-success">
                <SpriteIcon name="badge-check" className="size-4" />
                {t("verified")}
              </span>
            </>
          ) : null}
        </p>
      </div>
      {visited ? (
        <p data-visited-badge="" className="flex items-center gap-2 text-small text-foreground">
          <SpriteIcon name="map-pin-check" className="size-5 shrink-0 text-success" />
          <span>
            <span className="font-medium">{t("visited")}</span>
            <span aria-hidden="true" className="px-1.5 text-muted-foreground">·</span>
            <span className="sr-only">, </span>
            <span className="whitespace-nowrap">{visited}</span>
          </span>
        </p>
      ) : null}
      {welcomes ? (
        <p className="flex items-center gap-2 text-small text-foreground">
          <SpriteIcon name="shield-check" className="size-5 shrink-0 text-primary-text" />
          {sale ? t("pledgeSale") : t("pledge")}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Three highlights with icons, computed from the listing's data (lib/listing-page/highlights).
 * Round 3 (brief 7.3): the computed walk to the sea / ski lifts comes first, as "up to N minutes"
 * (rounded up to 5; founder's answer (b)) with its source (OpenStreetMap).
 */
export function Highlights({ items, walk = null }: { items: Highlight[]; walk?: WalkHighlight | null }) {
  const t = useTranslations("listing.highlights");
  if (items.length === 0 && !walk) return null;
  return (
    <section aria-label={t("label")}>
      <ul className="grid gap-3">
        {walk ? (
          <li data-walk-highlight={walk.kind} className="flex items-center gap-3 text-body">
            <SpriteIcon name={walk.kind === "sea" ? "waves-horizontal" : "mountain-snow"} className="size-6 shrink-0 text-primary-text" />
            <span className="grid gap-0.5">
              <span>{t(walk.kind === "sea" ? "seaWalk" : "liftWalk", { count: walk.minutes })}</span>
              <span className="text-caption text-muted-foreground">{t("walkSource")}</span>
            </span>
          </li>
        ) : null}
        {items.map((key) => (
          <li key={key} className="flex items-center gap-3 text-body">
            <SpriteIcon name={HIGHLIGHT_SPRITE[key]} className="size-6 shrink-0 text-primary-text" />
            {t(key)}
          </li>
        ))}
      </ul>
    </section>
  );
}
