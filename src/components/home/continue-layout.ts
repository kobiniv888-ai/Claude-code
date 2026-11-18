/**
 * "המשך מאיפה שעצרתם" sizes, shared by the cards, their skeleton and the space reserved before the
 * page hydrates, so nothing moves when the real cards arrive.
 */

/** A compact card is ~300px on a 390px phone (the next one peeks in), 2 on tablets, 4 on desktop. */
export const RECENT_CARD_WIDTH = "basis-[80%] sm:basis-[46%] md:basis-[31.5%] lg:basis-[24%]";

/** The compact card's photo is 40% of the card, at most 160px. */
export const RECENT_CARD_SIZES = "160px";

/**
 * The card (and its skeleton): a border and the height of the usual tallest card (measured at
 * 360–1440px in all five languages: 139px for a short stay, 165px with a type label or a second
 * row of tags), so the skeleton and the cards take the same space. A hotel card ("החל מ־" and
 * "מלון" on two lines) grows the row instead of being cut off.
 */
export const RECENT_CARD_CLASS = "h-full min-h-[10.3125rem] border border-border";

export const CONTINUE_TITLE_ID = "home-continue-title";

/**
 * Shown before hydration when the page's inline hint (src/lib/home/history-hint.ts,
 * HOME_HISTORY_ATTR) says this device has history: any, a last search ("s"), recently viewed ("r").
 * Written out in full: Tailwind only builds classes it finds as plain text.
 */
export const SHOW_IF_ANY = "[html[data-home-history]_&]:block";
export const SHOW_IF_SEARCH = "[html[data-home-history~=s]_&]:block";
export const SHOW_IF_RECENT = "[html[data-home-history~=r]_&]:block";
