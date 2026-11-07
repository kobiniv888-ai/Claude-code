/**
 * views-1 (round 3, phase 4 hardening): a listing's view count can't be pumped up by sending a new
 * user agent on every call, or by rotating IPv6 addresses inside one /64. Each network (an IPv4
 * address, or an IPv6 /64) adds at most VIEWS_PER_NETWORK_PER_DAY new visitors to one listing a
 * day. Pure rules, then the real recordListingView against the local database (DATABASE_URL in
 * .env) with a stand-in request. Creates its own user, city and listing and removes them.
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const request = vi.hoisted(() => ({ ip: "198.51.100.7" as string | null, userAgent: "Mozilla/5.0 (X11; Linux x86_64) Firefox/140.0" }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/request", () => ({
  getClientIp: async () => request.ip,
  getUserAgent: async () => request.userAgent,
  getDeviceHash: async () => null,
  getIpHash: async () => (request.ip ? `ip-${request.ip}` : null),
}));

const { db } = await import("@/lib/db");
const { recordListingView } = await import("@/lib/listing/stats");
const { dailyNetworkId, ipNetwork, VIEWS_PER_NETWORK_PER_DAY } = await import("@/lib/listing/stats-rules");

describe("the network of an address", () => {
  it("is the IPv4 address itself, or the /64 of an IPv6 address in any spelling", () => {
    expect(ipNetwork("203.0.113.5")).toBe("203.0.113.5");
    expect(ipNetwork("2001:db8:1:2::1")).toBe("2001:db8:1:2::/64");
    expect(ipNetwork("2001:0db8:0001:0002:0000:0000:0000:0001")).toBe("2001:db8:1:2::/64");
    expect(ipNetwork("2001:DB8:1:2:ffff:ffff:ffff:ffff")).toBe("2001:db8:1:2::/64");
    expect(ipNetwork("2001:db8:1:3::1")).toBe("2001:db8:1:3::/64");
    // IPv4-mapped IPv6 is the IPv4 address.
    expect(ipNetwork("::ffff:203.0.113.5")).toBe("203.0.113.5");
    expect(ipNetwork("::ffff:cb00:7105")).toBe("203.0.113.5");
    expect(ipNetwork(null)).toBe("unknown");
  });

  it("gives the same daily ID to two addresses of one /64, another to the next /64", () => {
    expect(dailyNetworkId("s", "2001:db8:1:2::1")).toBe(dailyNetworkId("s", "2001:db8:1:2:aaaa::9"));
    expect(dailyNetworkId("s", "2001:db8:1:2::1")).not.toBe(dailyNetworkId("s", "2001:db8:1:3::1"));
    expect(dailyNetworkId("s", "203.0.113.5")).not.toBe(dailyNetworkId("s2", "203.0.113.5"));
  });
});

const prefix = `vnc${randomUUID().replace(/-/g, "").slice(0, 10)}`;
const ids = { user: `${prefix}-host`, city: "", listing: "" };

beforeAll(async () => {
  await db.user.create({
    data: { id: ids.user, name: "Host", email: `${ids.user}@example.com`, phoneNumber: `+99559${`${Date.now() % 10_000_000}`.padStart(7, "0")}`, phoneNumberVerified: true, locale: "en" },
  });
  const city = await db.city.create({
    data: { slug: `${prefix}-city`, names: { he: "עיר", en: "City", ru: "Город", ar: "مدينة", ka: "ქალაქი" }, searchText: "city", lat: 41.7, lng: 44.8 },
  });
  ids.city = city.id;
  const listing = await db.listing.create({
    data: {
      ownerId: ids.user,
      status: "LIVE",
      dealType: "SHORT_STAY",
      propertyType: "APARTMENT",
      pricePeriod: "NIGHT",
      price: 50,
      currency: "GEL",
      cityId: city.id,
      lat: 41.7,
      lng: 44.8,
      originalLocale: "en",
      title: "View cap test flat",
      description: "A test listing.",
    },
  });
  ids.listing = listing.id;
});

afterAll(async () => {
  await db.rateLimit.deleteMany({ where: { key: { contains: ids.listing } } });
  if (ids.listing) await db.listing.delete({ where: { id: ids.listing } });
  await db.user.deleteMany({ where: { id: ids.user } });
  await db.city.deleteMany({ where: { id: ids.city } });
});

const views = async () => (await db.listing.findUniqueOrThrow({ where: { id: ids.listing }, select: { viewCount: true } })).viewCount;

describe("views per network", () => {
  it("counts a new user agent from one address at most the network's daily share", async () => {
    request.ip = "198.51.100.7";
    let counted = 0;
    for (let i = 0; i < 30; i++) {
      request.userAgent = `Mozilla/5.0 (X11; Linux x86_64) Firefox/140.0 x${i}`;
      if (await recordListingView(ids.listing, null)) counted++;
    }
    expect(counted).toBe(VIEWS_PER_NETWORK_PER_DAY);
    expect(await views()).toBe(VIEWS_PER_NETWORK_PER_DAY);
  });

  it("shares the share between the addresses of one IPv6 /64, but not with another /64", async () => {
    const before = await views();
    let counted = 0;
    for (let i = 0; i < 25; i++) {
      request.ip = `2001:db8:77:1::${(i + 1).toString(16)}`;
      request.userAgent = `Mozilla/5.0 (iPhone) Safari/604.1 v${i}`;
      if (await recordListingView(ids.listing, null)) counted++;
    }
    expect(counted).toBe(VIEWS_PER_NETWORK_PER_DAY);
    request.ip = "2001:db8:77:2::1";
    expect(await recordListingView(ids.listing, null)).toBe(true);
    expect(await views()).toBe(before + VIEWS_PER_NETWORK_PER_DAY + 1);
  });
});
