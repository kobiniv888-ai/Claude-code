import type { SVGProps } from "react";
import { cn } from "@/lib/utils";

/**
 * Bayit's own icons for the Jewish features, drawn in the Lucide style (24px grid, stroke 2,
 * round caps and joins, currentColor) so they sit next to Lucide icons. Not emoji, not flags.
 *
 *   <ShabbatCandlesIcon className="size-5 text-primary" />
 *   <SynagogueIcon title="Synagogue" />   // with an accessible name; otherwise decorative
 */
export type BayitIconProps = Omit<SVGProps<SVGSVGElement>, "children"> & {
  /** Width and height (default 24). */
  size?: number | string;
  /** Accessible name. Without it the icon is decorative (aria-hidden). */
  title?: string;
};

/** Any icon component the design system accepts: a Lucide icon or one of ours. */
export type IconComponent = React.ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" | "false" }>;

function createIcon(name: string, body: React.ReactNode) {
  function BayitIcon({ size = 24, strokeWidth = 2, title, className, ...props }: BayitIconProps) {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        width={size}
        height={size}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        focusable="false"
        data-icon={name}
        className={cn("shrink-0", className)}
        {...(title ? { role: "img", "aria-label": title } : { "aria-hidden": true })}
        {...props}
      >
        {title ? <title>{title}</title> : null}
        {body}
      </svg>
    );
  }
  BayitIcon.displayName = `${name}Icon`;
  return BayitIcon;
}

/** Two Shabbat candles on a base, with flames. */
export const ShabbatCandlesIcon = createIcon(
  "ShabbatCandles",
  <>
    <path d="M8 3.2c-.9 1.1-1.4 1.9-1.4 2.6a1.4 1.4 0 0 0 2.8 0c0-.7-.5-1.5-1.4-2.6Z" />
    <path d="M16 3.2c-.9 1.1-1.4 1.9-1.4 2.6a1.4 1.4 0 0 0 2.8 0c0-.7-.5-1.5-1.4-2.6Z" />
    <rect x="6.5" y="10" width="3" height="9" rx="0.6" />
    <rect x="14.5" y="10" width="3" height="9" rx="0.6" />
    <path d="M4 21h16" />
  </>,
);

/** A synagogue: gabled front with a small Star of David, columns and an arched door. */
export const SynagogueIcon = createIcon(
  "Synagogue",
  <>
    <path d="M2.5 10.5 12 3l9.5 7.5" />
    <path d="M4.5 9v12M19.5 9v12" />
    <path d="M3 21h18" />
    <path d="M10 21v-3.5a2 2 0 0 1 4 0V21" />
    <path d="M12 6.6l1.5 2.6h-3Z" strokeWidth={1.5} />
    <path d="M12 10.3l1.5-2.6h-3Z" strokeWidth={1.5} />
    <path d="M7.5 13v2M16.5 13v2" />
  </>,
);

/** A round kosher stamp with the Hebrew letter kaf (כ). */
export const KosherStampIcon = createIcon(
  "KosherStamp",
  <>
    <circle cx="12" cy="12" r="9.5" />
    <circle cx="12" cy="12" r="6.6" strokeDasharray="1.2 2.2" strokeWidth={1.5} />
    <path d="M9.6 9h2.6a2.2 2.2 0 0 1 2.2 2.2v1.6a2.2 2.2 0 0 1-2.2 2.2H9.6" />
  </>,
);

/** A speech bubble with the Hebrew letter alef (א): "speaks Hebrew". */
export const HebrewBubbleIcon = createIcon(
  "HebrewBubble",
  <>
    <path d="M6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H11l-4.5 4v-4A2.5 2.5 0 0 1 4 13.5v-8A2.5 2.5 0 0 1 6.5 3Z" />
    <path d="M8.8 6.4 15.2 12.6" />
    <path d="M14.8 6.4v1.2a2.4 2.4 0 0 1-2.4 2.4" />
    <path d="M9.2 12.6v-1.2a2.4 2.4 0 0 1 2.4-2.4" />
  </>,
);

/** A house with a heart: "welcomes Israelis and Jews" (the Bayit pledge). */
export const WelcomeHomeIcon = createIcon(
  "WelcomeHome",
  <>
    <path d="M3 10.5 12 3l9 7.5" />
    <path d="M5 9v10.5A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5V9" />
    <path d="M12 17.6c-.6-.35-3.4-2.05-3.4-4.15a1.8 1.8 0 0 1 3.4-.85 1.8 1.8 0 0 1 3.4.85c0 2.1-2.8 3.8-3.4 4.15Z" />
  </>,
);

export const jewishIcons = {
  shabbatCandles: ShabbatCandlesIcon,
  synagogue: SynagogueIcon,
  kosherStamp: KosherStampIcon,
  hebrewBubble: HebrewBubbleIcon,
  welcomeHome: WelcomeHomeIcon,
} as const;
