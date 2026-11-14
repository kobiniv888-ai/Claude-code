import { useTranslations } from "next-intl";
import { BadgeCheckIcon, BriefcaseBusinessIcon, FlaskConicalIcon, MegaphoneIcon, SparklesIcon, TrendingDownIcon, type SpriteIconComponent as LucideIcon } from "@/components/ds/sprite-icons";
import { KosherStampIcon, ShabbatCandlesIcon, SynagogueIcon, type IconComponent } from "@/components/ds/jewish-icons";
import type { ListingCardBadges } from "@/lib/listing/types";
import { publicWalkMinutes } from "@/lib/geo/public-walk";
import { cn } from "@/lib/utils";

/**
 * Trust and Jewish-friendly badges of the listing page (the card uses the design-system
 * BadgeRow from "@/components/ds"). Same colors and icons as the Bayit badge system.
 *
 *   <ListingBadges badges={listing.badges} />                       // all that apply
 *   <ListingBadges badges={listing.badges} kinds={["synagogue"]} />  // only some
 */

export type BadgeSize = "sm" | "md";

const chip: Record<BadgeSize, string> = {
  sm: "h-6 gap-1 rounded-full px-2 text-xs [&_svg]:size-3.5",
  md: "h-8 gap-1.5 rounded-full px-3 text-sm [&_svg]:size-4",
};

const tones = {
  verified: "bg-primary-tint text-success ring-1 ring-success/20",
  jewish: "bg-primary-tint text-primary-text ring-1 ring-primary/10",
  neutral: "bg-muted text-muted-foreground ring-1 ring-foreground/5",
} as const;

function Chip({
  icon: Icon,
  tone,
  size,
  title,
  children,
}: {
  icon: IconComponent;
  tone: keyof typeof tones;
  size: BadgeSize;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <li className={cn("inline-flex shrink-0 items-center font-medium whitespace-nowrap", chip[size], tones[tone])} title={title}>
      <Icon aria-hidden="true" />
      <span>{children}</span>
    </li>
  );
}

/** Green "Verified" badge (owner ID or ownership checked). */
export function VerifiedBadge({ size = "sm", className }: { size?: BadgeSize; className?: string }) {
  const t = useTranslations("listingCard.badges");
  return (
    <span
      className={cn("inline-flex items-center font-medium whitespace-nowrap", chip[size], tones.verified, className)}
      title={t("verifiedHint")}
    >
      <BadgeCheckIcon aria-hidden="true" />
      <span>{t("verified")}</span>
    </span>
  );
}

/** Small "Business" label. */
export function BusinessLabel({ size = "sm", className }: { size?: BadgeSize; className?: string }) {
  const t = useTranslations("listingCard.badges");
  return (
    <span className={cn("inline-flex items-center font-medium whitespace-nowrap", chip[size], tones.neutral, className)}>
      <BriefcaseBusinessIcon aria-hidden="true" />
      <span>{t("business")}</span>
    </span>
  );
}

export type BadgeKind = "verified" | "synagogue" | "kosher" | "shabbat" | "business";
const ALL_KINDS: readonly BadgeKind[] = ["verified", "synagogue", "kosher", "shabbat", "business"];

export function ListingBadges({
  badges,
  kinds = ALL_KINDS,
  size = "sm",
  className,
}: {
  badges: Pick<ListingCardBadges, "verified" | "business" | "shabbatFriendly" | "kosherKitchen" | "synagogueWalkMin">;
  kinds?: readonly BadgeKind[];
  size?: BadgeSize;
  className?: string;
}) {
  const t = useTranslations("listingCard.badges");
  const items: React.ReactNode[] = [];
  for (const kind of kinds) {
    if (kind === "verified" && badges.verified) {
      items.push(
        <Chip key={kind} icon={BadgeCheckIcon} tone="verified" size={size} title={t("verifiedHint")}>
          {t("verified")}
        </Chip>,
      );
    } else if (kind === "synagogue" && badges.synagogueWalkMin !== null) {
      items.push(
        <Chip key={kind} icon={SynagogueIcon} tone="jewish" size={size}>
          {t("synagogueWalk", { count: publicWalkMinutes(badges.synagogueWalkMin) ?? 0 })}
        </Chip>,
      );
    } else if (kind === "kosher" && badges.kosherKitchen) {
      items.push(
        <Chip key={kind} icon={KosherStampIcon} tone="jewish" size={size}>
          {t("kosherKitchen")}
        </Chip>,
      );
    } else if (kind === "shabbat" && badges.shabbatFriendly) {
      items.push(
        <Chip key={kind} icon={ShabbatCandlesIcon} tone="jewish" size={size}>
          {t("shabbatFriendly")}
        </Chip>,
      );
    } else if (kind === "business" && badges.business) {
      items.push(
        <Chip key={kind} icon={BriefcaseBusinessIcon} tone="neutral" size={size}>
          {t("business")}
        </Chip>,
      );
    }
  }
  if (items.length === 0) return null;
  return <ul className={cn("flex flex-wrap gap-1.5", className)}>{items}</ul>;
}

/** "New" / "Price dropped" / "Promoted" / "Demo" labels over the cover photo. */
export function ListingLabels({
  badges,
  className,
}: {
  badges: Pick<ListingCardBadges, "isNew" | "priceDropped" | "promoted" | "demo">;
  className?: string;
}) {
  const t = useTranslations("listingCard.labels");
  const labels: { key: string; icon: LucideIcon; text: string; className: string }[] = [];
  if (badges.promoted) labels.push({ key: "promoted", icon: MegaphoneIcon, text: t("promoted"), className: "bg-primary text-primary-foreground" });
  if (badges.priceDropped) labels.push({ key: "drop", icon: TrendingDownIcon, text: t("priceDropped"), className: "bg-primary text-primary-foreground" });
  if (badges.isNew) labels.push({ key: "new", icon: SparklesIcon, text: t("new"), className: "bg-card text-foreground ring-1 ring-foreground/10" });
  if (badges.demo) labels.push({ key: "demo", icon: FlaskConicalIcon, text: t("demo"), className: "bg-surface-muted text-foreground" });
  if (labels.length === 0) return null;
  return (
    <ul className={cn("flex flex-wrap gap-1.5", className)}>
      {labels.map(({ key, icon: Icon, text, className: tone }) => (
        <li
          key={key}
          className={cn(
            "inline-flex h-6 items-center gap-1 rounded-full px-2 text-xs font-semibold shadow-sm [&_svg]:size-3.5",
            tone,
          )}
        >
          <Icon aria-hidden="true" />
          {text}
        </li>
      ))}
    </ul>
  );
}
