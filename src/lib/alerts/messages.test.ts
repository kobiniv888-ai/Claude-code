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
