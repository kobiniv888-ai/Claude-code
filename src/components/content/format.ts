import { formatDate } from "@/lib/format";

/** Long date ("31 October 2026") with Western digits in every language, via @/lib/format. */
export function formatContentDate(value: Date | string, locale: string): string {
  return formatDate(value, locale, { dateStyle: "long" });
}

/** yyyy-mm-dd for <time dateTime>. */
export function isoDate(value: Date | string): string {
  return typeof value === "string" ? value.slice(0, 10) : value.toISOString().slice(0, 10);
}
