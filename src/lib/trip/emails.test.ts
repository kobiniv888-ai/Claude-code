import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createTranslator } from "use-intl/core";
import { locales } from "@/config/site";
import { tripPath } from "@/lib/booking/constants";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("next-intl/server", () => ({
  getTranslations: async ({ locale, namespace }: { locale: string; namespace: string }) => {
    const messages = { [namespace]: JSON.parse(fs.readFileSync(path.join(process.cwd(), "messages", locale, `${namespace}.json`), "utf8")) };
    return createTranslator({ locale, messages, namespace });
  },
}));

const { renderEmail } = await import("@/lib/email");
type Data = import("@/lib/email/templates").EmailData;

/**
 * Brief 7.1: every booking email to the GUEST links to their trip page (the host's emails link
 * to the host's own booking page). notify.ts passes tripPath(code) as bookingUrl for the guest.
 */
const code = "BT-7K3Q9";
const trip = tripPath(code);
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
  bookingUrl: trip,
};
const arrival = { address: "12 Abashidze St, Tbilisi", hostName: "Yossi", hostPhone: "+995555000011", hostWhatsapp: "+995555000011", paymentMethods: ["cash"] };

const guestEmails: { [K in keyof Data]?: Data[K] } = {
  booking_confirmed_guest: { ...stay, ...arrival, guestName: "Noa", cancellationPolicy: "MODERATE", freeCancellationUntil: new Date("2026-11-08T10:00:00Z") },
  booking_reminder_guest: { ...stay, ...arrival, guestName: "Noa", daysLeft: 3 },
  booking_cancelled_by_host: { ...stay, guestName: "Noa", reasonCode: "PROPERTY_ISSUE", reasonText: null, searchUrl: "/search?deal=short-stay" },
  booking_completed: { code, listingTitle: stay.listingTitle, checkIn: stay.checkIn, checkOut: stay.checkOut, bookingUrl: trip, guestName: "Noa" },
  booking_host_unreached_guest: { ...stay, guestName: "Noa", hostName: "Yossi", hostPhone: "+995555000011", hostWhatsapp: "+995555000011" },
};

describe("booking emails to the guest link to the trip page", () => {
  for (const [template, data] of Object.entries(guestEmails)) {
    it(template, async () => {
      for (const locale of locales) {
        const email = await renderEmail(template as keyof Data, locale, data as never);
        const hrefs = [...email.html.matchAll(/href="([^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, "&"));
        const links = hrefs.filter((href) => new URL(href, "https://bayit.example").pathname === `/${locale}${trip}`);
        expect(links.length, `${template} (${locale})`).toBeGreaterThan(0);
        expect(email.text).toContain(`/${locale}${trip}`);
      }
    });
  }
});
