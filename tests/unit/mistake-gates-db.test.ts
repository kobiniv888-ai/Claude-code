/**
 * The mistake check's errors (round 3, brief 6.1) on EVERY path that puts a listing on the site or
 * changes what a live listing shows, against the local database (DATABASE_URL in .env):
 *
 * - auto-saves of a LIVE listing that would add an error are refused and keep the old values
 *   (contact details in the text, an empty address, deleting below 5 photos, contact details in a
 *   hand-written translation or a photo description);
 * - unpause, renew, approve and restore refuse a listing with errors, and it stays where it was;
 * - publish checks again under the row lock (an edit saved during publishing is seen);
 * - "Save changes" checks even an address-only edit, holds a live listing with errors for review,
 *   and still runs the automatic checks when the mistake check itself fails;
 * - a switched-off room type's photos don't count; owner-edited translations are checked;
 * - deleting a room type waits for a booking being committed, and then refuses (hotel-1).
 *
 * The session, the founder's alerts, emails, the price guide and nearby places are stand-ins;
 * everything else is the real code. Fake @example.com users; every row is removed afterwards.
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { openListingLocation, sealAddress, sealGuestPhone, sealPin } from "@/lib/field-crypto";

const state = vi.hoisted(() => ({
  user: null as null | Record<string, unknown>,
  founder: [] as string[],
  /** translateListing writes a phone number into this listing's description (an edit during publish). */
  injectPhoneInto: null as string | null,
  /** The actions' mistake check throws (mistake-9). */
  mistakesThrow: false,
}));

vi.mock("server-only", () => ({}));
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: () => undefined,
}));
vi.mock("next-intl/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next-intl/server")>()),
  getLocale: async () => "he",
}));
vi.mock("@/lib/auth/session", async () => {
  const { AppError } = await import("@/lib/errors");
  return {
    requireUserForAction: async () => {
      if (!state.user) throw new AppError("auth_required", "Sign-in required", { status: 401 });
      return state.user;
    },
  };
});
vi.mock("@/lib/settings", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/settings")>()),
  assertNotShabbatMode: async () => undefined,
}));
vi.mock("@/lib/email", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/email")>()),
  sendEmail: async () => ({ ok: true, delivery: "logged" }),
}));
vi.mock("@/lib/alerts/founder-admin", () => ({
  notifyFounderListingInReview: async (id: string) => void state.founder.push(id),
}));
vi.mock("@/lib/alerts/listing-decision", () => ({ notifyListingDecision: async () => undefined }));
vi.mock("@/lib/pricing/guide-server", () => ({
  getPriceGuide: async () => ({ status: "not_enough", unit: "night", currency: "GEL", scope: { level: "city", cityId: "", matched: [] }, references: [] }),
  getRoomTypePriceGuides: async () => new Map(),
}));
vi.mock("@/lib/nearby", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/nearby")>()),
  computeListingProximity: async () => undefined,
}));
vi.mock("@/lib/translate", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/translate")>();
  return {
    ...real,
    translateListing: async (...args: Parameters<typeof real.translateListing>) => {
      if (state.injectPhoneInto && state.injectPhoneInto === args[0]) {
        const { db } = await import("@/lib/db");
        await db.listing.update({ where: { id: args[0] }, data: { description: "A quiet flat by the sea. WhatsApp me on +995 555 12 34 56 for a discount." } });
      }
      return real.translateListing(...args);
    },
  };
});
vi.mock("@/lib/listing/mistake-check-server", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/listing/mistake-check-server")>();
  return {
    ...real,
    listingMistakeErrors: async (...args: Parameters<typeof real.listingMistakeErrors>) => {
      if (state.mistakesThrow) throw new Error("simulated mistake-check failure");
      return real.listingMistakeErrors(...args);
    },
  };
});

const { db } = await import("@/lib/db");
const { PLEDGE_CURRENT_VERSION } = await import("@/lib/pledge");
const actions = await import("@/lib/wizard/actions");
const lifecycle = await import("@/lib/listing/lifecycle");
const { getListingMistakes } = await import("@/lib/listing/mistake-check-server");
const { signEditToken } = await import("@/lib/wizard/server");
const { deleteRoomTypeLocked } = await import("@/lib/wizard/photo-guard-server");

const prefix = `p4g${randomUUID().replace(/-/g, "").slice(0, 10)}`;
const id = (name: string) => `${prefix}-${name}`;
const users = { owner: id("owner"), staff: id("staff"), guest: id("guest") };
let cityId = "";
const past = new Date(Date.now() - 86_400_000);

function sessionUser(userId: string) {
  return { id: userId, role: "USER", phoneNumberVerified: true, twoFactorVerified: true, businessName: null, accountType: "PRIVATE" };
}

type ListingData = Parameters<typeof db.listing.create>[0]["data"];

/** A complete short stay (every publishing requirement met, no mistake-check error). */
async function listing(extra: Record<string, unknown> = {}, photos = 5) {
  const status = (extra.status as string | undefined) ?? "DRAFT";
  const row = await db.listing.create({
    data: {
      ownerId: users.owner,
      status: "DRAFT",
      dealType: "SHORT_STAY",
      propertyType: "APARTMENT",
      cityId,
      pinEnc: sealPin({ lat: 41.64, lng: 41.62 }),
      addressEnc: sealAddress("Fake street 1, apt 2"),
      originalLocale: "en",
      title: `${prefix} quiet flat by the sea`,
      description: "A quiet flat with a balcony and a full kitchen, five minutes from the sea and the old town.",
      price: 80,
      currency: "GEL",
      pricePeriod: "NIGHT",
      maxGuests: 2,
      bedsDouble: 1,
      bathrooms: 1,
      checkInFrom: "14:00",
      checkOutUntil: "11:00",
      paymentMethodsAtCheckIn: ["cash"],
      contactMethods: [{ channel: "WHATSAPP", value: "+995555990001", order: 0 }],
      ...(status !== "DRAFT"
        ? { publishedAt: past, rulesAcceptedAt: past, lastCheckedAt: new Date(), riskScore: 0, riskReasons: [], contentUpdatedAt: past, expiresAt: new Date(Date.now() + 30 * 86_400_000) }
        : {}),
      ...extra,
    } as ListingData,
  });
  for (let i = 0; i < photos; i += 1) {
    await db.listingPhoto.create({ data: { listingId: row.id, url: `/photos/cities/batumi.webp`, sortOrder: i, isCover: i === 0 } });
  }
  // Checked after its photos were added: nothing changed since the automatic checks ran.
  if (status !== "DRAFT" && !("lastCheckedAt" in extra)) await db.listing.update({ where: { id: row.id }, data: { lastCheckedAt: new Date() } });
  return row.id;
}

const statusOf = async (listingId: string) => (await db.listing.findUniqueOrThrow({ where: { id: listingId } })).status;

beforeAll(async () => {
  await db.user.createMany({
    data: Object.entries(users).map(([name, userId], i) => ({
      id: userId,
      name: `${name} Test`,
      email: `${userId}@example.com`,
      locale: "en",
      role: name === "staff" ? ("MODERATOR" as const) : ("USER" as const),
      phoneNumber: `+99555598${String(9000 + i)}`,
      phoneNumberVerified: true,
      welcomePledgeVersion: PLEDGE_CURRENT_VERSION,
    })),
  });
  const city = await db.city.create({
    data: { slug: id("city"), names: { he: "עיר", en: "City", ru: "Город", ar: "مدينة", ka: "ქალაქი" }, searchText: "city", lat: 41.6168, lng: 41.6367 },
  });
  cityId = city.id;
  // An earlier published listing: the owner is not new (their next listing may go LIVE directly).
  await listing({ status: "LIVE", title: `${prefix} earlier listing` });
});

afterAll(async () => {
  const ids = Object.values(users);
  const listingIds = (await db.listing.findMany({ where: { ownerId: { in: ids } }, select: { id: true } })).map((l) => l.id);
  await db.booking.deleteMany({ where: { listingId: { in: listingIds } } });
  await db.auditLog.deleteMany({ where: { OR: [{ actorId: { in: ids } }, { targetId: { in: [...ids, ...listingIds] } }] } });
  await db.rateLimit.deleteMany({ where: { OR: ids.map((userId) => ({ key: { contains: userId } })) } });
  await db.emailOutbox.deleteMany({ where: { to: { in: ids.map((userId) => `${userId}@example.com`) } } }).catch(() => undefined);
  await db.listing.deleteMany({ where: { id: { in: listingIds } } });
  await db.city.deleteMany({ where: { slug: { startsWith: prefix } } });
  await db.user.deleteMany({ where: { id: { in: ids } } });
});

beforeEach(() => {
  state.user = sessionUser(users.owner);
  state.founder.length = 0;
  state.injectPhoneInto = null;
  state.mistakesThrow = false;
});

describe("auto-saves of a LIVE listing can't add an error (mistake-2)", () => {
  it("a phone number in the description is refused and the old text stays", async () => {
    const listingId = await listing({ status: "LIVE" });
    const before = await db.listing.findUniqueOrThrow({ where: { id: listingId } });
    const result = await actions.updateDraft(listingId, "text", { description: `${before.description} WhatsApp 0541234567` });
    expect(result).toEqual({ ok: false, error: "invalid_input", fieldErrors: { description: ["contactInText"] } });
    const after = await db.listing.findUniqueOrThrow({ where: { id: listingId } });
    expect(after.description).toBe(before.description);
    expect(after.status).toBe("LIVE");
  });

  it("an empty address of a short stay is refused; a draft may save it", async () => {
    const live = await listing({ status: "LIVE" });
    expect(await actions.updateDraft(live, "location", { address: "" })).toEqual({ ok: false, error: "invalid_input", fieldErrors: { address: ["addressRequired"] } });
    expect(openListingLocation(await db.listing.findUniqueOrThrow({ where: { id: live } }), "test").address).toBe("Fake street 1, apt 2");
    const draft = await listing();
    expect((await actions.updateDraft(draft, "location", { address: "" })).ok).toBe(true);
  });

  it("deleting a photo below the minimum is refused (the 6th goes, the 5th stays)", async () => {
    const listingId = await listing({ status: "LIVE" }, 6);
    const photos = await db.listingPhoto.findMany({ where: { listingId }, orderBy: { sortOrder: "asc" } });
    expect((await actions.deletePhoto(listingId, photos[5].id)).ok).toBe(true);
    expect(await actions.deletePhoto(listingId, photos[4].id)).toEqual({ ok: false, error: "photos_min" });
    expect(await db.listingPhoto.count({ where: { listingId } })).toBe(5);
  });

  it("a hand-written translation or a photo description with contact details is refused", async () => {
    const listingId = await listing({ status: "LIVE" });
    const result = await actions.saveTranslations(listingId, "he", { title: "דירה שקטה ליד הים", description: "דירה שקטה עם מרפסת. וואטסאפ +995 555 12 34 56 להנחה." });
    expect(result).toEqual({ ok: false, error: "contact_in_text", fieldErrors: { description: ["contactInText"] } });
    expect(await db.listingTranslation.count({ where: { listingId } })).toBe(0);
    const photo = await db.listingPhoto.findFirstOrThrow({ where: { listingId } });
    expect(await actions.updatePhotoAlt(listingId, photo.id, "Call +995 555 12 34 56")).toMatchObject({ ok: false, error: "contact_in_text" });
  });
});

describe("unpause, renew, approve and restore refuse a listing with errors (mistake-1, -3, -4)", () => {
  it("a paused short stay whose address was cleared stays paused", async () => {
    const listingId = await listing({ status: "PAUSED", address: "" });
    await expect(lifecycle.unpauseListing(listingId, users.owner)).rejects.toMatchObject({ code: "listing_mistakes", mistakes: ["address_missing"] });
    expect(await statusOf(listingId)).toBe("PAUSED");
  });

  it("an expired listing without an address can't be renewed", async () => {
    const listingId = await listing({ status: "EXPIRED", address: null, expiresAt: past });
    await expect(lifecycle.renewListing(listingId, users.owner)).rejects.toMatchObject({ code: "listing_mistakes" });
    expect(await statusOf(listingId)).toBe("EXPIRED");
  });

  it("unpause also checks the publishing requirements (too few photos)", async () => {
    const listingId = await listing({ status: "PAUSED" }, 3);
    await expect(lifecycle.unpauseListing(listingId, users.owner)).rejects.toMatchObject({ code: "missing_requirements" });
    expect(await statusOf(listingId)).toBe("PAUSED");
  });

  it("a clean paused listing unpauses", async () => {
    const listingId = await listing({ status: "PAUSED" });
    expect(await lifecycle.unpauseListing(listingId, users.owner)).toMatchObject({ status: "LIVE", changed: true });
  });

  it("approving a listing waiting for review without an address is refused; it keeps waiting", async () => {
    const listingId = await listing({ status: "IN_REVIEW", address: null });
    await expect(lifecycle.approveListing(listingId, users.staff)).rejects.toMatchObject({ code: "listing_has_mistakes" });
    expect(await statusOf(listingId)).toBe("IN_REVIEW");
  });

  it("restoring a hidden listing without an address is refused; it stays hidden", async () => {
    const listingId = await listing({ status: "HIDDEN", address: null });
    await expect(lifecycle.restoreHiddenListing(listingId, users.staff)).rejects.toMatchObject({ code: "listing_has_mistakes" });
    expect(await statusOf(listingId)).toBe("HIDDEN");
  });
});

describe("publish and 'Save changes'", () => {
  it("an edit saved while publishing runs is caught under the lock (mistake-11)", { timeout: 20_000 }, async () => {
    const listingId = await listing();
    state.injectPhoneInto = listingId;
    const result = await actions.acceptRulesAndPublish(listingId, { rulesAccepted: true });
    expect(result).toEqual({ ok: false, error: "listing_mistakes", fieldErrors: { mistakes: ["contact_in_description"] } });
    expect(await statusOf(listingId)).toBe("DRAFT");
  });

  it("an address-only edit with a valid edit token is still checked (mistake-15)", async () => {
    const listingId = await listing({ status: "IN_REVIEW" });
    const token = signEditToken(listingId, new Date());
    expect((await actions.updateDraft(listingId, "location", { address: "" })).ok).toBe(true);
    const result = await actions.saveChanges(listingId, token);
    expect(result).toEqual({ ok: false, error: "listing_mistakes", fieldErrors: { mistakes: ["address_missing"] } });
  });

  it("a live listing with errors is held for review instead of staying on the site (mistake-2 d)", async () => {
    const listingId = await listing({ status: "LIVE", address: "", contentUpdatedAt: new Date() });
    const result = await actions.saveChanges(listingId, null);
    expect(result).toEqual({ ok: false, error: "listing_mistakes", fieldErrors: { mistakes: ["address_missing"] } });
    expect(await statusOf(listingId)).toBe("IN_REVIEW");
    expect(state.founder).toContain(listingId);
  });

  it("when the mistake check fails, the live listing still gets the automatic checks (mistake-9)", async () => {
    const listingId = await listing({ status: "LIVE", lastCheckedAt: past, contentUpdatedAt: new Date() });
    state.mistakesThrow = true;
    const result = await actions.saveChanges(listingId, null);
    expect(result).toMatchObject({ ok: false, error: "server_error" });
    const row = await db.listing.findUniqueOrThrow({ where: { id: listingId } });
    expect(row.status === "IN_REVIEW" || row.lastCheckedAt!.getTime() > past.getTime()).toBe(true);
  });
});

describe("what the mistake check counts", () => {
  it("contact details in an owner-written translation are an error (mistake-5)", async () => {
    const listingId = await listing();
    await db.listingTranslation.create({
      data: { listingId, locale: "he", title: "דירה שקטה", description: "וואטסאפ +995 555 12 34 56", isOriginal: false, isAuto: false, editedByOwner: true },
    });
    const { errors } = await getListingMistakes(listingId);
    expect(errors.map((e) => [e.code, e.params?.locale])).toEqual([["contact_in_translation", "he"]]);
  });

  it("a switched-off room type's photos don't count towards the 5 (mistake-10)", async () => {
    const listingId = await listing({ dealType: "HOTEL_ROOM", propertyType: "HOTEL", bathrooms: null, maxGuests: null, bedsDouble: null, price: null }, 1);
    const room = await db.roomType.create({
      data: { listingId, names: { he: "חדר", en: "Room", ru: "Номер", ar: "غرفة", ka: "ოთახი" }, price: 90, currency: "GEL", pricePeriod: "NIGHT", maxGuests: 2, quantity: 2, active: false },
    });
    for (let i = 0; i < 4; i += 1) {
      await db.listingPhoto.create({ data: { listingId, roomTypeId: room.id, url: `/photos/cities/batumi.webp`, sortOrder: i } });
    }
    const { errors } = await getListingMistakes(listingId);
    expect(errors.find((e) => e.code === "photos_too_few")?.params).toEqual({ count: 1, min: 5 });
    await db.roomType.update({ where: { id: room.id }, data: { active: true } });
    expect((await getListingMistakes(listingId)).errors.map((e) => e.code)).not.toContain("photos_too_few");
  });
});

describe("deleting a room type and a booking at the same moment (hotel-1)", () => {
  it("waits for the booking being committed, then refuses: the booking keeps its rooms", { timeout: 20_000 }, async () => {
    const listingId = await listing({ status: "LIVE", dealType: "HOTEL_ROOM", propertyType: "HOTEL", price: null }, 5);
    const room = await db.roomType.create({
      data: { listingId, names: { he: "חדר", en: "Room", ru: "Номер", ar: "غرفة", ka: "ოთახი" }, price: 90, currency: "GEL", pricePeriod: "NIGHT", maxGuests: 2, quantity: 3, active: true },
    });
    const checkIn = new Date(Date.UTC(new Date().getUTCFullYear() + 1, 2, 10));
    const checkOut = new Date(checkIn.getTime() + 2 * 86_400_000);
    let deletion: ReturnType<typeof deleteRoomTypeLocked> | null = null;
    let bookingId = "";

    await db.$transaction(async (tx) => {
      // The booking's own order (src/lib/booking/service.ts): the Listing, then the RoomType.
      await tx.$queryRaw`SELECT "id" FROM "Listing" WHERE "id" = ${listingId} FOR UPDATE`;
      await tx.$queryRaw`SELECT "id" FROM "RoomType" WHERE "id" = ${room.id} FOR UPDATE`;
      const booking = await tx.booking.create({
        data: {
          code: `${prefix}-B1`,
          listingId,
          guestUserId: users.guest,
          hostUserId: users.owner,
          roomTypeId: room.id,
          rooms: 1,
          checkIn,
          checkOut,
          nights: 2,
          adults: 2,
          nightlyPrice: 90,
          subtotal: 180,
          total: 180,
          currency: "GEL",
          cancellationPolicy: "FLEXIBLE",
          guestName: "Guest Test",
          ...sealGuestPhone("+995555989001"),
          locale: "en",
          rulesAcceptedAt: new Date(),
        },
      });
      bookingId = booking.id;
      await tx.availabilityBlock.create({ data: { listingId, roomTypeId: room.id, rooms: 1, source: "BOOKING", bookingId: booking.id, startDate: checkIn, endDate: checkOut } });
      // The host deletes the room type now: it must wait for this booking.
      deletion = deleteRoomTypeLocked(listingId, room.id, true);
      await new Promise((resolve) => setTimeout(resolve, 400));
    });

    expect(await deletion!).toEqual({ ok: false, error: "room_type_has_bookings" });
    expect(await db.roomType.count({ where: { id: room.id } })).toBe(1);
    expect(await db.availabilityBlock.count({ where: { bookingId } })).toBe(1);
    expect((await db.booking.findUniqueOrThrow({ where: { id: bookingId } })).roomTypeId).toBe(room.id);
  });

  it("a room type without upcoming bookings is deleted with its photos", async () => {
    const listingId = await listing({ status: "LIVE", dealType: "HOTEL_ROOM", propertyType: "HOTEL", price: null }, 5);
    const room = await db.roomType.create({
      data: { listingId, names: { he: "חדר", en: "Room", ru: "Номер", ar: "غرفة", ka: "ოთახი" }, price: 90, currency: "GEL", pricePeriod: "NIGHT", maxGuests: 2, quantity: 1, active: true },
    });
    await db.listingPhoto.create({ data: { listingId, roomTypeId: room.id, url: `/photos/cities/batumi.webp`, sortOrder: 0 } });
    const result = await deleteRoomTypeLocked(listingId, room.id, true);
    expect(result).toMatchObject({ ok: true });
    expect(await db.roomType.count({ where: { id: room.id } })).toBe(0);
    expect(await db.listingPhoto.count({ where: { roomTypeId: room.id } })).toBe(0);
  });
});

describe("a room type's currency while it has holiday prices (price-2)", () => {
  it("is refused, and the room type keeps its currency", async () => {
    const listingId = await listing({ dealType: "HOTEL_ROOM", propertyType: "HOTEL", price: null });
    const room = await db.roomType.create({
      data: { listingId, names: { he: "Double", en: "Double", ru: "Double", ar: "Double", ka: "Double" }, price: 90, currency: "GEL", pricePeriod: "NIGHT", maxGuests: 2, quantity: 2, active: true },
    });
    const start = new Date(Date.UTC(new Date().getUTCFullYear() + 1, 3, 12));
    await db.datePrice.create({ data: { listingId, roomTypeId: room.id, startDate: start, endDate: new Date(start.getTime() + 3 * 86_400_000), price: 120 } });
    const input = { id: room.id, name: "Double", price: 90, pricePeriod: "NIGHT", maxGuests: 2, bedsSingle: 0, bedsDouble: 1, sizeSqm: 20, quantity: 2, active: true };
    expect(await actions.saveRoomType(listingId, { ...input, currency: "USD" })).toEqual({ ok: false, error: "invalid_input", fieldErrors: { currency: ["datePricesExist"] } });
    expect((await db.roomType.findUniqueOrThrow({ where: { id: room.id } })).currency).toBe("GEL");
    // The same currency saves as usual.
    expect((await actions.saveRoomType(listingId, { ...input, currency: "GEL", price: 95 })).ok).toBe(true);
  });
});
