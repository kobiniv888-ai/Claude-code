import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { createTranslator } from "use-intl/core";
import { locales } from "@/config/site";
import { siteUrl } from "@/lib/site-url";

vi.mock("server-only", () => ({}));

const translationErrors: unknown[] = [];
vi.mock("next-intl/server", () => ({
  getTranslations: async ({ locale, namespace }: { locale: string; namespace: string }) => {
    const file = path.join(process.cwd(), "messages", locale, `${namespace}.json`);
    const messages = { [namespace]: JSON.parse(fs.readFileSync(file, "utf8")) };
    return createTranslator({ locale, messages, namespace, onError: (e) => translationErrors.push(e) });
  },
}));

/** What the (mocked) Resend client was asked to send. */
const resendCalls = vi.hoisted(() => [] as Record<string, unknown>[]);
vi.mock("resend", () => ({
  Resend: class {
    emails = {
      send: async (payload: Record<string, unknown>) => {
        resendCalls.push(payload);
        return { data: { id: `re_${resendCalls.length}` }, error: null };
      },
    };
  },
}));

const outbox: Record<string, unknown>[] = [];
vi.mock("@/lib/db", () => ({
  db: { emailOutbox: { create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => outbox.push(data)) } },
}));

const { EMAIL_TEMPLATES, isPlaceholderEmail, notificationEmailFor, renderEmail, resendTags, sendEmail } = await import("./index");
type Data = import("./templates").EmailData;

const bookingStay = {
  code: "BT-7K3Q9",
  listingTitle: "Sunny flat in Vake",
  checkIn: "2026-11-12",
  checkOut: "2026-11-15",
  nights: 3,
  adults: 2,
  children: 1,
  infants: 1,
  total: 275,
  currency: "USD" as const,
  bookingUrl: "/account/bookings/BT-7K3Q9",
};

const samples: { [K in keyof Data]: Data[K] } = {
  login_code: { code: "482913", minutes: 5, name: "Dana" },
  welcome: { name: "Dana" },
  listing_live: { ownerName: "Dana", listingTitle: "Sunny flat in Vake", listingUrl: "/listing/1234-sunny-flat", expiresAt: "2026-12-30" },
  listing_in_review: { ownerName: "Dana", listingTitle: "Sunny flat in Vake" },
  listing_approved: { ownerName: "Dana", listingTitle: "Sunny flat in Vake", listingUrl: "/listing/1234-sunny-flat" },
  listing_needs_changes: {
    ownerName: "Dana",
    listingTitle: "Sunny flat in Vake",
    listingUrl: "/account/listings/abc/edit",
    reasonText: "Photos are too dark",
    note: "Please add a photo of the kitchen.",
  },
  listing_rejected: { ownerName: "Dana", listingTitle: "Sunny flat", reasonText: "Asked for money upfront" },
  listing_expiring: { ownerName: "Dana", listingTitle: "Sunny flat", renewUrl: "/account/listings", expiresAt: new Date("2026-11-03T10:00:00Z") },
  listing_expired: { ownerName: "Dana", listingTitle: "Sunny flat", renewUrl: "/account/listings" },
  listing_hidden_reports: { ownerName: "Dana", listingTitle: "Sunny flat" },
  ticket_created: { name: "Avi", ticketNumber: 1042, subject: "Can't upload photos", ticketUrl: "/account/tickets/t1" },
  ticket_reply: { name: null, ticketNumber: 1042, subject: "Photos", replyText: "Hi!\nTry a smaller file.", ticketUrl: null },
  ticket_status: { name: "Avi", ticketNumber: 1042, subject: "Photos", status: "WAITING_FOR_USER", ticketUrl: "/account/tickets/t1" },
  contact_owner: {
    ownerName: "Dana",
    senderName: "Moshe",
    senderEmail: "moshe@example.com",
    senderPhone: "+972 50 123 4567",
    message: "Is it free for Sukkot?",
    listingTitle: "Sunny flat",
    listingUrl: "https://bayit.example/he/listing/1234-sunny-flat",
    listingId: 1234,
    dates: "Sep 25 – Oct 4, 2026",
  },
  verification_approved: { name: "Dana", type: "ID" },
  verification_rejected: { name: "Dana", type: "OWNERSHIP", reasonText: "The document is unreadable" },
  account_warning: { name: "Dana", reasonText: "Duplicate listings" },
  account_suspended: { name: "Dana", reasonText: "Repeated scam reports", until: "2026-12-01" },
  account_deleted: { name: "Dana" },
  booking_confirmed_guest: {
    ...bookingStay,
    bookingUrl: "/account/trips/BT-7K3Q9",
    guestName: "Noa",
    checkInFrom: "14:00",
    checkOutUntil: "11:00",
    address: "12 Abashidze St, Tbilisi",
    hostName: "Yossi",
    hostPhone: "+995555000011",
    hostWhatsapp: "+995555000011",
    paymentMethods: ["cash", "card"],
    cancellationPolicy: "MODERATE",
    freeCancellationUntil: new Date("2026-11-07T10:00:00Z"),
    displayTotal: { amount: 1012.5, currency: "ILS" },
  },
  booking_new_host: {
    ...bookingStay,
    roomTypeName: "Double room",
    hostName: "Yossi",
    guestName: "Noa",
    guestPhone: "+995555000021",
    messageToHost: "We land at 2 am.\nIs a late check-in OK?",
  },
  booking_reminder_guest: {
    ...bookingStay,
    bookingUrl: "/account/trips/BT-7K3Q9",
    guestName: "Noa",
    paymentMethods: [],
    address: "12 Abashidze St, Tbilisi",
    daysLeft: 3,
  },
  booking_reminder_host: { ...bookingStay, hostName: "Yossi", guestName: "Noa", guestPhone: "+995555000021", daysLeft: 1 },
  booking_cancelled_by_guest: { ...bookingStay, hostName: "Yossi", guestName: "Noa", reasonCode: "OTHER", reasonText: "Family event", late: true },
  booking_cancelled_by_host: {
    ...bookingStay,
    bookingUrl: "/account/trips/BT-7K3Q9",
    guestName: "Noa",
    reasonCode: "PROPERTY_ISSUE",
    reasonText: null,
    searchUrl: "/search?deal=short-stay&checkIn=2026-11-12&checkOut=2026-11-15",
  },
  booking_completed: { code: "BT-7K3Q9", listingTitle: "Sunny flat in Vake", checkIn: "2026-11-12", checkOut: "2026-11-15", bookingUrl: "/account/trips/BT-7K3Q9", guestName: "Noa" },
  booking_host_unreached_guest: {
    ...bookingStay,
    bookingUrl: "/account/trips/BT-7K3Q9",
    guestName: "Noa",
    hostName: "Yossi",
    hostPhone: "+995555000011",
    hostWhatsapp: "+995555000011",
  },
  host_alert_test: { hostName: "Yossi", settingsUrl: "/account/settings#booking-alerts" },
  host_alerts_paused: { hostName: "Yossi", channel: "telegram", stillInstant: true, settingsUrl: "/account/settings#booking-alerts" },
  admin_alert: {
    kind: "host_alert_bounced",
    reason: "bounced",
    bookingCode: "BT-7K3Q9",
    listingTitle: "Sunny flat in Vake",
    listingPublicId: 1234,
    hostName: "Yossi",
    address: "yossi@example.com",
    template: "booking_new_host",
    adminUrl: "/admin/bookings",
  },
  // Reports (round 3, brief 8.2; src/lib/reports/email-templates.ts)
  report_received: { name: "Noa", bookingCode: "BT-7K3Q9", listingTitle: "Sunny flat in Vake", happenedOn: "2026-11-02", tripsUrl: "/account/trips/BT-7K3Q9" },
  report_admin: {
    kind: "TURNED_AWAY",
    reason: "CANCELLED_FOR_IDENTITY",
    targetType: "USER",
    listingTitle: "Sunny flat in Vake",
    listingPublicId: 1234,
    hostName: "Yossi",
    bookingCode: "BT-7K3Q9",
    happenedOn: "2026-11-02",
    screenshots: 2,
    adminUrl: "/admin/reports/r1",
  },
  report_host_listings_hidden: { name: "Yossi", count: 3, reasonText: "Discrimination" },
  report_reporter_revealed: {
    name: "Yossi",
    reporterName: "Noa",
    bookingCode: "BT-7K3Q9",
    listingTitle: "Sunny flat in Vake",
    happenedOn: "2026-11-02",
    reason: "ASKED_RELIGION_OR_ORIGIN",
    note: "Please read the pledge again.",
  },
  // Founder-only admin emails (round 3, brief 9; src/lib/alerts/founder-email-templates.ts)
  admin_review_needed: {
    listingTitle: "Sunny flat in Vake",
    listingPublicId: 1234,
    hostName: "Yossi",
    why: ["first_listing", "flagged_host"],
    riskScore: 35,
    riskReasons: 2,
    adminUrl: "/admin/moderation/l1",
  },
  admin_daily_summary: {
    fromDay: "2026-11-06",
    toDay: "2026-11-07",
    waiting: { turnedAwayReports: 1, inReview: 2, otherReports: 0, flagCancellations: 1, flagHosts: 0, flagNoShows: 0, failedEmails: 0 },
    period: { bookings: 3, cancelledByGuest: 1, cancelledByHost: 1, flaggedCancellations: 1, noShows: 0, reports: 1, turnedAwayReports: 1, hostUnreachable: 0 },
    adminUrl: "/admin",
  },
  weekly_host_stats: {
    name: "Dana",
    fromDay: "2026-11-01",
    toDay: "2026-11-07",
    totals: { views: 120, saves: 8, contacts: 3, bookings: 1 },
    bookable: true,
    listings: [{ title: "Sunny flat in Vake", publicId: 1234, bookable: true, views: 120, saves: 8, contacts: 3, bookings: 1, statsUrl: "/account/listings/l1/stats?days=7" }],
    moreListings: 0,
    listingsUrl: "/account/listings",
    unsubscribeUrl: "/unsubscribe?t=1.weekly_stats.u1.0123456789abcdef0123456789abcdef",
  },
  // Saved searches and price drops (round 3, brief 7.4).
  saved_search_matches: {
    name: "Dana",
    searches: [
      {
        name: "בטומי באוגוסט",
        url: "/search?deal=short-stay&city=batumi",
        places: [
          { title: "Sea view flat", publicId: 1234, url: "/listing/1234-sea-view-flat", place: "Batumi", price: 85, currency: "USD", pricePeriod: "NIGHT", priceIsFrom: false },
          { title: "", publicId: 1235, url: "/listing/1235", place: null, price: null, currency: "GEL", pricePeriod: "MONTH", priceIsFrom: false },
        ],
        more: 2,
        total: 4,
      },
    ],
    moreSearches: 1,
    totalPlaces: 4,
    manageUrl: "/account/alerts",
    unsubscribeUrl: "/unsubscribe?t=1.saved_search.u1.0123456789abcdef0123456789abcdef",
  },
  price_drop: {
    name: "Dana",
    place: { title: "Sunny flat in Vake", publicId: 1234, url: "/listing/1234-sunny-flat", place: "Vake, Tbilisi", price: 90, currency: "GEL", pricePeriod: "NIGHT", priceIsFrom: true },
    oldPrice: 100,
    newPrice: 90,
    pct: 10,
    listName: "Tbilisi in May",
    manageUrl: "/account/alerts",
    unsubscribeUrl: "/unsubscribe?t=1.price_drop.u1.0123456789abcdef0123456789abcdef",
  },  // Reviews (round 3, brief 8.1).
  review_request: {
    name: "Dana",
    listingTitle: "Sunny flat in Vake",
    checkIn: "2026-10-01",
    checkOut: "2026-10-05",
    closesOn: "2026-10-19",
    writeUrl: "/account/reviews/write/BT-7K3Q9",
    tripUrl: "/account/trips/BT-7K3Q9",
    unsubscribeUrl: "/unsubscribe?t=1.review_request.u1.0123456789abcdef0123456789abcdef",
  },
  review_posted_host: {
    name: "Giorgi",
    listingTitle: "Sunny flat in Vake",
    rating: 5,
    guestName: "Dana",
    text: "A lovely, quiet flat. The host met us at the door and everything was clean.",
    reviewsUrl: "/account/reviews#review-r1",
  },
  review_reply_guest: {
    name: "Dana",
    listingTitle: "Sunny flat in Vake",
    replyText: "Thank you, Dana! You are welcome back any time.",
    listingUrl: "/listing/1234-sunny-flat#reviews",
  },
  review_hidden: { name: "Dana", role: "guest", listingTitle: "Sunny flat in Vake", reasonCode: "offensive", reviewsUrl: "/account/reviews" },
  review_shown: { name: "Giorgi", role: "host", listingTitle: "Sunny flat in Vake", listingUrl: "/listing/1234-sunny-flat#reviews" },
  review_no_show_guest: {
    name: "Dana",
    listingTitle: "Sunny flat in Vake",
    code: "BT-7K3Q9",
    checkIn: "2026-11-12",
    checkOut: "2026-11-15",
    tripUrl: "/account/trips/BT-7K3Q9",
    contactUrl: "/contact",
  },
  // "The host's contact details changed" (SECURITY_REPORT 14.3.c): src/lib/contact/email-templates.ts
  host_contact_changed_guest: {
    name: "Dana",
    listingTitle: "Sunny flat in Vake",
    code: "BT-7K3Q9",
    tripUrl: "/account/trips/BT-7K3Q9",
    reportUrl: "/help/report-scam?listing=1234&booking=BT-7K3Q9",
  },
  // Account security (SECURITY_REPORT 3.6, 3.7): src/lib/auth/security-email-templates.ts
  security_code: { code: "482913", minutes: 10, purpose: "confirm", name: "Dana" },
  security_change: { kind: "recovery_code_used", left: 3, at: "2026-11-08T12:05:00Z", name: "Dana" },
  security_new_device: { device: "Chrome · Android", at: "2026-11-08T12:05:00Z", name: "Dana" },
  security_staff_alert: { kind: "new_device", staffName: "Dana", role: "MODERATOR", device: "Safari · iPhone", at: "2026-11-08T12:05:00Z" },
  security_alert: { alerts: [{ kind: "staff_new_device", count: 1 }, { kind: "login_failures", count: 61, threshold: 50 }], windowMinutes: 60, at: "2026-11-08T12:00:00Z" },
};

afterEach(() => {
  translationErrors.length = 0;
  outbox.length = 0;
  delete process.env.RESEND_API_KEY;
});

describe("renderEmail", () => {
  for (const locale of locales) {
    it(`renders every template in ${locale} without missing text`, async () => {
      for (const template of EMAIL_TEMPLATES) {
        const email = await renderEmail(template, locale, samples[template] as never);
        expect(email.subject.length, template).toBeGreaterThan(3);
        expect(email.subject, template).not.toMatch(/templates\.|emails\./);
        expect(email.html).toContain(`lang="${locale}"`);
        expect(email.html).toContain(`dir="${locale === "he" || locale === "ar" ? "rtl" : "ltr"}"`);
        expect(email.text.length).toBeGreaterThan(50);
        // SECURITY_REPORT 13.4.b: every link of every email goes to our own site.
        for (const [, href] of email.html.matchAll(/href="([^"]+)"/g)) {
          expect(href.replace(/&amp;/g, "&").startsWith(siteUrl()), `${template}: ${href}`).toBe(true);
        }
      }
      expect(translationErrors).toEqual([]);
    });
  }

  it("escapes user text and keeps line breaks", async () => {
    const email = await renderEmail("contact_owner", "en", {
      ...samples.contact_owner,
      senderName: "<b>Eve</b>",
      message: "<script>alert(1)</script>\nsecond line",
    });
    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;<br>second line");
    expect(email.html).toContain("&lt;b&gt;Eve&lt;/b&gt;");
    expect(email.html).toContain('dir="auto"');
    expect(email.text).toContain("> second line");
  });

  it("makes links absolute, adds the locale and drops unsafe URLs", async () => {
    const he = await renderEmail("listing_approved", "he", samples.listing_approved);
    expect(he.html).toMatch(/href="https?:\/\/[^"]+\/he\/listing\/1234-sunny-flat"/);
    const prefixed = await renderEmail("listing_approved", "en", { ...samples.listing_approved, listingUrl: "/ru/listing/1" });
    expect(prefixed.html).toMatch(/href="https?:\/\/[^"]+\/ru\/listing\/1"/);
    const unsafe = await renderEmail("listing_approved", "en", { ...samples.listing_approved, listingUrl: "javascript:alert(1)" });
    expect(unsafe.html).not.toContain("javascript:");
    expect(unsafe.html).toMatch(/\/en\/account\/listings"/);
  });

  it("uses Western digits and the translated status", async () => {
    const ar = await renderEmail("ticket_status", "ar", samples.ticket_status);
    expect(ar.subject).toContain("#1042");
    expect(ar.subject).toContain("بانتظار ردك");
    const expiring = await renderEmail("listing_expiring", "ar", samples.listing_expiring);
    expect(expiring.subject).not.toMatch(/[٠-٩]/);
  });
});

describe("alert emails", () => {
  it("asks the guest to contact the host, with the host's phone", async () => {
    const email = await renderEmail("booking_host_unreached_guest", "he", samples.booking_host_unreached_guest);
    expect(email.subject).toContain("BT-7K3Q9");
    expect(email.text).toContain("+995555000011");
    expect(email.text).toMatch(/\/he\/account\/trips\/BT-7K3Q9/);
  });

  it("tells the founder what happened, for every kind", async () => {
    for (const kind of ["host_unreachable", "host_alert_bounced", "email_bounced"] as const) {
      const email = await renderEmail("admin_alert", "he", { ...samples.admin_alert, kind });
      expect(email.subject.length, kind).toBeGreaterThan(5);
      expect(email.text).toMatch(/\/he\/admin\/bookings/);
    }
    const unknownReason = await renderEmail("admin_alert", "en", { ...samples.admin_alert, reason: "<script>" });
    expect(unknownReason.text).toContain("the email service didn't accept the message");
    expect(translationErrors).toEqual([]);
  });
});

describe("booking emails", () => {
  it("shows the stay, the pay-on-arrival line and the policy deadline in Hebrew", async () => {
    const email = await renderEmail("booking_confirmed_guest", "he", samples.booking_confirmed_guest);
    expect(email.subject).toContain("BT-7K3Q9");
    expect(email.text).toContain("BT-7K3Q9");
    expect(email.text).toContain("12 Abashidze St, Tbilisi");
    expect(email.text).toContain("+995555000011");
    expect(email.text).toContain("בדולרים");
    expect(email.text).toContain("מזומן, כרטיס אשראי");
    expect(email.text).toContain("בינונית");
    expect(email.text).toMatch(/2 מבוגרים, ילד אחד, תינוק אחד/);
    expect(email.text).toMatch(/\/he\/account\/trips\/BT-7K3Q9/);
    expect(email.text).not.toMatch(/[٠-٩]/);
    // The booking number never wraps at its hyphen in the HTML.
    expect(email.html).toContain('<span style="white-space:nowrap;">BT-7K3Q9</span>');
    expect(email.html).not.toMatch(/[^>]BT-7K3Q9<\/span>|>BT-7K3Q9(?!<\/span>)/);
  });

  // Round 3, brief 6.3: the itemized lines the guest confirmed (Booking.priceLines), above the total.
  it("lists the booking's price lines (date price note, weekly discount, cleaning fee) in the confirmation and the host's email", async () => {
    const priceLines = [
      { kind: "weekday" as const, nights: 2, price: 85, amount: 170 },
      { kind: "date_price" as const, nights: 1, price: 100, amount: 100, label: { he: "חנוכה" } },
      { kind: "discount" as const, pct: 10, period: "weekly" as const, amount: -27 },
      { kind: "cleaning" as const, price: 32, amount: 32 },
    ];
    const guest = await renderEmail("booking_confirmed_guest", "he", { ...samples.booking_confirmed_guest, priceLines });
    expect(guest.text).toContain("⁦$85⁩ × שני לילות: $170");
    expect(guest.text).toContain("לילה אחד (⁨חנוכה⁩)");
    expect(guest.text).toMatch(/הנחה לשבוע ⁦−10%⁩/);
    expect(guest.text).toMatch(/−\$27/);
    expect(guest.text).toContain("דמי ניקיון");
    const host = await renderEmail("booking_new_host", "en", { ...samples.booking_new_host, priceLines });
    expect(host.text).toContain("⁦$100⁩ × 1 night (⁨חנוכה⁩)");
    expect(host.text).toMatch(/Weekly discount ⁦−10%⁩/);
    // Cancellations keep the short version (no lines).
    const cancelled = await renderEmail("booking_cancelled_by_host", "en", { ...samples.booking_cancelled_by_host, priceLines });
    expect(cancelled.text).not.toContain("Weekly discount");
    expect(translationErrors).toEqual([]);
  });

  it("lets a long price line wrap on a phone; its amount stays on one line (ui-email-1)", async () => {
    const priceLines = [{ kind: "weekend" as const, nights: 2, price: 80, amount: 160, rooms: 2 }];
    const host = await renderEmail("booking_new_host", "ru", { ...samples.booking_new_host, priceLines });
    const row = /<tr><td style="([^"]*)">([^<]*)<\/td><td style="([^"]*)"[^>]*>([^<]*)<\/td><\/tr>/g;
    const rows = [...host.html.matchAll(row)];
    const line = rows.find((m) => m[2].includes("×"));
    expect(line, "the price line's row").toBeDefined();
    expect(line![1]).not.toContain("white-space:nowrap");
    expect(line![1]).toContain("white-space:normal");
    expect(line![3]).toContain("white-space:nowrap");
    // Other rows keep their label on one line.
    expect(rows.some((m) => !m[2].includes("×") && m[1].includes("white-space:nowrap"))).toBe(true);
  });

  it("gives the host the guest's phone and message, and the guest a way to report a cancellation", async () => {
    const host = await renderEmail("booking_new_host", "ru", samples.booking_new_host);
    expect(host.text).toContain("+995555000021");
    expect(host.text).toContain("Is a late check-in OK?");
    const cancelled = await renderEmail("booking_cancelled_by_host", "en", samples.booking_cancelled_by_host);
    expect(cancelled.text).toContain("A problem with the property");
    expect(cancelled.html).toMatch(/\/en\/search\?deal=short-stay/);
    const late = await renderEmail("booking_cancelled_by_guest", "ar", samples.booking_cancelled_by_guest);
    expect(late.text).toContain("Family event");
  });

  // Round 3: "גמיש" check-in / check-out, and times in each language's usual format.
  it("says flexible check-in / check-out instead of a time, and formats times per language", async () => {
    const flexible = await renderEmail("booking_confirmed_guest", "he", {
      ...samples.booking_confirmed_guest,
      checkInFrom: null,
      checkInFlexible: true,
      checkOutFlexible: true,
    });
    expect(flexible.text).toContain("צ׳ק-אין גמיש");
    expect(flexible.text).toContain("צ׳ק-אאוט גמיש");
    expect(flexible.text).not.toContain("עד 11:00");
    const he = await renderEmail("booking_confirmed_guest", "he", samples.booking_confirmed_guest);
    expect(he.text).toContain("מ-14:00");
    expect(he.text).toContain("עד 11:00");
    const en = await renderEmail("booking_confirmed_guest", "en", samples.booking_confirmed_guest);
    expect(en.text).toContain("from 2:00 PM");
    expect(en.text).toContain("until 11:00 AM");
    const ar = await renderEmail("booking_confirmed_guest", "ar", { ...samples.booking_confirmed_guest, checkOutFlexible: true });
    expect(ar.text).toContain("2:00 م");
    expect(ar.text).toContain("تسجيل مغادرة مرن");
  });
});

describe("sendEmail", () => {
  it("logs to the outbox when Resend is not configured", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const result = await sendEmail({ to: "dana@example.com", template: "welcome", locale: "he", data: samples.welcome });
    expect(result).toEqual({ ok: true, delivery: "logged" });
    expect(outbox).toHaveLength(1);
    expect(outbox[0]).toMatchObject({ to: "dana@example.com", template: "welcome", locale: "he", status: "LOGGED" });
    expect(info).toHaveBeenCalled();
    info.mockRestore();
  });

  it("never sends to placeholder or invalid addresses, but records the attempt", async () => {
    const a = await sendEmail({ to: "995555123456@phone.bayit.invalid", template: "welcome", locale: "en", data: samples.welcome });
    const b = await sendEmail({ to: "not-an-email", template: "welcome", locale: "en", data: samples.welcome });
    expect(a.ok).toBe(false);
    expect(b.ok).toBe(false);
    expect(outbox.map((row) => row.status)).toEqual(["FAILED", "FAILED"]);
  });

  it("masks a login code in the outbox (staff can read it) but puts it in the email", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const rendered = await renderEmail("login_code", "he", samples.login_code);
    expect(rendered.subject).toContain("482913");
    expect(rendered.html).toContain("482913");
    await sendEmail({ to: "dana@example.com", template: "login_code", locale: "he", data: samples.login_code, redact: ["482913"] });
    const row = outbox[0] as { subject: string; html: string; text: string };
    expect(`${row.subject}${row.html}${row.text}`).not.toContain("482913");
    expect(row.text).toContain("••••••");
  });

  it("keeps outbox-only emails in the outbox even with Resend set up (demo accounts)", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    process.env.RESEND_API_KEY = "re_test_key";
    const result = await sendEmail({ to: "yossi@demo.bayit.example", template: "welcome", locale: "he", data: samples.welcome, outboxOnly: true });
    expect(result).toEqual({ ok: true, delivery: "logged" });
    expect(outbox[0]).toMatchObject({ status: "LOGGED", provider: "outbox" });
  });

  it("passes the List-Unsubscribe headers to Resend, and nothing else (weekly-1)", async () => {
    process.env.RESEND_API_KEY = "re_test_key";
    resendCalls.length = 0;
    const result = await sendEmail({
      to: "dana@example.com",
      template: "welcome",
      locale: "he",
      data: samples.welcome,
      headers: {
        "List-Unsubscribe": "<https://bayit.example/api/unsubscribe?t=x>",
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        Bcc: "someone@example.com",
        "X-Injected": "a\r\nBcc: b@example.com",
      },
    });
    expect(result).toMatchObject({ ok: true, delivery: "sent" });
    expect(resendCalls[0].headers).toEqual({
      "List-Unsubscribe": "<https://bayit.example/api/unsubscribe?t=x>",
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    });
    await sendEmail({ to: "dana@example.com", template: "welcome", locale: "he", data: samples.welcome });
    expect(resendCalls[1].headers).toBeUndefined();
  });

  it("tags emails for Resend, dropping tags Resend would refuse", () => {
    expect(resendTags("booking_new_host", { booking: "BT-7K3Q9", "bad tag": "x", other: "a b", template: "nope" })).toEqual([
      { name: "template", value: "booking_new_host" },
      { name: "booking", value: "BT-7K3Q9" },
    ]);
  });

  it("falls back to English for an unknown locale", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    await sendEmail({ to: "a@example.com", template: "account_deleted", locale: "xx", data: samples.account_deleted });
    expect(outbox[0]).toMatchObject({ locale: "en", status: "LOGGED" });
  });
});

describe("placeholder addresses", () => {
  it("are detected and skipped for notifications", () => {
    expect(isPlaceholderEmail("995555123456@phone.bayit.invalid")).toBe(true);
    expect(isPlaceholderEmail("dana@example.com")).toBe(false);
    expect(notificationEmailFor({ email: "995555123456@phone.bayit.invalid" })).toBeNull();
    expect(notificationEmailFor({ email: "995555123456@phone.bayit.invalid", contactEmail: "dana@example.com" })).toBe(
      "dana@example.com",
    );
    expect(notificationEmailFor({ email: "dana@example.com", contactEmail: null })).toBe("dana@example.com");
  });
});

describe("trust lines (SECURITY_REPORT 13.4.b/c, 14.2.b/c)", () => {
  it("ends every email with the founder's exact footer sentence", async () => {
    const email = await renderEmail("welcome", "he", { name: "Dana" });
    expect(email.html).toContain("בית לעולם לא יבקש מכם תשלום בקישור, פרטי כרטיס אשראי או קוד כניסה.");
  });

  it("puts the exact pay warning and the one-tap scam report in the booking emails", async () => {
    const email = await renderEmail("booking_confirmed_guest", "he", samples.booking_confirmed_guest);
    expect(email.html).toContain("לעולם אל תשלמו מראש בקישור או בהעברה. משלמים למארח כשמגיעים.");
    expect(email.html).toContain("דיווח על הונאה");
    expect(email.html).toMatch(/href="[^"]*\/help\/report-scam\?booking=BT-7K3Q9"/);
  });

  it("drops a link to another host and defuses addresses in user text", async () => {
    const email = await renderEmail("booking_new_host", "en", {
      ...samples.booking_new_host,
      messageToHost: "Pay the deposit at paypal.me/scammer or https://evil.example/pay",
    } as never);
    expect(email.html).not.toMatch(/href="https?:\/\/(?!localhost|127\.0\.0\.1)[^"]*evil/);
    expect(email.html).not.toContain("paypal.me");
    expect(email.text).not.toContain("https://evil.example");
  });
});
