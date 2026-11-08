/**
 * SECURITY_REPORT 4.7.b (D3) against the local database: a host can replace a calendar export
 * link. The new link has a fresh 256-bit token (newIcalToken), the OLD link answers 404 from then
 * on, the new one serves the feed; it works for a hotel room type's own link too; only the owner
 * can do it (another account gets "not found" and nothing changes); it is rate-limited and
 * recorded in the security log (no token in it).
 *
 * Creates its own users (fake @example.com addresses), city and listings, and removes them
 * afterwards. The session is replaced; the real action, its rate limit and the real route run.
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  user: null as null | { id: string },
  events: [] as { type: string; userId?: string | null; meta?: Record<string, unknown> | null }[],
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/session", async () => {
  const { AuthRequiredError } = await import("@/lib/errors");
  return {
    requireUserForAction: async () => {
      if (!state.user) throw new AuthRequiredError();
      return state.user;
    },
  };
});
vi.mock("@/lib/security/events", () => ({
  recordSecurityEvent: async (event: (typeof state.events)[number]) => {
    state.events.push(event);
    return true;
  },
}));
vi.mock("@/lib/rate-limit", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/rate-limit")>();
  // The public feed's per-IP limit needs a request; the host action's own limit stays real.
  return { ...real, rateLimitByIp: async () => ({ ok: true, remaining: 100, resetAt: new Date() }) };
});

const { db } = await import("@/lib/db");
const { replaceCalendarLinkAction } = await import("@/lib/booking/host-actions");
const { isStrongIcalToken, newIcalToken } = await import("@/lib/listing/ical-token");
const feed = await import("@/app/api/ical/[token]/route");

const prefix = `ics${randomUUID().replace(/-/g, "").slice(0, 10)}`;
const ids = { host: `${prefix}-host`, other: `${prefix}-other`, city: "", flat: "", hotel: "", room: "" };

const getFeed = (token: string) => feed.GET(new Request(`http://localhost/api/ical/${token}.ics`), { params: Promise.resolve({ token: `${token}.ics` }) });
const tokenOf = (url: string) => decodeURIComponent(new URL(url).pathname.split("/").pop() ?? "").replace(/\.ics$/, "");

beforeAll(async () => {
  for (const id of [ids.host, ids.other]) await db.user.create({ data: { id, name: id, email: `${id}@example.com` } });
  const city = await db.city.create({ data: { slug: `${prefix}-city`, names: { he: "עיר", en: "City", ru: "Город", ar: "مدينة", ka: "ქალაქი" }, searchText: "city", lat: 41.7, lng: 44.8 } });
  ids.city = city.id;
  const flat = await db.listing.create({ data: { ownerId: ids.host, status: "LIVE", dealType: "SHORT_STAY", cityId: ids.city, title: `${prefix} flat`, icalToken: newIcalToken() } });
  ids.flat = flat.id;
  const hotel = await db.listing.create({ data: { ownerId: ids.host, status: "LIVE", dealType: "HOTEL_ROOM", cityId: ids.city, title: `${prefix} hotel`, icalToken: newIcalToken() } });
  ids.hotel = hotel.id;
  const room = await db.roomType.create({
    data: { listingId: ids.hotel, names: { he: "חדר", en: "Room", ru: "Номер", ar: "غرفة", ka: "ოთახი" }, price: 80, quantity: 2, icalToken: newIcalToken() },
  });
  ids.room = room.id;
});

afterAll(async () => {
  await db.listing.deleteMany({ where: { id: { in: [ids.flat, ids.hotel] } } });
  await db.rateLimit.deleteMany({ where: { key: { contains: prefix } } });
  await db.user.deleteMany({ where: { id: { in: [ids.host, ids.other] } } });
  await db.city.deleteMany({ where: { id: ids.city } });
});

describe("replace the calendar export link (4.7.b)", () => {
  it("the old link answers 404, the new one serves the feed", async () => {
    const before = (await db.listing.findUniqueOrThrow({ where: { id: ids.flat }, select: { icalToken: true } })).icalToken;
    expect((await getFeed(before)).status).toBe(200);

    state.user = { id: ids.host };
    state.events = [];
    const result = await replaceCalendarLinkAction({ listingId: ids.flat });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const token = tokenOf(result.data.exportUrl);
    expect(isStrongIcalToken(token)).toBe(true);
    expect(token).not.toBe(before);
    expect((await db.listing.findUniqueOrThrow({ where: { id: ids.flat }, select: { icalToken: true } })).icalToken).toBe(token);

    expect((await getFeed(before)).status).toBe(404);
    const fresh = await getFeed(token);
    expect(fresh.status).toBe(200);
    expect(await fresh.text()).toContain("BEGIN:VCALENDAR");
    // Recorded without the token or the link.
    expect(state.events).toEqual([{ type: "calendar_link_replaced", userId: ids.host, meta: { roomType: false } }]);
    expect(JSON.stringify(state.events)).not.toContain(token);
  });

  it("a hotel room type's own link is replaced the same way", async () => {
    const before = (await db.roomType.findUniqueOrThrow({ where: { id: ids.room }, select: { icalToken: true } })).icalToken!;
    expect((await getFeed(before)).status).toBe(200);
    state.user = { id: ids.host };
    const result = await replaceCalendarLinkAction({ listingId: ids.hotel, roomTypeId: ids.room });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const token = tokenOf(result.data.exportUrl);
    expect(isStrongIcalToken(token)).toBe(true);
    expect((await getFeed(before)).status).toBe(404);
    expect((await getFeed(token)).status).toBe(200);
    // The hotel's own link did not change.
    const hotelToken = (await db.listing.findUniqueOrThrow({ where: { id: ids.hotel }, select: { icalToken: true } })).icalToken;
    expect((await getFeed(hotelToken)).status).toBe(200);
  });

  it("only the owner: another account gets 'not found' and nothing changes; signed out is refused", async () => {
    const before = (await db.listing.findUniqueOrThrow({ where: { id: ids.flat }, select: { icalToken: true } })).icalToken;
    state.user = { id: ids.other };
    expect(await replaceCalendarLinkAction({ listingId: ids.flat })).toMatchObject({ ok: false, error: "not_found" });
    expect(await replaceCalendarLinkAction({ listingId: ids.hotel, roomTypeId: ids.room })).toMatchObject({ ok: false, error: "not_found" });
    // A room type of another listing of the same owner is not this listing's.
    state.user = { id: ids.host };
    expect(await replaceCalendarLinkAction({ listingId: ids.flat, roomTypeId: ids.room })).toMatchObject({ ok: false, error: "not_found" });
    state.user = null;
    expect(await replaceCalendarLinkAction({ listingId: ids.flat })).toMatchObject({ ok: false, error: "auth_required" });
    expect((await db.listing.findUniqueOrThrow({ where: { id: ids.flat }, select: { icalToken: true } })).icalToken).toBe(before);
    expect(await replaceCalendarLinkAction({ listingId: "" })).toMatchObject({ ok: false });
  });

  it("is rate-limited (5 an hour per account)", async () => {
    state.user = { id: ids.host };
    await db.rateLimit.deleteMany({ where: { key: { contains: ids.host } } });
    const results = [];
    for (let i = 0; i < 6; i++) results.push(await replaceCalendarLinkAction({ listingId: ids.flat }));
    expect(results.slice(0, 5).every((r) => r.ok)).toBe(true);
    expect(results[5]).toMatchObject({ ok: false, error: "rate_limited" });
  });
});
