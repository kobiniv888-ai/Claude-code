import { randomBytes, randomInt } from "node:crypto";
import type { APIRequestContext } from "@playwright/test";
import { expect, openAs, openAsTestUser, test } from "./fixtures";
import { createTestListing, createTestUser, sql } from "./helpers/db";
import { openAddress, openPin, sealAddress, sealGuestPhone, sealPin } from "./helpers/field-crypto";

/**
 * Security checklist 5 + 6 (SECURITY_REPORT 5.b, 5.c, 5.e, 5.f, 6.c, 6.d, 6.f): no private data in
 * what the server sends — the rendered HTML, the React Server Components payload (`RSC: 1`, the
 * data inside the page), JSON APIs, the sitemap and the share image — for a visitor and for a
 * signed-in user who is neither the guest nor the host.
 *
 * Checked for every LIVE demo listing and for a test listing with known values:
 * - never the exact address, the exact coordinates (full precision, 6, 5 and 4 decimals), the
 *   host's phone (also as the site prints numbers: "+995 555 99 12 34", "050-123-4567", national
 *   digits; every body is also checked with the separators between digits removed), email or
 *   contact values;
 * - never an exact walking time: every walking time in the page data is a multiple of 5 minutes,
 *   no "meters" travel with it, and every text says "עד N דק׳" / "up to N min", never "≈ N"
 *   (founder's answers (b) and (3)); never a Chabad house walk (answer (2): no "chabadWalkMin",
 *   no "chabad" entry with minutes); at most 3 walking times for the test listing (answer (3));
 * - never the supermarket or stop picked around the pin (walk-trilat-1): only the ones picked
 *   around the public point;
 * - pages: listing pages and their share images, search (list and map), city and owner pages, the
 *   home page, the sitemap, the map API, a shared list page and its share image, and, signed in as
 *   another user, the compare page (its data comes from a server action);
 * - the trip page and the calendar file of a booking show the exact address only to its guest, and
 *   only until a week after check-out (6.f).
 *
 * Fake data only: test users (+995 555 99…, @e2e.bayit.invalid), a test listing in Mestia (no demo
 * listings there) and bookings whose message starts with "E2E " (the global cleanup removes them).
 */

type Leak = { label: string; value: string };

type DemoRow = {
  id: string;
  publicId: number;
  ownerId: string;
  slug: string;
  /** Decrypted here from addressEnc / pinEnc (the database holds them encrypted only: 12.3.c). */
  address: string | null;
  lat: number | null;
  lng: number | null;
  /** The stored ciphertexts: they must never reach a page either. */
  addressEnc: string | null;
  pinEnc: string | null;
  approxLat: number | null;
  approxLng: number | null;
  contactMethods: { value?: unknown }[] | null;
  email: string;
  phone: string | null;
};

/** The strings of a coordinate that would reveal it, minus those the public (offset) point shares. */
function coordinateForms(label: string, exact: number | null, approx: number | null): Leak[] {
  if (exact === null || !Number.isFinite(exact)) return [];
  // 4 decimals is about 11 m: still the building.
  const forms = new Set([String(exact), exact.toFixed(6), exact.toFixed(5), exact.toFixed(4)]);
  if (approx !== null) for (const digits of [4, 5, 6]) forms.delete(approx.toFixed(digits));
  if (approx !== null) forms.delete(String(approx));
  return [...forms].map((value) => ({ label, value }));
}

/**
 * A phone number in every form that would reveal it. leaksIn also checks each body with the
 * separators between digits removed, so "+995 555 99 12 34", "555 99 12 34" and "050-123-4567"
 * (the site's international and national spellings) are found through these digit forms.
 */
function phoneForms(label: string, phone: string | null | undefined): Leak[] {
  if (!phone) return [];
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 8) return [];
  const forms = new Set([phone, digits, digits.slice(-9)]);
  // The national number: Georgia without the country code ("555991234"), Israel with its 0 ("0501234567").
  if (digits.startsWith("995")) forms.add(digits.slice(3));
  if (digits.startsWith("972")) forms.add(`0${digits.slice(3)}`);
  return [...forms].map((value) => ({ label, value }));
}

function secretsOf(row: DemoRow): Leak[] {
  const secrets: Leak[] = [
    ...coordinateForms(`#${row.publicId} exact lat`, row.lat, row.approxLat),
    ...coordinateForms(`#${row.publicId} exact lng`, row.lng, row.approxLng),
    ...phoneForms(`#${row.publicId} owner phone`, row.phone),
  ];
  if (row.address && row.address.trim().length >= 8) secrets.push({ label: `#${row.publicId} address`, value: row.address.trim() });
  for (const [label, sealed] of [["address ciphertext", row.addressEnc], ["pin ciphertext", row.pinEnc]] as const) {
    if (sealed) secrets.push({ label: `#${row.publicId} ${label}`, value: sealed.split(":")[2]!.slice(0, 24) });
  }
  if (row.email) secrets.push({ label: `#${row.publicId} owner email`, value: row.email });
  for (const method of row.contactMethods ?? []) {
    const value = typeof method?.value === "string" ? method.value.trim() : "";
    if (!value) continue;
    if (/^\+?[\d\s().-]{8,}$/.test(value)) secrets.push(...phoneForms(`#${row.publicId} contact value`, value));
    else if (value.length >= 5) secrets.push({ label: `#${row.publicId} contact value`, value });
  }
  return secrets;
}

/** Spaces, dots, dashes, brackets and direction marks between two digits ("+995 555 99-12-34"). */
const BETWEEN_DIGITS = /(?<=\d)[\s\u00a0().\-\u2066-\u2069\u200e\u200f]+(?=\d)/g;

/**
 * Every secret that appears in the body (JSON in the RSC payload escapes "/" and quotes only), as
 * written or once the separators between digits are removed (a phone printed for people).
 */
function leaksIn(body: string, secrets: Leak[]): string[] {
  const text = body.replace(/\\u002F/gi, "/").replace(/\\\//g, "/");
  const joined = text.replace(BETWEEN_DIGITS, "");
  return secrets
    .filter((s) => text.includes(s.value) || (/^\+?\d{8,}$/.test(s.value) && joined.includes(s.value)))
    .map((s) => `${s.label}: ${s.value}`);
}

/**
 * Walking times that are not public: a value under one of the walk keys that is not a multiple of
 * 5, a "meters" field, or any visible "≈ N min" (6.d; every walking time reads "up to N").
 */
function exactWalks(body: string): string[] {
  const problems: string[] = [];
  // Founder's answer (2): a Chabad house is never a listing's walking time (the community map has them).
  if (/\\?"chabadWalkMin\\?"/.test(body)) problems.push("a chabadWalkMin field");
  if (/\\?"chabad\\?":\s*\{[^{}]*?\\?"minutes\\?"/.test(body)) problems.push("a Chabad walk");
  const key = /\\?"(synagogueWalkMin|chabadWalkMin|seaWalkMinutes|liftWalkMinutes)\\?":\s*(\d+)/g;
  for (const match of body.matchAll(key)) if (Number(match[2]) % 5 !== 0) problems.push(`${match[1]}=${match[2]}`);
  const kindMinutes = /\\?"kind\\?":\s*\\?"(sea|lift|synagogue|chabad)\\?",\s*\\?"(?:name\\?":[^}]*?,\s*\\?")?minutes\\?":\s*(\d+)/g;
  for (const match of body.matchAll(kindMinutes)) if (Number(match[2]) % 5 !== 0) problems.push(`${match[1]} minutes=${match[2]}`);
  const nearbyMinutes = /\\?"(synagogue|chabad|supermarket|transport)\\?":\s*\{[^{}]*?\\?"minutes\\?":\s*(\d+)/g;
  for (const match of body.matchAll(nearbyMinutes)) if (Number(match[2]) % 5 !== 0) problems.push(`nearby ${match[1]} minutes=${match[2]}`);
  if (/\\?"meters\\?":\s*\d/.test(body)) problems.push("a meters field");
  const plain = body.replace(/[\u2066-\u2069\u200e\u200f]/g, "");
  for (const match of plain.matchAll(/≈\s*(\d+)\s*(?:דק|min|мин|დ|წთ|წუთ|د)/g)) problems.push(`shown "${match[0]}"`);
  return problems;
}

async function fetchBoth(request: APIRequestContext, path: string): Promise<{ html: string; rsc: string; status: number }> {
  const page = await request.get(path, { maxRedirects: 5 });
  const html = await page.text();
  // Next 16 answers an RSC request without its "_rsc" query with a redirect that adds it.
  const flight = await request.get(`${path}${path.includes("?") ? "&" : "?"}_rsc`, { headers: { RSC: "1" }, maxRedirects: 5 });
  const rsc = await flight.text();
  return { html, rsc, status: page.status() };
}

async function demoListings(): Promise<DemoRow[]> {
  const rows = await sql<Omit<DemoRow, "address" | "lat" | "lng">>(
    `SELECT l.id, l."publicId", l."ownerId", c.slug, l."addressEnc", l."pinEnc", l."approxLat", l."approxLng",
            l."contactMethods", u.email, u."phoneNumber" AS phone
     FROM "Listing" l JOIN "City" c ON c.id = l."cityId" JOIN "User" u ON u.id = l."ownerId"
     WHERE l."isDemo" AND l.status = 'LIVE' AND l."deletedAt" IS NULL ORDER BY l."publicId"`,
  );
  // The exact address and pin, opened with the test keys (the same code as the server).
  return rows.map((row) => {
    const pin = openPin(row.pinEnc);
    return { ...row, address: openAddress(row.addressEnc), lat: pin?.lat ?? null, lng: pin?.lng ?? null };
  });
}

/**
 * A shared list (owned by a test user) holding these listings; returns its link token. The global
 * cleanup removes the test user, and the list and its saves with it.
 */
async function sharedListOf(listingIds: string[]): Promise<string> {
  const owner = await createTestUser({ name: "E2E Exposure List Owner" });
  const token = `e2e${randomBytes(20).toString("hex")}`.slice(0, 43);
  const listId = `e2e-list-${randomBytes(6).toString("hex")}`;
  await sql(
    `INSERT INTO "SavedList" (id, "userId", name, "isDefault", "shareToken", "sharedAt", "createdAt", "updatedAt")
     VALUES ($1, $2, 'E2E exposure list', false, $3, now(), now(), now())`,
    [listId, owner.id, token],
  );
  for (const listingId of listingIds) {
    await sql(`INSERT INTO "Favorite" (id, "userId", "listingId", "listId", "createdAt") VALUES ($1, $2, $3, $4, now())`, [
      `e2e-fav-${randomBytes(6).toString("hex")}`,
      owner.id,
      listingId,
      listId,
    ]);
  }
  return token;
}

const BOOKING_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const bookingCode = () => `BT-${Array.from({ length: 5 }, () => BOOKING_ALPHABET[randomInt(BOOKING_ALPHABET.length)]).join("")}`;

function day(offset: number): string {
  // Georgia's day (UTC+4), as the site counts it.
  const date = new Date(Date.now() + 4 * 3_600_000);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

/**
 * A test listing in Mestia (a ski town) with known private values and exact walking times: the
 * lifts 12, the synagogue 7, a Chabad house 4 (never shown, answer (2)), the stop 8 and the shop 3
 * around the public point. At most 3 walks reach the page (answer (3)): lifts → "עד 15", synagogue
 * → 10, stop → 10; the shop (last in the order) is left out.
 */
async function exposureListing() {
  const host = await createTestUser({ name: "E2E Exposure Host" });
  const listing = await createTestListing({ ownerId: host.id, title: "E2E data exposure flat" });
  const [city] = await sql<{ lat: number; lng: number }>(`SELECT lat, lng FROM "City" WHERE slug = 'mestia'`);
  const exact = { lat: Number((city.lat + 0.0023417).toFixed(7)), lng: Number((city.lng - 0.0031829).toFixed(7)) };
  const hostContact = `+99555599${String(randomInt(0, 10_000)).padStart(4, "0")}`;
  const address = `E2E ${randomBytes(3).toString("hex")} Exposure Lane 17, Mestia`;
  await sql(
    `UPDATE "Listing" SET "pinEnc" = $2, "addressEnc" = $3, "approxLat" = $4, "approxLng" = $5,
       "contactMethods" = $6::jsonb, "synagogueWalkMin" = 7, "chabadWalkMin" = 13, "seaWalkMinutes" = NULL, "liftWalkMinutes" = 12,
       nearby = $7::jsonb WHERE id = $1`,
    [
      listing.id,
      // Stored encrypted, as the site stores them (12.3.c).
      sealPin(exact),
      sealAddress(address),
      city.lat,
      city.lng,
      JSON.stringify([{ channel: "WHATSAPP", value: hostContact, order: 0 }]),
      JSON.stringify({
        // A Chabad house is never a listing's walk (answer (2)), even in an old row.
        chabad: { id: "e2e-chabad-house", name: { he: "E2E Chabad House", en: "E2E Chabad House" }, minutes: 4, meters: 260 },
        // Picked around the pin: staff only (walk-trilat-1), never on a page.
        supermarket: { minutes: 1, meters: 60, name: "E2E Pin Market" },
        transport: { kind: "tram", minutes: 2, meters: 110, name: "E2E Pin Stop" },
        // Picked around the public point: what the page shows.
        public: {
          supermarket: { minutes: 3, meters: 210, name: "E2E Market" },
          transport: { kind: "bus", minutes: 8, meters: 590, name: "E2E Stop" },
        },
        airport: { code: "TBS", km: 23.4 },
      }),
    ],
  );
  const secrets: Leak[] = [
    { label: "test address", value: address },
    ...coordinateForms("test exact lat", exact.lat, city.lat),
    ...coordinateForms("test exact lng", exact.lng, city.lng),
    ...phoneForms("test host contact", hostContact),
    ...phoneForms("test host phone", host.phone),
    { label: "supermarket picked around the pin", value: "E2E Pin Market" },
    { label: "stop picked around the pin", value: "E2E Pin Stop" },
    { label: "a Chabad house walk (answer (2))", value: "E2E Chabad House" },
    { label: "a fourth walk (answer (3): the shop is left out)", value: "E2E Market" },
  ];
  return { host, listing, address, exact, hostContact, secrets };
}

test.describe("data exposure (SECURITY_REPORT 5.c)", () => {
  test("a visitor gets no exact address, coordinates, contacts or walking times from any public page, payload or API", async ({ request }) => {
    test.slow();
    const rows = await demoListings();
    expect(rows.length, "the demo listings (npm run db:seed)").toBeGreaterThan(0);
    const secrets = rows.flatMap(secretsOf);
    const own = await exposureListing();
    secrets.push(...own.secrets);

    const leaks: string[] = [];
    const walks: string[] = [];
    const check = (where: string, body: string) => {
      for (const leak of leaksIn(body, secrets)) leaks.push(`${where} → ${leak}`);
      for (const walk of exactWalks(body)) walks.push(`${where} → ${walk}`);
    };

    // Each listing page (HTML + page data) in Hebrew and English, and its share image.
    for (const publicId of [...rows.map((r) => r.publicId), own.listing.publicId]) {
      for (const locale of ["he", "en"]) {
        const { html, rsc, status } = await fetchBoth(request, `/${locale}/listing/${publicId}`);
        expect(status, `/${locale}/listing/${publicId}`).toBe(200);
        check(`/${locale}/listing/${publicId}`, html);
        check(`/${locale}/listing/${publicId} (RSC)`, rsc);
        if (locale === "he") {
          const og = html.match(/<meta property="og:image" content="([^"]+)"/)?.[1];
          expect(og, `og:image of #${publicId}`).toBeTruthy();
          const image = await request.get(new URL(og!.replace(/&amp;/g, "&")).pathname);
          expect(image.status(), `share image of #${publicId}`).toBe(200);
          expect(image.headers()["content-type"]).toMatch(/^image\//);
        }
      }
    }

    // Search (list and map), city pages, owner pages, home, sitemap and the map API.
    const cities = [...new Set([...rows.map((r) => r.slug), "mestia"])];
    for (const slug of cities) {
      for (const path of [`/he/search?city=${slug}`, `/he/search?city=${slug}&view=map`, `/en/search?city=${slug}`, `/he/${slug}`]) {
        const { html, rsc } = await fetchBoth(request, path);
        check(path, html);
        check(`${path} (RSC)`, rsc);
      }
    }
    for (const ownerId of [...new Set([...rows.map((r) => r.ownerId), own.host.id])]) {
      const { html, rsc } = await fetchBoth(request, `/he/owner/${ownerId}`);
      check(`/he/owner/${ownerId}`, html);
      check(`/he/owner/${ownerId} (RSC)`, rsc);
    }
    for (const path of ["/he", "/en", "/sitemap.xml", "/api/map/community", "/api/places/search?q=tbilisi"]) {
      const response = await request.get(path);
      check(path, await response.text());
    }

    // A shared list with every checked listing in it, and its share image.
    const token = await sharedListOf([...rows.map((r) => r.id), own.listing.id]);
    const list = await fetchBoth(request, `/he/lists/${token}`);
    expect(list.status, "the shared list page").toBe(200);
    check(`/he/lists/${token}`, list.html);
    check(`/he/lists/${token} (RSC)`, list.rsc);
    const listOg = list.html.match(/<meta property="og:image" content="([^"]+)"/)?.[1];
    expect(listOg, "og:image of the shared list").toBeTruthy();
    const listImage = await request.get(new URL(listOg!.replace(/&amp;/g, "&")).pathname);
    expect(listImage.status(), "the shared list's share image").toBe(200);
    expect(listImage.headers()["content-type"]).toMatch(/^image\//);

    expect(leaks, "private values in public responses").toEqual([]);
    expect(walks, "exact walking times in public responses").toEqual([]);

    // The test listing's walks reach the page rounded and as "up to", at most 3 of them (answer
    // (3)): the lifts 12 → "עד 15", the bus stop 8 → "עד 10 דק׳" (picked around the public point,
    // never the pin's); the shop (the 4th) and the Chabad house never.
    const page = await request.get(`/he/listing/${own.listing.publicId}`);
    const text = (await page.text()).replace(/[\u2066-\u2069\u200e\u200f]/g, "");
    expect(text).toContain("עד 15 דקות הליכה למעליות הסקי");
    expect(text).toContain("עד 10 דק׳ הליכה");
    expect(text).toContain("E2E Stop");
    expect(text).not.toContain("E2E Market");
    expect(text).not.toContain("E2E Chabad House");
    expect(text).not.toMatch(/≈ \d+ דק׳/);
    const listingRsc = (await fetchBoth(request, `/he/listing/${own.listing.publicId}`)).rsc;
    expect(listingRsc).not.toMatch(/\\?"liftWalkMinutes\\?":\s*12\b/);
    expect(listingRsc).not.toMatch(/E2E Market|E2E Chabad House|chabadWalkMin/);
    // The card data carries the rounded synagogue walk (7 → 10), never the exact 7.
    const searchRsc = (await fetchBoth(request, "/he/search?city=mestia")).rsc;
    expect(searchRsc).toMatch(/\\?"synagogueWalkMin\\?":\s*10\b/);
    expect(searchRsc).not.toMatch(/\\?"synagogueWalkMin\\?":\s*7\b/);
  });

  test("another signed-in user, and the guest after the stay, get no exact address or host contacts (6.f)", async ({ browser }) => {
    test.slow();
    const own = await exposureListing();
    const guest = await createTestUser({ name: "E2E Exposure Guest" });
    const stranger = await createTestUser({ name: "E2E Exposure Stranger" });
    const phone = sealGuestPhone(guest.phone);
    const insert = async (checkIn: string, checkOut: string, status: "CONFIRMED" | "COMPLETED") => {
      const code = bookingCode();
      const nights = Math.round((Date.parse(checkOut) - Date.parse(checkIn)) / 86_400_000);
      await sql(
        `INSERT INTO "Booking" (id, code, "listingId", "guestUserId", "hostUserId", "checkIn", "checkOut", nights, adults,
           "nightlyPrice", subtotal, total, currency, "cancellationPolicy", status, "guestName", "guestPhoneEnc", "guestPhoneLookup", locale,
           "rulesAcceptedAt", "messageToHost", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, $6::date, $7::date, $8, 2, 80, $9, $9, 'USD', 'MODERATE', $10::"BookingStatus", 'E2E Guest', $11, $12, 'he',
           now(), 'E2E data exposure test', now())`,
        [
          `e2e${randomBytes(8).toString("hex")}`,
          code,
          own.listing.id,
          guest.id,
          own.host.id,
          checkIn,
          checkOut,
          nights,
          80 * nights,
          status,
          // The guest's phone, stored encrypted with its lookup value (12.3.c).
          phone.guestPhoneEnc,
          phone.guestPhoneLookup,
        ],
      );
      return code;
    };
    const current = await insert(day(-1), day(2), "CONFIRMED");
    // Still CONFIRMED (the nightly job has not completed it): only the date closes the window.
    const past = await insert(day(-12), day(-8), "CONFIRMED");
    const secrets = [...own.secrets, ...phoneForms("guest phone", guest.phone)];

    // The guest during the stay: the address is there (the test can see it when it should).
    const asGuest = await openAsTestUser(browser, guest);
    try {
      const during = await asGuest.context.request.get(`/he/account/trips/${current}`);
      expect(await during.text()).toContain(own.address);
      // A week after check-out: hidden again, with the explanation; no calendar file.
      const after = await fetchBoth(asGuest.context.request, `/he/account/trips/${past}`);
      expect(after.status).toBe(200);
      expect(leaksIn(after.html, own.secrets)).toEqual([]);
      expect(leaksIn(after.rsc, own.secrets)).toEqual([]);
      await asGuest.page.goto(`/he/account/trips/${past}`);
      await expect(asGuest.page.locator("main").getByText("הכתובת המדויקת ופרטי הקשר של המארח מוצגים עד שבוע אחרי סוף השהות")).toBeVisible();
      await expect(asGuest.page.locator("main").getByText(own.address)).toHaveCount(0);
      const ics = await asGuest.context.request.get(`/api/ical/booking/${past}.ics`);
      expect(ics.status()).toBe(404);
      expect(leaksIn(await ics.text(), own.secrets)).toEqual([]);
    } finally {
      await asGuest.context.close();
    }

    // Another account: neither booking, nor the calendar file, nor anything in its own export.
    const other = await openAsTestUser(browser, stranger);
    try {
      for (const code of [current, past]) {
        const trip = await fetchBoth(other.context.request, `/he/account/trips/${code}`);
        expect(leaksIn(trip.html, secrets), `trip ${code} as another user`).toEqual([]);
        expect(leaksIn(trip.rsc, secrets), `trip ${code} RSC as another user`).toEqual([]);
        const ics = await other.context.request.get(`/api/ical/booking/${code}.ics`);
        expect(ics.status()).toBeGreaterThanOrEqual(400);
        expect(leaksIn(await ics.text(), secrets)).toEqual([]);
      }
      const listing = await fetchBoth(other.context.request, `/he/listing/${own.listing.publicId}`);
      expect(leaksIn(listing.html, secrets)).toEqual([]);
      expect(leaksIn(listing.rsc, secrets)).toEqual([]);
      expect(exactWalks(listing.rsc)).toEqual([]);
      const exported = await other.context.request.get("/api/account/export");
      expect(exported.status()).toBe(200);
      expect(leaksIn(await exported.text(), secrets)).toEqual([]);

      // The compare page: its rows come from a server action (compareItemsAction) after load.
      await other.page.addInitScript((id) => window.localStorage.setItem("bayit:compare", JSON.stringify([id])), own.listing.publicId);
      const answered = other.page.waitForResponse(
        (response) => response.request().method() === "POST" && new URL(response.url()).pathname.endsWith("/account/compare"),
      );
      await other.page.goto("/he/account/compare");
      const answer = await (await answered).text();
      expect(answer, "the compare answer carries the test listing").toContain(String(own.listing.publicId));
      await other.page.waitForLoadState("networkidle");
      const compareBodies = [await other.page.content(), answer];
      for (const body of compareBodies) {
        expect(leaksIn(body, secrets), "compare page").toEqual([]);
        expect(exactWalks(body), "compare page walks").toEqual([]);
      }
    } finally {
      await other.context.close();
    }

    // Signed out: the trip pages and calendar files say nothing.
    const visitor = await openAs(browser, null);
    try {
      for (const code of [current, past]) {
        const trip = await visitor.context.request.get(`/he/account/trips/${code}`);
        expect(leaksIn(await trip.text(), secrets)).toEqual([]);
        const ics = await visitor.context.request.get(`/api/ical/booking/${code}.ics`);
        expect(ics.status()).toBe(401);
      }
    } finally {
      await visitor.context.close();
    }
  });

  // SECURITY_REPORT 12.3.c: an encrypted address that cannot be opened (a changed ciphertext, a
  // missing key) fails CLOSED: the guest's own trip page answers normally, shows "not available"
  // instead of the address and the map, never the ciphertext, and a security event is written.
  test("an exact address that cannot be decrypted: 'not available' on the trip page, no crash, no ciphertext (12.3.c)", async ({ browser }) => {
    test.slow();
    const own = await exposureListing();
    const [stored] = await sql<{ addressEnc: string; pinEnc: string }>(`SELECT "addressEnc", "pinEnc" FROM "Listing" WHERE id = $1`, [own.listing.id]);
    // Flip one character of the sealed address: GCM refuses it (tampered).
    const last = stored.addressEnc.slice(-1);
    const tampered = `${stored.addressEnc.slice(0, -1)}${last === "A" ? "B" : "A"}`;
    await sql(`UPDATE "Listing" SET "addressEnc" = $2 WHERE id = $1`, [own.listing.id, tampered]);
    const [{ since }] = await sql<{ since: Date }>(`SELECT now() AS since`);

    const guest = await createTestUser({ name: "E2E Undecryptable Guest" });
    const phone = sealGuestPhone(guest.phone);
    const code = bookingCode();
    await sql(
      `INSERT INTO "Booking" (id, code, "listingId", "guestUserId", "hostUserId", "checkIn", "checkOut", nights, adults,
         "nightlyPrice", subtotal, total, currency, "cancellationPolicy", status, "guestName", "guestPhoneEnc", "guestPhoneLookup", locale,
         "rulesAcceptedAt", "messageToHost", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6::date, $7::date, 3, 2, 80, 240, 240, 'USD', 'MODERATE', 'CONFIRMED', 'E2E Guest', $8, $9, 'he',
         now(), 'E2E undecryptable address', now())`,
      [`e2e${randomBytes(8).toString("hex")}`, code, own.listing.id, guest.id, own.host.id, day(-1), day(2), phone.guestPhoneEnc, phone.guestPhoneLookup],
    );

    const asGuest = await openAsTestUser(browser, guest);
    try {
      const trip = await fetchBoth(asGuest.context.request, `/he/account/trips/${code}`);
      expect(trip.status).toBe(200);
      for (const body of [trip.html, trip.rsc]) {
        expect(body).not.toContain(own.address);
        // Neither the stored ciphertexts nor a piece of them reach the page.
        for (const sealed of [tampered, stored.pinEnc]) expect(body).not.toContain(sealed.split(":")[2]!.slice(0, 24));
      }
      await asGuest.page.goto(`/he/account/trips/${code}`);
      await expect(asGuest.page.locator("main").getByText("לא הצלחנו להציג את הכתובת המדויקת כרגע")).toBeVisible();
      // The rest of the trip page still works (the booking number is there), and no map of the pin.
      await expect(asGuest.page.locator("main")).toContainText(code);
      await expect(asGuest.page.locator("main").getByRole("link", { name: /Google Maps|Waze/ })).toHaveCount(0);
    } finally {
      await asGuest.context.close();
    }
    const [{ events }] = await sql<{ events: string }>(
      // The event is written at most once a minute per field, reason and place: a retry within the
      // minute finds the first attempt's event.
      `SELECT count(*)::text AS events FROM "SecurityEvent"
       WHERE type = 'field_decrypt_failed' AND "createdAt" >= $1::timestamptz - interval '2 minutes' AND meta->>'field' = 'listing.address'`,
      [since],
    );
    expect(Number(events)).toBeGreaterThanOrEqual(1);
  });
});
