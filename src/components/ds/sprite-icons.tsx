import type { SVGProps } from "react";
import { SPRITE_URL, type SpriteIconName } from "./sprite-icons.generated";

/**
 * Lucide icons for server components, drawn from one cached sprite (public/icons/sprite-….svg,
 * built by scripts/generate-icon-sprite.mjs) instead of lucide-react, whose icons are client
 * components: each one in a server component is sent as a full <svg> in the HTML plus a
 * component reference in the RSC data, and hydrates. A sprite icon is
 * <svg class="bi …"><use href="…#name"/></svg>: about a quarter of the HTML, no JavaScript.
 *
 * Same look and props as Lucide (24px, stroke 2, currentColor; size and colour classes,
 * strokeWidth, aria-*). The `bi` class (src/app/styles/bayit.css) carries Lucide's stroke style.
 * Missing an icon? Add its Lucide file name to scripts/generate-icon-sprite.mjs and run it.
 */
export type SpriteIconProps = Omit<SVGProps<SVGSVGElement>, "children" | "strokeWidth" | "name"> & {
  strokeWidth?: number | string;
};

export function SpriteIcon({ name, className, strokeWidth, style, ...props }: SpriteIconProps & { name: SpriteIconName }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      {...props}
      className={className ? `bi ${className}` : "bi"}
      style={strokeWidth === undefined ? style : { ...style, strokeWidth }}
    >
      <use href={`${SPRITE_URL}#${name}`} />
    </svg>
  );
}

/** A component with Lucide-like props for one sprite icon (for code that passes icons around). */
export function spriteIcon(name: SpriteIconName) {
  function Icon(props: SpriteIconProps) {
    return <SpriteIcon name={name} {...props} />;
  }
  Icon.displayName = `SpriteIcon(${name})`;
  return Icon;
}

export const BadgeCheckIcon = spriteIcon("badge-check");
export const BathIcon = spriteIcon("bath");
export const BedDoubleIcon = spriteIcon("bed-double");
export const BriefcaseBusinessIcon = spriteIcon("briefcase-business");
export const Building2Icon = spriteIcon("building-complex");
export const BuildingIcon = spriteIcon("building");
export const CalendarCheckIcon = spriteIcon("calendar-check");
export const CalendarDaysIcon = spriteIcon("calendar-days");
export const CheckIcon = spriteIcon("check");
export const ChevronRightIcon = spriteIcon("chevron-right");
export const FlagIcon = spriteIcon("flag");
export const FlaskConicalIcon = spriteIcon("flask-conical");
export const HandCoinsIcon = spriteIcon("hand-coins");
export const HeartHandshakeIcon = spriteIcon("heart-handshake");
export const HotelIcon = spriteIcon("hotel");
export const HouseIcon = spriteIcon("house");
export const HousePlusIcon = spriteIcon("house-plus");
export const KeyRoundIcon = spriteIcon("key-round");
export const LanguagesIcon = spriteIcon("languages");
export const MapPinIcon = spriteIcon("map-pin");
export const MapPinnedIcon = spriteIcon("map-pinned");
export const MegaphoneIcon = spriteIcon("megaphone");
export const MoonStarIcon = spriteIcon("moon-star");
export const PhoneIcon = spriteIcon("phone");
export const QuoteIcon = spriteIcon("quote");
export const RulerIcon = spriteIcon("ruler");
export const SearchIcon = spriteIcon("search");
export const SearchXIcon = spriteIcon("search-x");
export const ShieldCheckIcon = spriteIcon("shield-check");
export const SparklesIcon = spriteIcon("sparkles");
export const TrendingDownIcon = spriteIcon("trending-down");
export const UsersIcon = spriteIcon("users");
export const UtensilsCrossedIcon = spriteIcon("utensils-crossed");
export const UtensilsIcon = spriteIcon("utensils");
export const XIcon = spriteIcon("x");

/** The type of the components above (accepts Lucide-like props). */
export type SpriteIconComponent = ReturnType<typeof spriteIcon>;
