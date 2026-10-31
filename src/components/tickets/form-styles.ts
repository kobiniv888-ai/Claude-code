/** Larger, touch-friendly fields for the support forms (44px+ targets, 16px text on phones). */
export const inputClass = "h-11 rounded-xl bg-card px-3.5 text-base md:text-base";
export const textareaClass = "min-h-40 rounded-xl bg-card px-3.5 py-3 text-base leading-relaxed md:text-base";

/**
 * Character counters ("120 / 5000") skip digit grouping: Node and browsers ship different
 * grouping rules for some languages (Georgian), which would break hydration.
 */
export const NO_GROUPING = { useGrouping: false } as const;
