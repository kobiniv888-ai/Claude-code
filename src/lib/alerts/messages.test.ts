/**
 * SECURITY_REPORT 5.i / conflict C17: Telegram messages, browser notifications and texts about a
 * booking carry only the booking number and the link, in all 5 languages. The guest's name, the
 * dates, the guest count and the listing title stay in the email and on the site.
 */
import fs from "node:fs";
import path from "node:path";
import { createTranslator } from "use-intl/core";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next-intl/server", () => ({
  getTranslations: async ({ locale, namespace }: { locale: string; namespace: string }) => {
    const root = namespace.split(".")[0];
    const messages = { [root]: JSON.parse(fs.readFileSync(path.join(process.cwd(), "messages", locale, `${root}.json`), "utf8")) };
    return createTranslator({ locale, messages, namespace });
  },
}));

const { alertTexts } = await import("./messages");
const { locales } = await import("@/config/site");

const booking = {
  code: "BT-7K3Q9",
  status: "CONFIRMED" as const,
  locale: "he" as const,
  title: "Sunny flat by the old town",
  guest: "Noa Cohen",
  dates: "3–5 Nov",
  guests: "2 guests",
  url: "https://bayit.example/he/account/host-bookings/BT-7K3Q9",
  path: "/he/account/host-bookings/BT-7K3Q9",
};

describe("alertTexts (5.i): as little as possible", () => {
  for (const locale of locales) {
    it(`${locale}: new booking and cancellation say the number and the link only`, async () => {
      for (const kind of ["new_booking", "cancelled"] as const) {
        const texts = await alertTexts(locale, { kind, booking: { ...booking, locale } });
        const all = [texts.text, texts.push.title, texts.push.body].join("\n");
        expect(texts.text).toContain("BT-7K3Q9");
        expect(texts.text).toContain(booking.url);
        expect(texts.push.title).toContain("BT-7K3Q9");
        expect(texts.push.url).toBe(booking.path);
        for (const detail of [booking.guest, booking.dates, booking.guests, booking.title, "Noa", "Nov"]) expect(all).not.toContain(detail);
        expect(all).not.toMatch(/\{|\}/);
      }
    });

    it(`${locale}: a paused-email notice does not repeat the address`, async () => {
      const texts = await alertTexts(locale, { kind: "paused", failed: "email", stillInstant: true });
      expect(`${texts.text}\n${texts.push.body}`).not.toMatch(/@/);
      expect(texts.text).not.toMatch(/\{|\}/);
    });
  }
});

/**
 * The host's TEXT MESSAGES about a booking (messages/<locale>/emails.json, sms.booking_new_host and
 * sms.booking_reminder_host; src/lib/booking/notify.ts) follow the same rule: the booking number,
 * when the guest arrives (reminder), and "open Bayit". No guest name, guest count or listing.
 */
describe("host booking texts (5.i): the number and the link, no guest name", () => {
  const values = {
    brand: "Bayit",
    code: "BT-7K3Q9",
    url: booking.url,
    // Values a text could be given by mistake: none of them may come out.
    guest: booking.guest,
    guests: booking.guests,
    title: booking.title,
    dates: booking.dates,
  };
  for (const locale of locales) {
    it(`${locale}: new booking and reminder`, () => {
      const emails = JSON.parse(fs.readFileSync(path.join(process.cwd(), "messages", locale, "emails.json"), "utf8"));
      const t = createTranslator({ locale, messages: { emails }, namespace: "emails" });
      for (const key of ["sms.booking_new_host", "sms.booking_reminder_host"] as const) {
        const raw = String(emails.sms[key.slice(4)]);
        expect(raw, key).not.toMatch(/\{(guest|guests|title|dates)\}/);
        for (const count of [0, 1, 3]) {
          const text = t(key as never, { ...values, count } as never) as string;
          expect(text, key).toContain("BT-7K3Q9");
          expect(text, key).toContain(booking.url);
          for (const detail of [booking.guest, "Noa", booking.guests, booking.title, booking.dates]) expect(text, key).not.toContain(detail);
        }
      }
    });
  }
});
