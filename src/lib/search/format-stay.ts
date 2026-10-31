import { formatDate } from "@/lib/format";

/**
 * "Sep 24 – Oct 2" for a stay (client-safe). Built from two formatDate calls instead of
 * Intl's formatRange, whose separator differs between Node's and the browser's ICU data and
 * would break hydration of server-rendered client components.
 */
export function formatStay(checkIn: string, checkOut: string, locale: string): string {
  const options = { day: "numeric", month: "short" } as const;
  return `${formatDate(checkIn, locale, options)} – ${formatDate(checkOut, locale, options)}`;
}
