import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import type { BadgeItem, BayitBadgeKind } from "./badge-items";
import { tagStyles } from "./tag";

/**
 * The Bayit badge system (round 2): small grey text tags, the same everywhere (cards, listing
 * page, filters, map popups). No icons and no colors: "verified" is the only green one and "new"
 * the only purple one. A row shows at most two, then "+N".
 *
 *   <BayitBadge kind="kosherKitchen" />
 *   <BayitBadge kind="synagogueWalk" minutes={6} />
 *   <BayitBadge kind="demo" variant="solid" />             // on a photo
 *   <BadgeRow items={listingBadgeItems(listing.badges)} />   // two, then "+N"
 */
export { listingBadgeItems, listingPhotoTags, type BadgeItem, type BayitBadgeKind } from "./badge-items";

const TAG_VARIANT: Partial<Record<BayitBadgeKind, "primary" | "success">> = {
  verified: "success",
  new: "primary",
};

const SIZE = {
  sm: "sm",
  md: "md",
} as const;

export type BadgeSize = keyof typeof SIZE;
/** soft = on a card; solid = on a photo (the same quiet tag, fully opaque). */
export type BadgeVariant = "soft" | "solid";

/** The translated text of a badge (also used for "+N" lists). */
export function useBadgeLabel() {
  const t = useTranslations("ds.badges");
  return (item: BadgeItem) =>
    item.kind === "synagogueWalk" ? t("synagogueWalk", { minutes: item.minutes ?? 0 }) : t(item.kind);
}

export function BayitBadge({
  kind,
  minutes,
  size = "md",
  as: Tag = "span",
  className,
}: BadgeItem & {
  size?: BadgeSize;
  /** Accepted for older callers; both variants draw the same quiet tag now. */
  variant?: BadgeVariant;
  /** "li" inside a BadgeRow. */
  as?: "span" | "li";
  className?: string;
}) {
  const t = useTranslations("ds.badges");
  const label = useBadgeLabel()({ kind, minutes });
  const hint = kind === "welcomes" ? t("welcomesHint") : kind === "verified" ? t("verifiedHint") : undefined;
  return (
    <Tag
      data-badge={kind}
      title={hint}
      className={cn(tagStyles({ variant: TAG_VARIANT[kind] ?? "neutral", size: SIZE[size] }), className)}
    >
      <span className="truncate">{label}</span>
    </Tag>
  );
}

/** A row of badges: the first `max`, then a "+N" chip that names the rest for screen readers. */
export function BadgeRow({
  items,
  max = 2,
  size = "md",
  wrap = true,
  className,
}: {
  items: BadgeItem[];
  /** At most 2 (round 2: never more than two small tags). */
  max?: number;
  size?: BadgeSize;
  /** false = one line (extra badges are counted in "+N" instead of wrapping). */
  wrap?: boolean;
  className?: string;
}) {
  const t = useTranslations("ds.badges");
  const labelOf = useBadgeLabel();
  if (items.length === 0) return null;
  // Never more than two tags in a row (round 2), whatever the caller asks for.
  const limit = Math.min(max, 2);
  const shown = items.slice(0, limit);
  const rest = items.slice(limit);
  const restNames = rest.map(labelOf).join(", ");
  return (
    <ul className={cn("flex min-w-0 items-center gap-1", wrap ? "flex-wrap" : "overflow-hidden", className)}>
      {shown.map((item) => (
        <BayitBadge key={item.kind} {...item} size={size} as="li" />
      ))}
      {rest.length > 0 && (
        <li
          title={restNames}
          className={tagStyles({ variant: "neutral", size: SIZE[size] })}
        >
          <span aria-hidden="true" dir="ltr">
            {t("more", { count: rest.length })}
          </span>
          <span className="sr-only">{t("moreLabel", { count: rest.length, list: restNames })}</span>
        </li>
      )}
    </ul>
  );
}
