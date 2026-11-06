import fs from "node:fs";
import path from "node:path";
import { createTranslator } from "use-intl/core";
import { describe, expect, it, vi } from "vitest";
import { locales } from "@/config/site";

vi.mock("server-only", () => ({}));
const translationErrors: unknown[] = [];
vi.mock("next-intl/server", () => ({
  getTranslations: async ({ locale, namespace }: { locale: string; namespace: string }) => {
    const file = path.join(process.cwd(), "messages", locale, `${namespace}.json`);
    const messages = { [namespace]: JSON.parse(fs.readFileSync(file, "utf8")) };
    return createTranslator({ locale, messages, namespace, onError: (e) => translationErrors.push(e) });
  },
}));
vi.mock("@/lib/db", () => ({ db: {} }));

const { renderEmail } = await import("@/lib/email");
const { countsLine } = await import("./weekly-host-email-template");

const data = {
  name: "Dana",
  fromDay: "2026-11-01",
  toDay: "2026-11-07",
  totals: { views: 120, saves: 8, contacts: 0, bookings: 1 },
  bookable: true,
  listings: [
    { title: "Sunny flat in Vake", publicId: 1234, bookable: true, views: 100, saves: 6, contacts: 0, bookings: 1, statsUrl: "/account/listings/l1/stats?days=7" },
    { title: "דירה בבטומי", publicId: 1235, bookable: false, views: 20, saves: 2, contacts: 0, bookings: 0, statsUrl: "/account/listings/l2/stats?days=7" },
  ],
  moreListings: 0,
  listingsUrl: "/account/listings",
  unsubscribeUrl: "/unsubscribe?t=1.weekly_stats.u1.0123456789abcdef0123456789abcdef",
};

describe("weekly host stats email", () => {
  it('says "השבוע: 120 צפיות, 8 שמירות, הזמנה אחת" in Hebrew', async () => {
    const email = await renderEmail("weekly_host_stats", "he", data);
    expect(email.subject).toBe("השבוע: 120 צפיות, 8 שמירות, הזמנה אחת");
    expect(email.text).toContain("השבוע: 120 צפיות, 8 שמירות, הזמנה אחת.");
    // One block per listing, with a link to its stats page.
    expect(email.text).toContain("Sunny flat in Vake");
    expect(email.text).toMatch(/\/he\/account\/listings\/l1\/stats\?days=7/);
    // A monthly rental names no bookings.
    expect(email.text).toContain("20 צפיות, שתי שמירות\n");
    // The unsubscribe link, with the site and the language.
    expect(email.text).toMatch(/\/he\/unsubscribe\?t=1\.weekly_stats\.u1\./);
    expect(email.html).toContain('dir="rtl"');
    expect(translationErrors).toEqual([]);
  });

  it("speaks the host's language, with plurals and Western digits", async () => {
    const en = await renderEmail("weekly_host_stats", "en", { ...data, totals: { views: 1, saves: 2, contacts: 3, bookings: 0 } });
    expect(en.subject).toBe("This week: 1 view, 2 saves, 3 contact clicks, 0 bookings");
    const ru = await renderEmail("weekly_host_stats", "ru", { ...data, totals: { views: 21, saves: 3, contacts: 0, bookings: 5 } });
    expect(ru.subject).toBe("За неделю: 21 просмотр, 3 сохранения, 5 бронирований");
    const ar = await renderEmail("weekly_host_stats", "ar", data);
    expect(ar.subject).toMatch(/120/);
    expect(ar.subject).not.toMatch(/[٠-٩]/);
    for (const locale of locales) {
      const email = await renderEmail("weekly_host_stats", locale, { ...data, moreListings: 4 });
      expect(email.text, locale).toMatch(/unsubscribe\?t=/);
      expect(email.text, locale).toMatch(/4/);
    }
    expect(translationErrors).toEqual([]);
  });

  it("names bookings only for short stays and hotels, and contact taps only when there were some", () => {
    const t = (key: string, values?: Record<string, string | number>) => (key === "booking.listSeparator" ? " | " : `${key.split(".").pop()}=${values?.countText}`);
    const ctx = { t, locale: "en" as const };
    expect(countsLine({ views: 5, saves: 0, contacts: 0, bookings: 0 }, false, ctx)).toBe("views=5 | saves=0");
    expect(countsLine({ views: 5, saves: 0, contacts: 2, bookings: 0 }, true, ctx)).toBe("views=5 | saves=0 | contacts=2 | bookings=0");
    expect(countsLine({ views: 1500, saves: 1, contacts: 0, bookings: 1 }, false, ctx)).toBe("views=1,500 | saves=1 | bookings=1");
  });
});
