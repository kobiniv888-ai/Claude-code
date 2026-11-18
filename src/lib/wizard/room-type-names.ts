import "server-only";
import { after } from "next/server";
import { locales, siteConfig, type AppLocale } from "@/config/site";
import { isAppLocale } from "@/i18n/locale";
import { db } from "@/lib/db";
import { stripTitleEmoji } from "@/lib/text/emoji";
import { isTranslationEnabled, translateText } from "@/lib/translate";
import { LIMITS } from "./schemas";

/**
 * Room type names in five languages (round 3, founder's answer 3): the host writes the name once
 * (saveRoomType copies it into every language), and the other four are machine-translated after
 * the response, like the listing's own text (src/lib/translate). Nothing happens without a
 * translation service; a name the host changed in the meantime is never overwritten.
 */
export function scheduleRoomTypeNameTranslation(roomTypeId: string, name: string, originalLocale: string): void {
  if (!isTranslationEnabled() || !name.trim()) return;
  const source: AppLocale = isAppLocale(originalLocale) ? originalLocale : siteConfig.i18n.primaryLocale;
  const run = async () => {
    const translated: Partial<Record<AppLocale, string>> = {};
    for (const locale of locales) {
      if (locale === source) continue;
      const text = await translateText(name, source, locale);
      const clean = text ? stripTitleEmoji(text).trim().slice(0, LIMITS.roomTypeNameMax) : "";
      if (clean) translated[locale] = clean;
    }
    if (Object.keys(translated).length === 0) return;
    const room = await db.roomType.findUnique({ where: { id: roomTypeId }, select: { names: true } });
    const current = (room?.names ?? {}) as Partial<Record<AppLocale, string>>;
    if (!room || current[source] !== name) return;
    await db.roomType.update({ where: { id: roomTypeId }, data: { names: { ...current, ...translated } } });
  };
  const safe = () => run().catch((error) => console.error(`[wizard] room type name translation of ${roomTypeId} failed:`, error));
  try {
    after(safe);
  } catch {
    // Outside a request (a script): run it now, without waiting.
    void safe();
  }
}
