/**
 * Saved lists against the local database (round 3, brief 7.2; src/lib/lists/server.ts): the
 * default list, the heart's "last list used", one list per place (moves), deleting a list,
 * names, sharing on/off (a new token each time), what a shared list shows, copying a shared list
 * and merging a device's lists into an account. Creates its own users, city and listings (fake
 * @example.com addresses) and removes them afterwards.
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Prisma as PrismaTypes } from "@/generated/prisma/client";

vi.mock("server-only", () => ({}));
const recordSave = vi.fn(async () => {});
vi.mock("@/lib/listing/stats", () => ({ recordSave }));

const { db } = await import("@/lib/db");
const { Prisma } = await import("@/generated/prisma/client");
const lists = await import("@/lib/lists/server");
const { DEVICE_DEFAULT_KEY } = await import("@/lib/lists/core");

const prefix = `p5l${randomUUID().replace(/-/g, "").slice(0, 10)}`;
const names = { he: "עיר", en: "City", ru: "Город", ar: "مدينة", ka: "ქალაქი" };
const ids = { host: `${prefix}-host`, city: "", a: "", b: "", c: "", d: "", hidden: "" };
let users = 0;

async function newUser(status: "ACTIVE" | "SUSPENDED" = "ACTIVE") {
  users += 1;
  const id = `${prefix}-u${users}`;
  await db.user.create({ data: { id, name: "Test", email: `${id}@example.com`, status } });
  return { id, isStaff: false };
}

async function listing(title: string, data: Partial<PrismaTypes.ListingUncheckedCreateInput> = {}) {
  const row = await db.listing.create({
    data: {
      ownerId: ids.host,
      status: "LIVE",
      dealType: "SHORT_STAY",
      cityId: ids.city,
      title,
      currency: "GEL",
      price: new Prisma.Decimal(120),
      pricePeriod: "NIGHT",
      publishedAt: new Date(),
      isDemo: false,
      ...data,
    },
  });
  return row.id;
}

beforeAll(async () => {
  await db.user.create({ data: { id: ids.host, name: "Host", email: `${ids.host}@example.com` } });
  const city = await db.city.create({ data: { slug: `${prefix}-city`, names, searchText: "city", lat: 41.64, lng: 41.63 } });
  ids.city = city.id;
  ids.a = await listing("A");
  ids.b = await listing("B", { price: new Prisma.Decimal(250), currency: "USD" });
  ids.c = await listing("C");
  ids.d = await listing("D");
  ids.hidden = await listing("Hidden", { status: "HIDDEN" });
});

afterAll(async () => {
  await db.listing.deleteMany({ where: { ownerId: ids.host } });
  await db.city.deleteMany({ where: { slug: { startsWith: prefix } } });
  await db.user.deleteMany({ where: { id: { startsWith: prefix } } });
});

beforeEach(() => recordSave.mockClear());

const favorites = (userId: string) => db.favorite.findMany({ where: { userId }, orderBy: { createdAt: "asc" } });

describe("saving and moving (one list per place)", () => {
  it("the first heart creates the default list and keeps the headline price for alerts", async () => {
    const user = await newUser();
    const saved = await lists.saveToList(user, ids.b, null);
    expect(saved).toMatchObject({ created: true, moved: false, list: { isDefault: true, count: 1 } });
    const [fav] = await favorites(user.id);
    expect(fav.listId).toBe(saved.list.id);
    expect(fav.alertPrice?.toString()).toBe("250");
    expect(fav.alertCurrency).toBe("USD");
    expect(await db.savedList.count({ where: { userId: user.id, isDefault: true } })).toBe(1);
    expect(recordSave).toHaveBeenCalledWith(ids.b, 1, user);
  });

  it("two hearts at once still make one default list", async () => {
    const user = await newUser();
    await Promise.all([lists.saveToList(user, ids.a, null), lists.saveToList(user, ids.c, null)]);
    expect(await db.savedList.count({ where: { userId: user.id, isDefault: true } })).toBe(1);
    expect(await db.favorite.count({ where: { userId: user.id } })).toBe(2);
  });

  it("the heart saves to the last list used; choosing another list moves the place", async () => {
    const user = await newUser();
    await lists.saveToList(user, ids.a, null);
    const batumi = await lists.createList(user.id, "בטומי באוגוסט");
    const moved = await lists.saveToList(user, ids.a, batumi.id);
    expect(moved).toMatchObject({ created: false, moved: true, list: { id: batumi.id, count: 1 } });
    // The next heart goes to "בטומי באוגוסט", the list used last.
    const next = await lists.saveToList(user, ids.c, null);
    expect(next.list.id).toBe(batumi.id);
    const rows = await favorites(user.id);
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.listId === batumi.id)).toBe(true);
    // A move keeps the price the place was saved at.
    expect(rows[0].alertPrice?.toString()).toBe("120");
  });

  it("only public listings can be newly saved; a saved one can still move once hidden", async () => {
    const user = await newUser();
    await expect(lists.saveToList(user, ids.hidden, null)).rejects.toMatchObject({ code: "not_found" });
    await lists.saveToList(user, ids.d, null);
    await db.listing.update({ where: { id: ids.d }, data: { status: "PAUSED" } });
    const other = await lists.createList(user.id, "Other");
    await expect(lists.saveToList(user, ids.d, other.id)).resolves.toMatchObject({ moved: true });
    await db.listing.update({ where: { id: ids.d }, data: { status: "LIVE" } });
  });

  it("a list of another user is never a target", async () => {
    const owner = await newUser();
    const theirs = await lists.createList(owner.id, "Theirs");
    const user = await newUser();
    await expect(lists.saveToList(user, ids.a, theirs.id)).rejects.toMatchObject({ code: "not_found" });
  });

  it("places saved before lists (no listId) are in the default list", async () => {
    const user = await newUser();
    await db.favorite.create({ data: { userId: user.id, listingId: ids.a } });
    const { lists: summaries } = await lists.getAccountLists(user.id);
    expect(summaries).toHaveLength(1);
    expect(summaries[0]).toMatchObject({ isDefault: true, count: 1 });
  });
});

describe("managing lists", () => {
  it("names: unique (case and spacing ignored), no contact details, the default list is fixed", async () => {
    const user = await newUser();
    await lists.createList(user.id, "Batumi");
    await expect(lists.createList(user.id, "  batumi ")).rejects.toMatchObject({ code: "name_taken" });
    await expect(lists.createList(user.id, "call +995 555 12 34 56")).rejects.toMatchObject({ code: "name_has_contact" });
    await expect(lists.createList(user.id, "   ")).rejects.toMatchObject({ code: "name_required" });
    const { lists: summaries } = await lists.getAccountLists(user.id);
    const fallback = summaries.find((l) => l.isDefault)!;
    await expect(lists.renameList(user.id, fallback.id, "Other")).rejects.toMatchObject({ code: "default_list" });
    await expect(lists.deleteList(user.id, fallback.id)).rejects.toMatchObject({ code: "default_list" });
  });

  it("deleting a list moves its places to the default list, and the heart goes back there", async () => {
    const user = await newUser();
    const trip = await lists.createList(user.id, "Trip");
    await lists.saveToList(user, ids.a, trip.id);
    await lists.saveToList(user, ids.c, trip.id);
    const result = await lists.deleteList(user.id, trip.id);
    expect(result.movedPlaces).toBe(2);
    const rows = await favorites(user.id);
    expect(rows.every((row) => row.listId === result.defaultListId)).toBe(true);
    expect((await lists.saveToList(user, ids.d, null)).list.id).toBe(result.defaultListId);
  });
});

describe("sharing", () => {
  it("on → a token; the page shows only public places; off → gone; on again → a NEW token", async () => {
    const user = await newUser();
    const list = await lists.createList(user.id, "Family trip");
    await lists.saveToList(user, ids.a, list.id);
    await lists.saveToList(user, ids.c, list.id);
    const first = await lists.setListSharing(user.id, list.id, true);
    expect(first.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    // Sharing again keeps the live link.
    expect((await lists.setListSharing(user.id, list.id, true)).token).toBe(first.token);

    const shared = await lists.getSharedList(first.token!);
    expect(shared).toMatchObject({ id: list.id, name: "Family trip", isDefault: false, ownerId: user.id });
    expect(new Set(shared!.listingIds)).toEqual(new Set([ids.a, ids.c]));

    // A place that stops being public leaves the shared page.
    await db.listing.update({ where: { id: ids.c }, data: { status: "HIDDEN" } });
    expect((await lists.getSharedList(first.token!))!.listingIds).toEqual([ids.a]);
    await db.listing.update({ where: { id: ids.c }, data: { status: "LIVE" } });

    expect(await lists.setListSharing(user.id, list.id, false)).toEqual({ token: null });
    expect(await lists.getSharedList(first.token!)).toBeNull();
    const again = await lists.setListSharing(user.id, list.id, true);
    expect(again.token).not.toBe(first.token);
    expect(await lists.getSharedList(first.token!)).toBeNull();
    expect(await lists.getSharedList(again.token!)).not.toBeNull();
  });

  it("only the owner can share, a suspended owner's list does not open, odd tokens are not looked up", async () => {
    const owner = await newUser();
    const list = await lists.createList(owner.id, "Mine");
    const stranger = await newUser();
    await expect(lists.setListSharing(stranger.id, list.id, true)).rejects.toMatchObject({ code: "not_found" });
    const { token } = await lists.setListSharing(owner.id, list.id, true);
    await db.user.update({ where: { id: owner.id }, data: { status: "SUSPENDED" } });
    expect(await lists.getSharedList(token!)).toBeNull();
    expect(await lists.getSharedList("short")).toBeNull();
  });

  it("a shared default list includes the places saved without a list", async () => {
    const user = await newUser();
    await db.favorite.create({ data: { userId: user.id, listingId: ids.d } });
    const { lists: summaries } = await lists.getAccountLists(user.id);
    const { token } = await lists.setListSharing(user.id, summaries[0].id, true);
    expect(await lists.getSharedList(token!)).toMatchObject({ isDefault: true, listingIds: [ids.d] });
  });
});

describe("copying a shared list", () => {
  it("makes a new list; places the viewer already saved stay in their own list", async () => {
    const owner = await newUser();
    const list = await lists.createList(owner.id, "Batumi");
    for (const id of [ids.a, ids.c, ids.d]) await lists.saveToList(owner, id, list.id);
    const { token } = await lists.setListSharing(owner.id, list.id, true);

    const viewer = await newUser();
    const mine = await lists.createList(viewer.id, "Batumi");
    await lists.saveToList(viewer, ids.c, mine.id);
    recordSave.mockClear();

    const copy = await lists.copySharedList(viewer, token!, "Shared with me");
    expect(copy).toMatchObject({ added: 2, alreadySaved: 1 });
    const created = await db.savedList.findUniqueOrThrow({ where: { id: copy.listId } });
    expect(created).toMatchObject({ userId: viewer.id, name: "Batumi (2)", isDefault: false, shareToken: null });
    const rows = await favorites(viewer.id);
    expect(rows.find((r) => r.listingId === ids.c)?.listId).toBe(mine.id);
    expect(rows.filter((r) => r.listId === copy.listId).map((r) => r.listingId).sort()).toEqual([ids.a, ids.d].sort());
    expect(rows.find((r) => r.listingId === ids.a)?.alertPrice?.toString()).toBe("120");
    expect(recordSave).toHaveBeenCalledTimes(2);
    // The owner's own list is not touched, and the owner cannot copy it.
    expect(await db.favorite.count({ where: { userId: owner.id, listId: list.id } })).toBe(3);
    await expect(lists.copySharedList(owner, token!, "x")).rejects.toMatchObject({ code: "own_list" });
  });

  it("a list that is no longer shared cannot be copied", async () => {
    const owner = await newUser();
    const list = await lists.createList(owner.id, "Gone");
    const { token } = await lists.setListSharing(owner.id, list.id, true);
    await lists.setListSharing(owner.id, list.id, false);
    const viewer = await newUser();
    await expect(lists.copySharedList(viewer, token!, "x")).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("merging a device's lists at sign-in", () => {
  it("no duplicates, the account wins, only public places, lists matched by name", async () => {
    const user = await newUser();
    const batumi = await lists.createList(user.id, "Batumi");
    await lists.saveToList(user, ids.a, batumi.id);
    const T0 = Date.now() - 60_000;
    const device = {
      lists: [
        { key: "d_batumi0001", name: "batumi", usedAt: T0 + 5, createdAt: T0 },
        { key: "d_kobu000001", name: "Kobuleti", usedAt: null, createdAt: T0 },
      ],
      items: [
        { listingId: ids.a, listKey: DEVICE_DEFAULT_KEY, savedAt: T0 + 1 },
        { listingId: ids.c, listKey: "d_batumi0001", savedAt: T0 + 2 },
        { listingId: ids.d, listKey: "d_kobu000001", savedAt: T0 + 3 },
        { listingId: ids.b, listKey: DEVICE_DEFAULT_KEY, savedAt: T0 + 4 },
        { listingId: ids.hidden, listKey: DEVICE_DEFAULT_KEY, savedAt: T0 + 4 },
      ],
      defaultUsedAt: null,
    };
    const result = await lists.mergeDeviceLists(user, device);
    expect(result).toEqual({ added: 3, kept: 1, unavailable: 1, listsCreated: 1 });

    const rows = await favorites(user.id);
    const byListing = new Map(rows.map((r) => [r.listingId, r.listId]));
    const kobuleti = await db.savedList.findFirstOrThrow({ where: { userId: user.id, name: "Kobuleti" } });
    const fallback = await db.savedList.findFirstOrThrow({ where: { userId: user.id, isDefault: true } });
    expect(byListing.get(ids.a)).toBe(batumi.id); // the account's list wins
    expect(byListing.get(ids.c)).toBe(batumi.id); // "batumi" on the device = "Batumi"
    expect(byListing.get(ids.d)).toBe(kobuleti.id);
    expect(byListing.get(ids.b)).toBe(fallback.id);
    expect(byListing.has(ids.hidden)).toBe(false);
    // The device used "batumi" last, more recently than the account: the heart continues there.
    expect((await lists.getAccountLists(user.id)).targetId).toBe(batumi.id);

    // Merging the same device again changes nothing.
    expect(await lists.mergeDeviceLists(user, device)).toMatchObject({ added: 0, listsCreated: 0 });
    expect(await db.favorite.count({ where: { userId: user.id } })).toBe(4);
  });
});
