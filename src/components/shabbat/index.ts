/**
 * Shabbat & holiday widgets (server components). Data: @/lib/hebcal; text: messages/<locale>/shabbat.json.
 *
 * <ShabbatTimesCard city={{ name, lat, lng, timezone }} variant?="full"|"compact" hebrewDates? headingLevel? showMoreLink? />
 *   This week's candle lighting, Havdalah and parasha, in the city's own time zone (zone noted).
 *   Hebrew date when the signed-in user turned on "Show Hebrew dates" (or pass hebrewDates).
 *
 * <ShabbatTimesStrip cities?={[…]} withHeading?={true} headingLevel?="h2" />
 *   Home page section: cards side by side; defaults to siteConfig.shabbat.homeCities (Tbilisi, Batumi).
 *
 * <HolidaysInRange start="YYYY-MM-DD" end="YYYY-MM-DD" searchParams?={params} showHints? maxItems? />
 *   Holidays inside a guest's dates + "Your dates include Sukkot — filter for sukkah space" links to
 *   /search?…&jewish=sukkah_space (or pesach_ready), keeping the other params. Renders nothing without holidays.
 */
export { ShabbatTimesCard, type ShabbatTimesCardProps } from "./shabbat-times-card";
export { ShabbatTimesStrip, type ShabbatTimesStripProps } from "./shabbat-times-strip";
export { HolidaysInRange, type HolidaysInRangeProps } from "./holidays-in-range";
export type { ShabbatCityInput } from "./shared";
