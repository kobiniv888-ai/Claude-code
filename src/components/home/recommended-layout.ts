/**
 * "מקומות מומלצים" layout, shared by the server-rendered first tab and the tabs loaded in the
 * browser, so a tab switch never changes the row's size.
 */

/** ~250px cards on a 390px phone (the next one peeks in), 2.5 on tablets, 4 on desktop. */
export const RECOMMENDED_CARD_WIDTH = "basis-[66%] sm:basis-[40%] md:basis-[31%] lg:basis-[23.6%]";

/** The photo widths those cards get (the row's width minus its gutters), for next/image. */
export const RECOMMENDED_CARD_SIZES =
  "(min-width: 1280px) 288px, (min-width: 1024px) 23vw, (min-width: 768px) 30vw, (min-width: 640px) 37vw, 62vw";

export const RECOMMENDED_TITLE_ID = "home-recommended-title";
