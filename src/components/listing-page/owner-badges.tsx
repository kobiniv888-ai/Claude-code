import { useTranslations } from "next-intl";
import {
  BadgeCheckIcon,
  BriefcaseBusinessIcon,
  FlaskConicalIcon,
  HomeIcon,
  IdCardIcon,
  MoonStarIcon,
  PhoneIcon,
  type LucideIcon,
} from "lucide-react";
import type { OwnerBadges as OwnerBadgeFlags } from "@/lib/listing-page/types";
import { cn } from "@/lib/utils";

type Kind = "phoneVerified" | "idVerified" | "ownerVerified" | "propertyVerified" | "businessVerified" | "business" | "keepsShabbat" | "demo";

const ICONS: Record<Kind, LucideIcon> = {
  phoneVerified: PhoneIcon,
  idVerified: IdCardIcon,
  ownerVerified: BadgeCheckIcon,
  propertyVerified: HomeIcon,
  businessVerified: BadgeCheckIcon,
  business: BriefcaseBusinessIcon,
  keepsShabbat: MoonStarIcon,
  demo: FlaskConicalIcon,
};

const TONE: Record<Kind, string> = {
  phoneVerified: "bg-primary-tint text-success ring-success/20",
  idVerified: "bg-primary-tint text-success ring-success/20",
  ownerVerified: "bg-primary-tint text-success ring-success/20",
  propertyVerified: "bg-primary-tint text-success ring-success/20",
  businessVerified: "bg-primary-tint text-success ring-success/20",
  business: "bg-muted text-muted-foreground ring-foreground/5",
  keepsShabbat: "bg-secondary text-primary ring-primary/10",
  demo: "bg-surface-muted text-foreground ring-border-strong/20",
};

/** Trust badges of an owner (and, on a listing, "Owner verified" / "Property verified"). */
export function OwnerBadges({
  badges,
  ownerVerified = false,
  propertyVerified = false,
  className,
}: {
  badges: OwnerBadgeFlags;
  ownerVerified?: boolean;
  propertyVerified?: boolean;
  className?: string;
}) {
  const t = useTranslations("listing.badges");
  const kinds: Kind[] = [];
  if (badges.phoneVerified) kinds.push("phoneVerified");
  if (badges.idVerified) kinds.push("idVerified");
  if (ownerVerified) kinds.push("ownerVerified");
  if (propertyVerified) kinds.push("propertyVerified");
  if (badges.businessVerified) kinds.push("businessVerified");
  else if (badges.business) kinds.push("business");
  if (badges.keepsShabbat) kinds.push("keepsShabbat");
  if (badges.demo) kinds.push("demo");
  if (kinds.length === 0) return null;
  return (
    <ul className={cn("flex flex-wrap gap-1.5", className)} aria-label={t("label")}>
      {kinds.map((kind) => {
        const Icon = ICONS[kind];
        return (
          <li
            key={kind}
            title={t.has(`hints.${kind}`) ? t(`hints.${kind}`) : undefined}
            className={cn("inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium ring-1", TONE[kind])}
          >
            <Icon className="size-3.5" aria-hidden />
            {t(kind)}
          </li>
        );
      })}
    </ul>
  );
}
