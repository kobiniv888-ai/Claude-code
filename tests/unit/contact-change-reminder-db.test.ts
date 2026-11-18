/**
 * S2 review TS-12 (SECURITY_REPORT 14.3.c) against the local database:
 * - the reminder before arrival carries the "contact details changed" warning while the trip page
 *   shows it (a listing whose contact details changed 2 days ago);
 * - a host whose listing has no phone-type contact method shows guests the ACCOUNT phone, so
 *   replacing that phone is a contact change: contactChangedAt is set and the guest is emailed.
 * Creates its own users (@example.com, +995 59… test numbers), city, listings and bookings, and
 * removes them afterwards.
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { sealAddress, sealPin } from "@/lib/field-crypto";

process.env.TWILIO_ACCOUNT_SID = "";
process.env.RESEND_API_KEY = "";

const sent = vi.hoisted(() => [] as { template: string; to: string; data: Record<string, unknown>; html?: string }[]);
vi.mock("server-only", () => ({}));
vi.mock("next-intl/server", async () => {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const { createTranslator } = await import("use-intl/core");
  return {
    getTranslations: async ({ locale, namespace }: { locale: string; namespace: string }) => {
      const messages = { [namespace]: JSON.parse(fs.readFileSync(path.join(process.cwd(), "messages", locale, `${namespace}.json`), "utf8")) };
      return createTranslator({ locale, messages, namespace });
    },
  };
});
vi.mock("@/lib/request", () => ({ getIpHash: async () => "test-ip" }));
vi.mock("@/lib/email", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/email")>();
  return {
    ...real,
    sendEmail: vi.fn(async (input: { template: string; to: string; locale: string; data: Record<string, unknown> }) => {
      const rendered = await real.renderEmail(input.template as never, input.locale as never, input.data as never);
      sent.push({ template: input.template, to: input.to, data: input.data, html: rendered.html });
      return { ok: true, delivery: "logged" as const };
    }),
  };
});
vi.mock("@/lib/sms", () => ({ isSmsConfigured: () => false, sendSms: vi.fn(async () => ({ ok: true, delivered: false })) }));

const { db } = await import("@/lib/db");
const { notifyBookingReminder } = await import("@/lib/booking/notify");
const { markAccountPhoneContactChange } = await import("@/lib/auth/phone-change");
const { addDays, dayToDate, tbilisiToday } = await import("@/lib/booking/dates");

const prefix = `ccr${randomUUID().replace(/-/g, "").slice(0, 10)}`;
const digits = String(Date.now() % 1_000_000).padStart(6, "0");
const users: string[] = [];
const ids = { city: "", host: "", guest: "" };
const today = tbilisiToday();
let seq = 0;

async function makeUser(name: string, last: string) {
  const id = `${prefix}-${name}`;
  await db.user.create({
    data: { id, name, firstName: name, email: `${id}@example.com`, phoneNumber: `+99559${digits}${last}`, phoneNumberVerified: true, locale: "en" },
  });
  users.push(id);
  return id;
}

async function listing(contactMethods: { channel: string; value: string; order: number }[], contactChangedAt: Date | null) {
  seq += 1;
  return db.listing.create({
    data: {
      ownerId: ids.host,
      status: "LIVE",
      dealType: "SHORT_STAY",
      propertyType: "APARTMENT",
      pricePeriod: "NIGHT",
      price: 100,
      currency: "USD",
      minStayNights: 1,
      maxGuests: 4,
      bookingMode: "INSTANT",
      cancellationPolicy: "MODERATE",
      paymentMethodsAtCheckIn: ["cash"],
      cityId: ids.city,
      pinEnc: sealPin({ lat: 41.71, lng: 44.77 }),
      addressEnc: sealAddress("1 Test Street, Tbilisi"),
      contactMethods,
      contactChangedAt,
      originalLocale: "en",
      title: `${prefix} flat ${seq}`,
      description: "A test listing.",
    },
  });
}

async function booking(listingId: string, from: number) {
  seq += 1;
  return db.booking.create({
    data: {
      code: `T-${prefix}-${seq}`,
      listingId,
      guestUserId: ids.guest,
      hostUserId: ids.host,
      status: "CONFIRMED",
      checkIn: dayToDate(addDays(today, from)),
      checkOut: dayToDate(addDays(today, from + 2)),
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

beforeAll(async () => {
  const city = await db.city.create({ data: { slug: `${prefix}-city`, names: { he: "עיר", en: "City", ru: "Город", ar: "مدينة", ka: "ქალაქი" }, searchText: "city", lat: 41.7, lng: 44.8 } });
  ids.city = city.id;
  ids.host = await makeUser("Host", "0");
  ids.guest = await makeUser("Guest", "1");
});

afterAll(async () => {
  await db.booking.deleteMany({ where: { hostUserId: ids.host } });
  await db.listing.deleteMany({ where: { ownerId: ids.host } });
  await db.emailOutbox.deleteMany({ where: { to: { in: users.map((id) => `${id}@example.com`) } } }).catch(() => {});
  await db.user.deleteMany({ where: { id: { in: users } } });
  await db.city.deleteMany({ where: { id: ids.city } });
});

describe("the reminder carries the contact-changed warning (TS-12)", () => {
  it("a listing whose contact details changed 2 days ago: the guest's reminder has the notice and the scam link", async () => {
    const changed = await listing([{ channel: "WHATSAPP", value: "+995555000001", order: 0 }], new Date(Date.now() - 2 * 24 * 3600 * 1000));
    const stay = await booking(changed.id, 2);
    sent.length = 0;
    await notifyBookingReminder(stay.id);
    const reminder = sent.find((e) => e.template === "booking_reminder_guest");
    expect(reminder?.data.contactChanged).toBe(true);
    expect(reminder?.html).toContain("recently changed their contact details");
    expect(reminder?.html).toMatch(/\/help\/report-scam\?booking=/);
  });

  it("no change (or an old one): no notice", async () => {
    const quiet = await listing([{ channel: "WHATSAPP", value: "+995555000002", order: 0 }], new Date(Date.now() - 30 * 24 * 3600 * 1000));
    const stay = await booking(quiet.id, 3);
    sent.length = 0;
    await notifyBookingReminder(stay.id);
    const reminder = sent.find((e) => e.template === "booking_reminder_guest");
    expect(reminder?.data.contactChanged).toBe(false);
    expect(reminder?.html).not.toContain("recently changed their contact details");
  });
});

describe("replacing the account phone is a contact change for listings that show it (TS-12)", () => {
  it("an EMAIL-only listing gets contactChangedAt and its guest the email; a listing with its own phone does not", async () => {
    const emailOnly = await listing([{ channel: "EMAIL", value: "host@example.com", order: 0 }], null);
    const ownPhone = await listing([{ channel: "PHONE", value: "+995555000003", order: 0 }], null);
    const a = await booking(emailOnly.id, 5);
    await booking(ownPhone.id, 6);
    sent.length = 0;
    const before = Date.now();
    const marked = await markAccountPhoneContactChange(ids.host);
    expect(marked).toContain(emailOnly.id);
    expect(marked).not.toContain(ownPhone.id);
    const rows = await db.listing.findMany({ where: { id: { in: [emailOnly.id, ownPhone.id] } }, select: { id: true, contactChangedAt: true } });
    expect(rows.find((r) => r.id === emailOnly.id)?.contactChangedAt?.getTime()).toBeGreaterThanOrEqual(before - 1000);
    expect(rows.find((r) => r.id === ownPhone.id)?.contactChangedAt).toBeNull();
    const notices = sent.filter((e) => e.template === "host_contact_changed_guest");
    expect(notices.some((e) => e.data.code === a.code && e.to === `${ids.guest}@example.com`)).toBe(true);
    expect(notices.every((e) => e.data.code !== undefined)).toBe(true);
  });
});
