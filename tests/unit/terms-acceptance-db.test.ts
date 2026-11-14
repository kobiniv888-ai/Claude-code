/**
 * The Terms acceptance log (SECURITY_REPORT 15.11.b/c, D4) against the local database:
 *
 * - sign-up: the login's terms step logs { version: TERMS_VERSION, ageConfirmed: true } and is not
 *   asked again; nothing is logged without both ticks;
 * - first booking / first publish: the box is needed (and logged) even right after the sign-up
 *   acceptance; after that, not again while the version stays the same;
 * - a new Terms version: the next booking and publish need the box again;
 * - requireTermsFor refuses ("terms_required") without the ticked box and writes nothing.
 *
 * Creates its own users (@example.com), city, listing and booking rows, and removes them afterwards.
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { sealAddress, sealPin } from "@/lib/field-crypto";

const session = vi.hoisted(() => ({ user: { id: "", twoFactorVerified: true } as { id: string; twoFactorVerified: boolean } }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/session", () => ({ requireUserForAction: async () => session.user }));
vi.mock("@/lib/rate-limit", () => ({ assertRateLimit: async () => ({ ok: true }) }));

const { db } = await import("@/lib/db");
const { TERMS_VERSION, TERMS_CONSENT } = await import("@/lib/legal/terms");
const { requireTermsFor, termsNeededFor, TermsRequiredError } = await import("@/lib/legal/terms-server");
const { acceptTermsAction, termsStatusAction } = await import("@/lib/legal/actions");

const prefix = `tac${randomUUID().replace(/-/g, "").slice(0, 10)}`;
const users: string[] = [];
const listings: string[] = [];
const ids = { city: "", host: "" };

async function makeUser(name: string) {
  const id = `${prefix}-${name}`;
  await db.user.create({ data: { id, name, firstName: name, email: `${id}@example.com`, locale: "en" } });
  users.push(id);
  return id;
}

async function makeListing(ownerId: string, status: "DRAFT" | "LIVE") {
  const listing = await db.listing.create({
    data: {
      ownerId,
      status,
      dealType: "SHORT_STAY",
      propertyType: "APARTMENT",
      pricePeriod: "NIGHT",
      price: 100,
      currency: "USD",
      minStayNights: 1,
      maxGuests: 2,
      bookingMode: "INSTANT",
      cancellationPolicy: "MODERATE",
      paymentMethodsAtCheckIn: ["cash"],
      cityId: ids.city,
      pinEnc: sealPin({ lat: 41.71, lng: 44.77 }),
      addressEnc: sealAddress("1 Test Street, Tbilisi"),
      contactMethods: [{ channel: "WHATSAPP", value: "+995555000001", order: 0 }],
      originalLocale: "en",
      title: `${prefix} flat`,
      description: "A test listing.",
    },
  });
  listings.push(listing.id);
  return listing.id;
}

async function makeBooking(guestUserId: string, listingId: string) {
  await db.booking.create({
    data: {
      code: `T-${prefix}-${randomUUID().slice(0, 6)}`,
      listingId,
      guestUserId,
      hostUserId: ids.host,
      status: "CONFIRMED",
      checkIn: new Date("2027-03-01T00:00:00Z"),
      checkOut: new Date("2027-03-03T00:00:00Z"),
      nights: 2,
      adults: 1,
      nightlyPrice: 100,
      subtotal: 200,
      total: 200,
      currency: "USD",
      cancellationPolicy: "MODERATE",
      guestName: "Guest",
      locale: "en",
      rulesAcceptedAt: new Date(),
    },
  });
}

const rows = (userId: string) => db.termsAcceptance.findMany({ where: { userId }, orderBy: { acceptedAt: "asc" } });

beforeAll(async () => {
  const city = await db.city.create({ data: { slug: `${prefix}-city`, names: { he: "עיר", en: "City", ru: "Город", ar: "مدينة", ka: "ქალაქი" }, searchText: "city", lat: 41.7, lng: 44.8 } });
  ids.city = city.id;
  ids.host = await makeUser("host");
});

afterAll(async () => {
  await db.booking.deleteMany({ where: { listingId: { in: listings } } });
  await db.listing.deleteMany({ where: { id: { in: listings } } });
  await db.termsAcceptance.deleteMany({ where: { userId: { in: users } } });
  await db.user.deleteMany({ where: { id: { in: users } } });
  await db.city.deleteMany({ where: { id: ids.city } });
});

describe("sign-up: the login's terms step", () => {
  it("is needed for a new account, logs the version with the 18+ confirmation, and is not asked again", async () => {
    const id = await makeUser("signup");
    session.user = { id, twoFactorVerified: true };
    expect(await termsNeededFor(id, "signup")).toBe(true);
    const status = await termsStatusAction("signup");
    expect(status).toEqual({ ok: true, data: { needed: true, version: TERMS_VERSION } });

    const saved = await acceptTermsAction(TERMS_CONSENT);
    expect(saved).toEqual({ ok: true, data: { version: TERMS_VERSION, recorded: true } });
    const logged = await rows(id);
    expect(logged).toHaveLength(1);
    expect(logged[0]).toMatchObject({ version: TERMS_VERSION, ageConfirmed: true });
    expect(await termsNeededFor(id, "signup")).toBe(false);

    // The same version again writes nothing new.
    expect(await acceptTermsAction(TERMS_CONSENT)).toEqual({ ok: true, data: { version: TERMS_VERSION, recorded: false } });
    expect(await rows(id)).toHaveLength(1);
  });

  it("logs nothing without BOTH ticks", async () => {
    const id = await makeUser("noticks");
    session.user = { id, twoFactorVerified: true };
    for (const input of [{}, { termsAccepted: true }, { ageConfirmed: true }, { termsAccepted: true, ageConfirmed: "true" }, null]) {
      const result = await acceptTermsAction(input);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toBe("terms_required");
    }
    expect(await rows(id)).toHaveLength(0);
    expect((await termsStatusAction("nonsense")).ok).toBe(false);
  });
});

describe("first booking and first publish", () => {
  it("the first booking needs the box even after the sign-up acceptance; later bookings of the same version do not", async () => {
    const guest = await makeUser("guest");
    const flat = await makeListing(ids.host, "LIVE");
    await db.termsAcceptance.create({ data: { userId: guest, version: TERMS_VERSION, ageConfirmed: true } });

    expect(await termsNeededFor(guest, "booking")).toBe(true);
    await expect(requireTermsFor(guest, "booking", {})).rejects.toBeInstanceOf(TermsRequiredError);
    await expect(requireTermsFor(guest, "booking", { termsAccepted: true })).rejects.toBeInstanceOf(TermsRequiredError);
    expect(await rows(guest)).toHaveLength(1);

    expect(await requireTermsFor(guest, "booking", { listingId: flat, ...TERMS_CONSENT })).toEqual({ recorded: true });
    expect(await rows(guest)).toHaveLength(2);
    await makeBooking(guest, flat);

    expect(await termsNeededFor(guest, "booking")).toBe(false);
    expect(await requireTermsFor(guest, "booking", {})).toEqual({ recorded: false });
    expect(await rows(guest)).toHaveLength(2);
  });

  it("the first publish needs the box; once a listing left the draft state, not again for the same version", async () => {
    const host = await makeUser("newhost");
    await makeListing(host, "DRAFT");
    await db.termsAcceptance.create({ data: { userId: host, version: TERMS_VERSION, ageConfirmed: true } });

    expect(await termsNeededFor(host, "publish")).toBe(true);
    await expect(requireTermsFor(host, "publish", { rulesAccepted: true })).rejects.toBeInstanceOf(TermsRequiredError);
    expect(await requireTermsFor(host, "publish", { rulesAccepted: true, ...TERMS_CONSENT })).toEqual({ recorded: true });

    await makeListing(host, "LIVE");
    expect(await termsNeededFor(host, "publish")).toBe(false);
  });
});

describe("a new Terms version", () => {
  it("asks again before the next booking and the next publish (not at sign-in)", async () => {
    const id = await makeUser("veteran");
    const flat = await makeListing(ids.host, "LIVE");
    await makeListing(id, "LIVE");
    await makeBooking(id, flat);
    // Accepted an older version only.
    await db.termsAcceptance.create({ data: { userId: id, version: "2026-01-01", ageConfirmed: true, acceptedAt: new Date("2026-01-01T10:00:00Z") } });

    expect(await termsNeededFor(id, "signup")).toBe(false);
    expect(await termsNeededFor(id, "booking")).toBe(true);
    expect(await termsNeededFor(id, "publish")).toBe(true);
    await expect(requireTermsFor(id, "booking", {})).rejects.toBeInstanceOf(TermsRequiredError);

    await requireTermsFor(id, "booking", TERMS_CONSENT);
    const latest = (await rows(id)).at(-1);
    expect(latest).toMatchObject({ version: TERMS_VERSION, ageConfirmed: true });
    expect(await termsNeededFor(id, "booking")).toBe(false);
    expect(await termsNeededFor(id, "publish")).toBe(false);
  });
});
