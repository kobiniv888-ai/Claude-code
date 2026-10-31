import "server-only";
import type { ContactChannel } from "@/generated/prisma/enums";
import { pickLocalized } from "@/i18n/locale";
import { db } from "@/lib/db";
import { CONTACT_CHANNELS } from "@/lib/listing/fields";

/** Numbers for the admin overview (server-only). */

const DAY_MS = 24 * 3600 * 1000;

export type OverviewStats = {
  newUsers7: number;
  newUsers30: number;
  newListings7: number;
  newListings30: number;
  liveListings: number;
  contactClicks30: number;
  clicksByChannel: { channel: ContactChannel; count: number }[];
  topCitiesByListings: { cityId: string; name: string; count: number }[];
  topCitiesByClicks: { cityId: string; name: string; count: number }[];
};

export async function getOverviewStats(locale: string, now: Date = new Date()): Promise<OverviewStats> {
  const d7 = new Date(now.getTime() - 7 * DAY_MS);
  const d30 = new Date(now.getTime() - 30 * DAY_MS);

  const [newUsers7, newUsers30, newListings7, newListings30, liveListings, byChannel, byCity, clicksByCity] =
    await Promise.all([
      db.user.count({ where: { createdAt: { gte: d7 }, status: { not: "DELETED" } } }),
      db.user.count({ where: { createdAt: { gte: d30 }, status: { not: "DELETED" } } }),
      db.listing.count({ where: { publishedAt: { gte: d7 } } }),
      db.listing.count({ where: { publishedAt: { gte: d30 } } }),
      db.listing.count({ where: { status: "LIVE" } }),
      db.contactClick.groupBy({ by: ["channel"], where: { createdAt: { gte: d30 } }, _count: { _all: true } }),
      db.listing.groupBy({
        by: ["cityId"],
        where: { status: "LIVE", cityId: { not: null } },
        _count: { _all: true },
        orderBy: { _count: { cityId: "desc" } },
        take: 6,
      }),
      db.$queryRaw<{ cityId: string; count: number }[]>`
        SELECT l."cityId" AS "cityId", COUNT(*)::int AS "count"
        FROM "ContactClick" c
        JOIN "Listing" l ON l."id" = c."listingId"
        WHERE c."createdAt" >= ${d30} AND l."cityId" IS NOT NULL
        GROUP BY l."cityId"
        ORDER BY "count" DESC
        LIMIT 6`,
    ]);

  const cityIds = [...new Set([...byCity.map((c) => c.cityId), ...clicksByCity.map((c) => c.cityId)])].filter(
    (id): id is string => !!id,
  );
  const cities = cityIds.length
    ? await db.city.findMany({ where: { id: { in: cityIds } }, select: { id: true, names: true, slug: true } })
    : [];
  const nameOf = (id: string) => {
    const city = cities.find((c) => c.id === id);
    return city ? pickLocalized(city.names, locale) || city.slug : id;
  };

  const counts = new Map(byChannel.map((row) => [row.channel, row._count._all]));
  const clicksByChannel = CONTACT_CHANNELS.map((channel) => ({ channel, count: counts.get(channel) ?? 0 }));

  return {
    newUsers7,
    newUsers30,
    newListings7,
    newListings30,
    liveListings,
    contactClicks30: clicksByChannel.reduce((sum, c) => sum + c.count, 0),
    clicksByChannel,
    topCitiesByListings: byCity
      .filter((c): c is typeof c & { cityId: string } => !!c.cityId)
      .map((c) => ({ cityId: c.cityId, name: nameOf(c.cityId), count: c._count._all })),
    topCitiesByClicks: clicksByCity.map((c) => ({ cityId: c.cityId, name: nameOf(c.cityId), count: Number(c.count) })),
  };
}
