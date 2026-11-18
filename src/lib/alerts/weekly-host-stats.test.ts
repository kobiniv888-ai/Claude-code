/**
 * The weekly host stats email against the local database: who gets it, once per host per week,
 * quiet weeks skipped, the switch in notificationPrefs (and the one-tap unsubscribe). Emails are
 * captured, not sent. Creates its own users, city and listings with a unique prefix and removes
 * them afterwards.
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { sealGuestPhone, sealPin } from "@/lib/field-crypto";

vi.mock("server-only", () => ({}));
const sent = vi.hoisted(() => ({ emails: [] as { to: string; template: string; locale: string; data: Record<string, unknown> }[], fail: false }));
vi.mock("@/lib/email", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/email")>();
  return {
    ...real,
    sendEmail: vi.fn(async (input: { to: string; template: string; locale: string; data: Record<string, unknown> }) => {
      if (sent.fail) return { ok: false, delivery: "failed" };
      sent.emails.push(input);
      return { ok: true, delivery: "logged" };
    }),
  };
});

const { db } = await import("@/lib/db");
const { runWeeklyHostStats, CLAIM_PREFIX } = await import("./weekly-host-stats");
const { setWeeklyStatsEmail, weeklyStatsEmailOn } = await import("./unsubscribe-server");
const { verifyUnsubscribeToken } = await import("./unsubscribe-token");
const { dayToDate } = await import("@/lib/booking/dates");

const prefix = `wk${randomUUID().replace(/-/g, "").slice(0, 10)}`;
const ids = { city: "", users: [] as string[] };
// Sunday 8 Nov 2026, 09:30 in Israel: the week of 1–7 Nov.
const SUNDAY = new Date("2026-11-08T07:30:00Z");
const never = () => false;
const run = (host: string, now = SUNDAY) => runWeeklyHostStats(now, { isRestTime: never, onlyHostId: host });

async function createHost(name: string, opts: { locale?: "he" | "en"; prefs?: object; isDemo?: boolean; email?: boolean } = {}) {
  const id = `${prefix}${name}`;
  await db.user.create({
    data: {
      id,
      name: `Test ${name}`,
      firstName: name,
      email: opts.email === false ? `${id}@phone.bayit.invalid` : `${id}@example.com`,
      phoneNumber: `+99559${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}`,
      phoneNumberVerified: true,
      locale: opts.locale ?? "he",
      isDemo: opts.isDemo ?? false,
      notificationPrefs: opts.prefs as never,
    },
  });
  ids.users.push(id);
  return id;
}

async function createListing(ownerId: string, opts: { isDemo?: boolean; dealType?: "SHORT_STAY" | "MONTHLY_RENT"; status?: "LIVE" | "PAUSED" } = {}) {
  return db.listing.create({
    data: {
      ownerId,
      status: opts.status ?? "LIVE",
      isDemo: opts.isDemo ?? false,
      dealType: opts.dealType ?? "SHORT_STAY",
      propertyType: "APARTMENT",
      pricePeriod: opts.dealType === "MONTHLY_RENT" ? "MONTH" : "NIGHT",
      cityId: ids.city,
      pinEnc: sealPin({ lat: 41.7, lng: 44.8 }),
      originalLocale: "he",
      title: `${prefix} דירה`,
      description: "A test listing for the weekly email tests.",
      price: 50,
      currency: "GEL",
      publishedAt: new Date(),
    },
  });
}

async function addWeek(listingId: string, days: { day: string; views?: number; saves?: number; contacts?: number }[]) {
  await db.listingStatDaily.createMany({
    data: days.map((d) => ({ listingId, date: dayToDate(d.day), views: d.views ?? 0, saves: d.saves ?? 0, contacts: d.contacts ?? 0 })),
  });
}

beforeAll(async () => {
  const city = await db.city.create({
    data: { slug: `${prefix}-city`, names: { he: "עיר", en: "City", ru: "Город", ar: "مدينة", ka: "ქალაქი" }, searchText: "city", lat: 41.7, lng: 44.8 },
  });
  ids.city = city.id;
});

afterAll(async () => {
  await db.rateLimit.deleteMany({ where: { OR: ids.users.map((id) => ({ key: { contains: id } })) } });
  await db.user.deleteMany({ where: { id: { in: ids.users } } });
  await db.city.deleteMany({ where: { id: ids.city } });
  await db.$disconnect();
});

beforeEach(() => {
  sent.emails = [];
  sent.fail = false;
});

describe("weekly host stats email", () => {
  it("sends the week's numbers once, in the host's language, with a signed unsubscribe link", async () => {
    const host = await createHost("dana", { locale: "he" });
    const stay = await createListing(host);
    const monthly = await createListing(host, { dealType: "MONTHLY_RENT" });
    await addWeek(stay.id, [
      { day: "2026-11-01", views: 70, saves: 5 },
      { day: "2026-11-07", views: 30, saves: 1, contacts: 2 },
      { day: "2026-11-08", views: 999 }, // the new week: not in this email
      { day: "2026-10-31", views: 999 }, // the week before
    ]);
    await addWeek(monthly.id, [{ day: "2026-11-03", views: 20, saves: 2 }]);
    await db.booking.create({
      data: {
        code: `WK-${prefix.slice(2, 8).toUpperCase()}`,
        listingId: stay.id,
        hostUserId: host,
        guestUserId: host, // any account; only the host's bookings count
        checkIn: dayToDate("2026-11-20"),
        checkOut: dayToDate("2026-11-23"),
        nights: 3,
        adults: 2,
        nightlyPrice: 50,
        subtotal: 150,
        total: 150,
        currency: "GEL",
        cancellationPolicy: "FLEXIBLE",
        guestName: "Guest",
        ...sealGuestPhone("+995555000222"),
        locale: "he",
        rulesAcceptedAt: new Date(),
        createdAt: new Date("2026-11-03T10:00:00Z"),
      },
    });

    const result = await run(host);
    expect(result).toMatchObject({ status: "ran", week: "2026-11-08", hosts: 1, sent: 1 });
    expect(sent.emails).toHaveLength(1);
    const email = sent.emails[0];
    expect(email).toMatchObject({ to: `${host}@example.com`, template: "weekly_host_stats", locale: "he" });
    expect(email.data).toMatchObject({
      name: "dana",
      fromDay: "2026-11-01",
      toDay: "2026-11-07",
      totals: { views: 120, saves: 8, contacts: 2, bookings: 1 },
      bookable: true,
      moreListings: 0,
    });
    const listings = email.data.listings as { publicId: number; views: number; bookable: boolean; statsUrl: string }[];
    expect(listings.map((l) => [l.publicId, l.views, l.bookable])).toEqual([
      [stay.publicId, 100, true],
      [monthly.publicId, 20, false],
    ]);
    expect(listings[0].statsUrl).toBe(`/account/listings/${stay.id}/stats?days=7&to=${email.data.toDay}`);
    const token = decodeURIComponent(String(email.data.unsubscribeUrl).split("t=")[1]);
    expect(verifyUnsubscribeToken(token)).toEqual({ userId: host, kind: "weekly_stats" });

    // Every later run that week (another hour, the next day, a second server) sends nothing.
    expect(await run(host, new Date("2026-11-08T08:30:00Z"))).toMatchObject({ status: "ran", sent: 0, already: 1 });
    expect(await run(host, new Date("2026-11-09T07:30:00Z"))).toMatchObject({ status: "not_due_day" });
    expect(sent.emails).toHaveLength(1);
    const claim = await db.rateLimit.findUnique({ where: { key: `${CLAIM_PREFIX}2026-11-08:${host}` } });
    expect(claim?.count).toBe(1);
  });

  it("does nothing outside Sunday 09:00–11:59 Israel time", async () => {
    const host = await createHost("early");
    const listing = await createListing(host);
    await addWeek(listing.id, [{ day: "2026-11-02", views: 3 }]);
    expect(await run(host, new Date("2026-11-08T06:30:00Z"))).toMatchObject({ status: "too_early" });
    expect(await run(host, new Date("2026-11-08T10:30:00Z"))).toMatchObject({ status: "too_late" });
    expect(sent.emails).toHaveLength(0);
  });

  it("skips quiet weeks, hosts who turned it off, demo accounts and hosts with only demo or paused listings", async () => {
    const quiet = await createHost("quiet");
    await createListing(quiet);
    expect(await run(quiet)).toMatchObject({ status: "ran", hosts: 1, quiet: 1, sent: 0 });

    const off = await createHost("off", { prefs: { email: { listing: true, weeklyStats: false } } });
    const offListing = await createListing(off);
    await addWeek(offListing.id, [{ day: "2026-11-02", views: 3 }]);
    expect(await run(off)).toMatchObject({ status: "ran", hosts: 1, off: 1, sent: 0 });

    const noEmail = await createHost("phoneonly", { email: false });
    const noEmailListing = await createListing(noEmail);
    await addWeek(noEmailListing.id, [{ day: "2026-11-02", views: 3 }]);
    expect(await run(noEmail)).toMatchObject({ status: "ran", noEmail: 1, sent: 0 });

    const demoHost = await createHost("demohost", { isDemo: true });
    const demoListing = await createListing(demoHost);
    await addWeek(demoListing.id, [{ day: "2026-11-02", views: 3 }]);
    expect(await run(demoHost)).toMatchObject({ status: "ran", hosts: 0 });

    const demoOnly = await createHost("demoonly");
    const demo = await createListing(demoOnly, { isDemo: true });
    await addWeek(demo.id, [{ day: "2026-11-02", views: 3 }]);
    await createListing(demoOnly, { status: "PAUSED" });
    expect(await run(demoOnly)).toMatchObject({ status: "ran", hosts: 0 });
    expect(sent.emails).toHaveLength(0);
  });

  it("tries again on the next run when the email could not be sent", async () => {
    const host = await createHost("retry", { locale: "en" });
    const listing = await createListing(host);
    await addWeek(listing.id, [{ day: "2026-11-05", views: 4 }]);
    sent.fail = true;
    expect(await run(host)).toMatchObject({ status: "ran", failed: 1 });
    sent.fail = false;
    expect(await run(host, new Date("2026-11-08T08:30:00Z"))).toMatchObject({ status: "ran", sent: 1 });
    expect(sent.emails).toHaveLength(1);
  });

  it("a Yom Tov Sunday moves it to Monday, for the same week", async () => {
    const host = await createHost("yomtov");
    const listing = await createListing(host);
    await addWeek(listing.id, [{ day: "2026-11-04", views: 9 }]);
    const sundayHoliday = (at: Date) => at.toISOString().startsWith("2026-11-08");
    expect(await runWeeklyHostStats(SUNDAY, { isRestTime: sundayHoliday, onlyHostId: host })).toMatchObject({ status: "not_due_day" });
    expect(await runWeeklyHostStats(new Date("2026-11-09T07:30:00Z"), { isRestTime: sundayHoliday, onlyHostId: host })).toMatchObject({
      status: "ran",
      week: "2026-11-08",
      sent: 1,
    });
    expect(sent.emails[0].data).toMatchObject({ fromDay: "2026-11-01", toDay: "2026-11-07" });
  });
});

describe("bounces, complaints and stuck claims (weekly-1, claim-1)", () => {
  it("sends no digest to an address paused after a bounce or a spam complaint", async () => {
    const host = await createHost("paused");
    await db.user.update({
      where: { id: host },
      data: { notificationPrefs: { alerts: { email: { failing: { reason: "complained", since: "2026-11-01T10:00:00Z", address: `${host}@example.com` } } } } },
    });
    const listing = await createListing(host);
    await addWeek(listing.id, [{ day: "2026-11-03", views: 5 }]);
    const result = await run(host);
    expect(result).toMatchObject({ status: "ran", paused: 1, sent: 0 });
    expect(sent.emails).toHaveLength(0);
  });

  it("carries a one-click List-Unsubscribe header to /api/unsubscribe with the signed token", async () => {
    const host = await createHost("headers");
    const listing = await createListing(host);
    await addWeek(listing.id, [{ day: "2026-11-03", views: 5 }]);
    await run(host);
    const headers = (sent.emails[0] as unknown as { headers: Record<string, string> }).headers;
    expect(headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    const url = /^<(.+)>$/.exec(headers["List-Unsubscribe"])?.[1] ?? "";
    expect(new URL(url).pathname).toBe("/api/unsubscribe");
    expect(verifyUnsubscribeToken(new URL(url).searchParams.get("t"))).toEqual({ userId: host, kind: "weekly_stats" });
  });

  it("a stale claim whose email is already in the outbox is settled, not sent again", async () => {
    const host = await createHost("stuck");
    const listing = await createListing(host);
    await addWeek(listing.id, [{ day: "2026-11-03", views: 5 }]);
    // An earlier run claimed the host at 09:30, sent the email, and could not settle the claim.
    const key = `${CLAIM_PREFIX}2026-11-08:${host}`;
    await db.rateLimit.create({ data: { key, count: 0, resetAt: new Date(SUNDAY.getTime() + 8 * 24 * 3600_000) } });
    const outbox = await db.emailOutbox.create({
      data: { to: `${host}@example.com`, template: "weekly_host_stats", locale: "he", subject: "השבוע", html: "<p>x</p>", status: "LOGGED", createdAt: new Date(SUNDAY.getTime() + 1000) },
    });
    try {
      const result = await run(host, new Date(SUNDAY.getTime() + 3600_000));
      expect(result).toMatchObject({ status: "ran", sent: 0, already: 1 });
      expect(sent.emails).toHaveLength(0);
      expect((await db.rateLimit.findUniqueOrThrow({ where: { key } })).count).toBe(1);
    } finally {
      await db.emailOutbox.delete({ where: { id: outbox.id } });
    }
  });

  it("a stale claim without an email is taken over and sent once", async () => {
    const host = await createHost("stale");
    const listing = await createListing(host);
    await addWeek(listing.id, [{ day: "2026-11-03", views: 5 }]);
    const key = `${CLAIM_PREFIX}2026-11-08:${host}`;
    await db.rateLimit.create({ data: { key, count: 0, resetAt: new Date(SUNDAY.getTime() + 8 * 24 * 3600_000) } });
    expect(await run(host, new Date(SUNDAY.getTime() + 3600_000))).toMatchObject({ sent: 1 });
    expect(await run(host, new Date(SUNDAY.getTime() + 2 * 3600_000))).toMatchObject({ sent: 0, already: 1 });
    expect(sent.emails).toHaveLength(1);
  });
});

describe("the weekly email switch", () => {
  it("turns off and on again, keeping every other preference", async () => {
    const prefs = { email: { listing: false, marketing: true }, whatsapp: false, alerts: { email: { paused: true } } };
    const host = await createHost("switch", { prefs });
    expect(await weeklyStatsEmailOn(host)).toBe(true);
    expect(await setWeeklyStatsEmail(host, false)).toBe(true);
    expect(await weeklyStatsEmailOn(host)).toBe(false);
    const row = await db.user.findUnique({ where: { id: host }, select: { notificationPrefs: true } });
    expect(row?.notificationPrefs).toEqual({ ...prefs, email: { ...prefs.email, weeklyStats: false } });
    expect(await setWeeklyStatsEmail(host, true)).toBe(true);
    expect(await weeklyStatsEmailOn(host)).toBe(true);

    const empty = await createHost("emptyprefs");
    expect(await setWeeklyStatsEmail(empty, false)).toBe(true);
    expect((await db.user.findUnique({ where: { id: empty }, select: { notificationPrefs: true } }))?.notificationPrefs).toEqual({
      email: { weeklyStats: false },
    });
    expect(await setWeeklyStatsEmail(`${prefix}nobody`, false)).toBe(false);
    expect(await weeklyStatsEmailOn(`${prefix}nobody`)).toBeNull();
  });
});
