import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createTranslator } from "use-intl/core";
import { locales } from "@/config/site";
import { tripPath } from "@/lib/booking/constants";

/**
 * Founder's answer (10), 9 Nov 2026: the EXACT ADDRESS stays out of calendar files (.ics and the
 * Google Calendar link), email preview text (preheaders) and subjects, reminder emails, and push /
 * Telegram notifications. It appears only in the booking confirmation email's body (and on the trip
 * page inside the address window, src/lib/booking/policy.ts canRevealHostContact).
 */

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({
  db: { listing: { findUnique: async () => ({ city: { names: { he: "תביליסי", en: "Tbilisi", ru: "Тбилиси", ar: "تبليسي", ka: "თბილისი" } } }) } },
}));
vi.mock("next-intl/server", () => ({
  getTranslations: async ({ locale, namespace }: { locale: string; namespace: string }) => {
    const [file] = namespace.split(".");
    const messages = { [file]: JSON.parse(fs.readFileSync(path.join(process.cwd(), "messages", locale, `${file}.json`), "utf8")) };
    return createTranslator({ locale, messages, namespace: namespace as never });
  },
}));

const { renderEmail } = await import("@/lib/email");
const { EMAIL_TEMPLATES } = await import("@/lib/email/templates");
const { tripIcsFile, tripGoogleCalendarUrl } = await import("./calendar-server");
const { alertTexts } = await import("@/lib/alerts/messages");

const ADDRESS = "17 Secret Exposure Lane, apt 4";
const LAT = 41.7123456;
const LNG = 44.7654321;
const code = "BT-7K3Q9";

const stay = {
  code,
  listingTitle: "Sunny flat in Vake",
  checkIn: "2026-11-13",
  checkOut: "2026-11-15",
  nights: 2,
  adults: 2,
  children: 0,
  infants: 0,
  total: 160,
  currency: "USD" as const,
  bookingUrl: tripPath(code),
};
const arrival = { address: ADDRESS, hostName: "Yossi", hostPhone: "+995555000011", hostWhatsapp: "+995555000011", paymentMethods: ["cash"] };
// Every field any booking template reads, the address included: a template that does not take it
// must not print it either.
const everything = {
  ...stay,
  ...arrival,
  guestName: "Noa",
  guestPhone: "+995555000022",
  daysLeft: 3,
  cancellationPolicy: "MODERATE",
  freeCancellationUntil: new Date("2026-11-08T10:00:00Z"),
  reasonCode: "PROPERTY_ISSUE",
  reasonText: null,
  searchUrl: "/search?deal=short-stay",
};

/** The hidden preview text of a rendered email (src/lib/email/layout.ts). */
function preheaderOf(html: string): string {
  return /<div style="display:none;max-height:0;[^"]*">([\s\S]*?)<\/div>/.exec(html)?.[1] ?? "";
}

describe("answer (10): the exact address only in the confirmation email body", () => {
  const bookingTemplates = EMAIL_TEMPLATES.filter((name) => name.startsWith("booking_"));

  it("covers the booking emails", () => {
    expect(bookingTemplates).toEqual(expect.arrayContaining(["booking_confirmed_guest", "booking_reminder_guest", "booking_reminder_host"]));
  });

  for (const template of bookingTemplates) {
    it(template, async () => {
      for (const locale of locales) {
        const email = await renderEmail(template, locale, everything as never);
        const preheader = preheaderOf(email.html);
        expect(preheader.length, `${template} (${locale}) has a preheader`).toBeGreaterThan(0);
        expect(preheader, `${template} (${locale}) preheader`).not.toContain(ADDRESS);
        expect(email.subject, `${template} (${locale}) subject`).not.toContain(ADDRESS);
        if (template === "booking_confirmed_guest") {
          // The body of the confirmation is the one place in email.
          expect(email.html.replace(preheader, ""), `${template} (${locale}) body`).toContain(ADDRESS);
          expect(email.text).toContain(ADDRESS);
        } else {
          expect(email.html, `${template} (${locale})`).not.toContain(ADDRESS);
          expect(email.text, `${template} (${locale})`).not.toContain(ADDRESS);
        }
      }
    });
  }

  it("the reminder says where the address is and links to the trip page", async () => {
    const messages = JSON.parse(fs.readFileSync(path.join(process.cwd(), "messages", "he", "emails.json"), "utf8"));
    const email = await renderEmail("booking_reminder_guest", "he", { ...stay, ...arrival, guestName: "Noa", daysLeft: 3 } as never);
    expect(email.text).toContain(messages.templates.booking_reminder_guest.addressOnTrip);
    expect(email.text).toContain(`/he${tripPath(code)}`);
    expect(email.text).not.toContain(ADDRESS);
  });
});

describe("answer (10): calendar files and the Google Calendar link carry the city, never the address or pin", () => {
  const trip = {
    code,
    path: tripPath(code),
    checkIn: "2026-11-13",
    checkOut: "2026-11-15",
    checkInFrom: "15:00",
    checkOutUntil: "11:00",
    checkInFlexible: false,
    checkOutFlexible: false,
    total: 160,
    currency: "USD",
    listing: { id: "listing-1", title: "Sunny flat in Vake" },
    reveal: { address: ADDRESS, lat: LAT, lng: LNG, hostName: "Yossi", contact: { phone: "+995555000011", whatsapp: null } },
  };

  for (const locale of locales) {
    it(`${locale}: .ics`, async () => {
      const file = await tripIcsFile(trip as never, locale, new Date("2026-11-01T10:00:00Z"));
      const unfolded = file.replace(/\r\n /g, "");
      expect(unfolded).not.toContain("Secret Exposure");
      expect(unfolded).not.toMatch(/^GEO:/m);
      expect(unfolded).not.toContain(LAT.toFixed(4));
      expect(unfolded).not.toContain(LNG.toFixed(4));
      expect(unfolded).toMatch(/^LOCATION:.+$/m);
      expect(unfolded).toContain(`/${locale}${tripPath(code)}`);
    });

    it(`${locale}: Google Calendar link`, async () => {
      const url = new URL(await tripGoogleCalendarUrl(trip as never, locale));
      const all = decodeURIComponent(url.search);
      expect(all).not.toContain("Secret Exposure");
      expect(all).not.toContain(LAT.toFixed(4));
      expect(url.searchParams.get("location")).toBeTruthy();
      expect(url.searchParams.get("location")).not.toContain(ADDRESS);
    });
  }
});

describe("answer (10): push and Telegram texts never carry the address", () => {
  it("new booking and cancellation", async () => {
    for (const locale of locales) {
      for (const kind of ["new_booking", "cancelled"] as const) {
        const booking = { code, url: `https://bayit.example/${locale}/account/host-bookings/${code}`, path: `/account/host-bookings/${code}`, title: ADDRESS, guest: "Noa", dates: "13–15 Nov", guests: "2", locale, status: "CONFIRMED" };
        const out = await alertTexts(locale, { kind, booking } as never);
        const all = JSON.stringify(out);
        expect(all).not.toContain(ADDRESS);
        expect(all).toContain(code);
      }
    }
  });
});
