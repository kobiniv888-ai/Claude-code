import { useTranslations } from "next-intl";
import {
  BadgeCheckIcon,
  BriefcaseBusinessIcon,
  FlaskConicalIcon,
  MegaphoneIcon,
  MoonStarIcon,
  SparklesIcon,
  TrendingDownIcon,
  UtensilsIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { BadgeItem, BayitBadgeKind } from "./badge-items";
import {
  HebrewBubbleIcon,
  KosherStampIcon,
  ShabbatCandlesIcon,
  SynagogueIcon,
  WelcomeHomeIcon,
  type IconComponent,
} from "./jewish-icons";

/**
 * The Bayit badge system, the same everywhere (cards, listing page, filters, map popups).
 *
 *   <BayitBadge kind="welcomes" />                         // green, the most prominent
 *   <BayitBadge kind="synagogueWalk" minutes={6} />
 *   <BayitBadge kind="demo" variant="solid" />             // status tags over a photo
 *   <BadgeRow items={listingBadgeItems(listing.badges)} max={3} />   // "+2" after three
 */
export { listingBadgeItems, listingPhotoTags, type BadgeItem, type BayitBadgeKind } from "./badge-items";

type Tone = "green" | "navy" | "neutral" | "amber" | "coral";

/** Solid tags sit on photos, so they keep the same strong colors in both themes (white text, AA). */
const GREEN = "bg-(--brand-verified) text-white";
const NAVY = "bg-(--brand-primary) text-white";
const AMBER = "bg-(--brand-warning) text-white";
const WHITE = "bg-white text-(--brand-ink)";

const META: Record<BayitBadgeKind, { icon: IconComponent; tone: Tone; solid: string }> = {
  welcomes: { icon: WelcomeHomeIcon, tone: "green", solid: GREEN },
  verified: { icon: BadgeCheckIcon, tone: "green", solid: GREEN },
  hebrew: { icon: HebrewBubbleIcon, tone: "navy", solid: NAVY },
  kosherKitchen: { icon: KosherStampIcon, tone: "navy", solid: NAVY },
  kosherMeals: { icon: UtensilsIcon, tone: "navy", solid: NAVY },
  shabbatFriendly: { icon: ShabbatCandlesIcon, tone: "navy", solid: NAVY },
  synagogueWalk: { icon: SynagogueIcon, tone: "navy", solid: NAVY },
  keepsShabbat: { icon: MoonStarIcon, tone: "navy", solid: NAVY },
  business: { icon: BriefcaseBusinessIcon, tone: "neutral", solid: WHITE },
  demo: { icon: FlaskConicalIcon, tone: "amber", solid: AMBER },
  new: { icon: SparklesIcon, tone: "coral", solid: WHITE },
  priceDropped: { icon: TrendingDownIcon, tone: "green", solid: GREEN },
  promoted: { icon: MegaphoneIcon, tone: "navy", solid: NAVY },
};

const SOFT: Record<Tone, string> = {
  green: "bg-verified-soft text-verified ring-1 ring-verified/20",
  navy: "bg-navy-soft text-navy ring-1 ring-navy/10",
  neutral: "bg-muted text-muted-foreground ring-1 ring-foreground/5",
  amber: "bg-warning-soft text-warning ring-1 ring-warning/20",
  coral: "bg-coral-soft text-coral-strong ring-1 ring-coral/20",
};

const SIZE = {
  sm: "h-6 gap-1 px-2 text-xs [&_svg]:size-3.5",
  md: "h-8 gap-1.5 px-3 text-sm [&_svg]:size-4",
} as const;

export type BadgeSize = keyof typeof SIZE;
/** soft = tinted (rows); solid = filled (over photos, with a small shadow). */
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
  size = "sm",
  variant = "soft",
  as: Tag = "span",
  className,
}: BadgeItem & {
  size?: BadgeSize;
  variant?: BadgeVariant;
  /** "li" inside a BadgeRow. */
  as?: "span" | "li";
  className?: string;
}) {
  const t = useTranslations("ds.badges");
  const label = useBadgeLabel()({ kind, minutes });
  const { icon: Icon, tone, solid } = META[kind];
  const hint = kind === "welcomes" ? t("welcomesHint") : kind === "verified" ? t("verifiedHint") : undefined;
  return (
    <Tag
      data-badge={kind}
      title={hint}
      className={cn(
        "inline-flex max-w-full shrink-0 items-center rounded-full font-medium whitespace-nowrap",
        SIZE[size],
        variant === "solid" ? cn(solid, "shadow-sm") : SOFT[tone],
        kind === "welcomes" && "font-bold",
        className,
      )}
    >
      <Icon aria-hidden="true" />
      <span className="truncate">{label}</span>
    </Tag>
  );
}

/** A row of badges: the first `max`, then a "+N" chip that names the rest for screen readers. */
export function BadgeRow({
  items,
  max = 3,
  size = "sm",
  wrap = true,
  className,
}: {
  items: BadgeItem[];
  max?: number;
  size?: BadgeSize;
  /** false = one line (extra badges are counted in "+N" instead of wrapping). */
  wrap?: boolean;
  className?: string;
}) {
  const t = useTranslations("ds.badges");
  const labelOf = useBadgeLabel();
  if (items.length === 0) return null;
  const shown = items.slice(0, max);
  const rest = items.slice(max);
  const restNames = rest.map(labelOf).join(", ");
  return (
    <ul className={cn("flex min-w-0 items-center gap-1.5", wrap ? "flex-wrap" : "overflow-hidden", className)}>
      {shown.map((item) => (
        <BayitBadge key={item.kind} {...item} size={size} as="li" />
      ))}
      {rest.length > 0 && (
        <li
          title={restNames}
          className={cn(
            "inline-flex shrink-0 items-center rounded-full bg-muted font-semibold text-muted-foreground ring-1 ring-foreground/5",
            SIZE[size],
          )}
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
