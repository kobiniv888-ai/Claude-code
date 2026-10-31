import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { Location, Zmanim } from "@hebcal/core";
import { createTranslator } from "use-intl/core";

vi.mock("server-only", () => ({}));

// getTranslations needs the Next.js request context; use the real message files instead.
vi.mock("next-intl/server", () => ({
  getTranslations: async ({ locale, namespace }: { locale: string; namespace: string }) => {
    const file = path.join(process.cwd(), "messages", locale, `${namespace}.json`);
    const messages = { [namespace]: JSON.parse(fs.readFileSync(file, "utf8")) };
    return createTranslator({ locale, messages, namespace });
  },
}));

const {
  getHolidaysInRange,
  getJewishCalendarMonth,
  getShabbatTimes,
  hebrewDate,
  holidayFilterHint,
  isShabbatOrHolidayNow,
} = await import("./index");

const tbilisi = { lat: 41.7151, lng: 44.8271, timezone: "Asia/Tbilisi", name: "Tbilisi" };
const jerusalem = { lat: 31.778, lng: 35.2354, timezone: "Asia/Jerusalem", name: "Jerusalem" };

function sunset(place: typeof tbilisi, y: number, m: number, d: number): Date {
  const location = new Location(place.lat, place.lng, false, place.timezone, place.name);
  return new Zmanim(location, new Date(y, m - 1, d), false).sunset();
}

describe("getShabbatTimes", () => {
  it("lights candles ~18 minutes before sunset in Tbilisi on Friday", async () => {
    // Wednesday 28 Oct 2026 → the coming Shabbat is 30–31 Oct.
    const times = await getShabbatTimes(tbilisi, "en", new Date("2026-10-28T09:00:00Z"));
    expect(times.erevDate).toBe("2026-10-30");
    expect(times.shabbatDate).toBe("2026-10-31");
    const minutesBefore = (sunset(tbilisi, 2026, 10, 30).getTime() - times.candleLighting!.getTime()) / 60000;
    expect(minutesBefore).toBeGreaterThanOrEqual(17);
    expect(minutesBefore).toBeLessThanOrEqual(19);
    const minutesAfter = (times.havdalah!.getTime() - sunset(tbilisi, 2026, 10, 31).getTime()) / 60000;
    expect(minutesAfter).toBeGreaterThanOrEqual(49);
    expect(minutesAfter).toBeLessThanOrEqual(51);
  });

  it("names the weekly portion in each language", async () => {
    const from = new Date("2026-10-21T09:00:00Z"); // Shabbat 24 Oct 2026: Parashat Lech-Lecha
    const en = await getShabbatTimes(tbilisi, "en", from);
    const he = await getShabbatTimes(tbilisi, "he", from);
    expect(en.parasha).toBe("Lech-Lecha");
    expect(en.parashaTitle).toBe("Parashat Lech-Lecha");
    expect(he.parasha).toBe("לך לך");
    expect(he.parashaTitle).toBe("פרשת לך לך");
  });

  it("keeps the current Shabbat until Havdalah, then moves to the next week", async () => {
    const duringShabbat = await getShabbatTimes(tbilisi, "en", new Date("2026-10-31T08:00:00Z"));
    expect(duringShabbat.erevDate).toBe("2026-10-30");
    const afterHavdalah = await getShabbatTimes(tbilisi, "en", new Date("2026-10-31T18:00:00Z"));
    expect(afterHavdalah.erevDate).toBe("2026-11-06");
  });

  it("joins double portions", async () => {
    // Shabbat 17 Jul 2027 (diaspora): Chukat-Balak
    const times = await getShabbatTimes(tbilisi, "ru", new Date("2027-07-14T09:00:00Z"));
    expect(times.parasha).toBe("Хукат-Балак");
  });

  it("has no parasha on a holiday Shabbat", async () => {
    // Shabbat Chol HaMoed Pesach, 24 Apr 2027
    const times = await getShabbatTimes(tbilisi, "en", new Date("2027-04-21T09:00:00Z"));
    expect(times.parasha).toBeNull();
  });
});

describe("getHolidaysInRange", () => {
  it("detects Sukkot 2026 with a Yom Tov first day", async () => {
    const holidays = await getHolidaysInRange("2026-09-26", "2026-10-02", "en");
    const sukkot = holidays.filter((h) => h.key === "sukkot");
    expect(sukkot.length).toBeGreaterThanOrEqual(7);
    expect(sukkot[0]).toMatchObject({ date: "2026-09-26", isYomTov: true, name: "Sukkot (day 1)" });
    expect(sukkot.find((h) => h.date === "2026-09-28")).toMatchObject({ isYomTov: false, isCholHamoed: true });
    expect(holidays.map((h) => holidayFilterHint(h.key))).toContain("sukkah_space");
  });

  it("translates names and marks the eve", async () => {
    const he = await getHolidaysInRange(new Date("2027-04-21T10:00:00Z"), new Date("2027-04-22T10:00:00Z"), "he");
    expect(he.find((h) => h.isErev)?.name).toBe("ערב פסח");
    expect(he.find((h) => h.date === "2027-04-22")?.name).toBe("פסח (יום 1)");
  });

  it("counts Chanukah candles", async () => {
    const holidays = await getHolidaysInRange("2026-12-04", "2026-12-06", "en");
    expect(holidays.map((h) => h.name)).toEqual(["Chanukah: 1 candle", "Chanukah: 2 candles", "Chanukah: 3 candles"]);
  });

  it("includes Israeli national days", async () => {
    const holidays = await getHolidaysInRange("2027-05-01", "2027-05-31", "en");
    expect(holidays.map((h) => h.key)).toEqual(
      expect.arrayContaining(["yom-hashoah", "yom-hazikaron", "yom-haatzmaut", "lag-baomer"]),
    );
  });

  it("returns nothing for a quiet week", async () => {
    expect(await getHolidaysInRange("2026-11-02", "2026-11-06", "en")).toEqual([]);
  });
});

describe("holidayFilterHint", () => {
  it("suggests the right Jewish-feature filter", () => {
    expect(holidayFilterHint("sukkot")).toBe("sukkah_space");
    expect(holidayFilterHint("pesach")).toBe("pesach_ready");
    expect(holidayFilterHint("purim")).toBeNull();
  });
});

describe("isShabbatOrHolidayNow", () => {
  it("is Shabbat on Saturday noon", () => {
    const now = isShabbatOrHolidayNow(tbilisi, new Date("2026-10-31T08:00:00Z"));
    expect(now).toMatchObject({ active: true, kind: "shabbat", key: "shabbat", name: "Shabbat" });
    expect(now.endsAt!.getTime()).toBeGreaterThan(new Date("2026-10-31T08:00:00Z").getTime());
  });

  it("is Shabbat after Friday candle lighting but not before", () => {
    expect(isShabbatOrHolidayNow(tbilisi, new Date("2026-10-30T12:00:00Z")).active).toBe(false);
    expect(isShabbatOrHolidayNow(tbilisi, new Date("2026-10-30T15:00:00Z")).active).toBe(true);
  });

  it("is not Shabbat on a weekday or after Havdalah", () => {
    expect(isShabbatOrHolidayNow(tbilisi, new Date("2026-10-28T08:00:00Z"))).toMatchObject({ active: false, kind: null });
    expect(isShabbatOrHolidayNow(tbilisi, new Date("2026-10-31T18:00:00Z")).active).toBe(false);
  });

  it("detects Yom Tov on a weekday (Yom Kippur 2026)", () => {
    const now = isShabbatOrHolidayNow(tbilisi, new Date("2026-09-21T08:00:00Z"));
    expect(now).toMatchObject({ active: true, kind: "holiday", key: "yom-kippur" });
  });

  it("uses Israel time and the Israeli schedule for Jerusalem", () => {
    // 2nd day of Sukkot is a weekday in Israel (one day of Yom Tov) but Yom Tov in the diaspora.
    expect(isShabbatOrHolidayNow(jerusalem, new Date("2026-09-27T09:00:00Z")).active).toBe(false);
    expect(isShabbatOrHolidayNow(tbilisi, new Date("2026-09-27T09:00:00Z")).active).toBe(true);
  });
});

describe("hebrewDate", () => {
  it("uses Hebrew letters in Hebrew and transliteration otherwise", () => {
    expect(hebrewDate(new Date("2026-10-31T10:00:00Z"), "he")).toBe("כ׳ חשון תשפ״ז");
    expect(hebrewDate("2026-10-31", "en")).toBe("20 Cheshvan 5787");
    expect(hebrewDate("2026-10-31", "ru")).toBe("20 Хешван 5787");
    expect(hebrewDate("2026-10-31", "ar")).toMatch(/^20 \S+ 5787$/);
  });
});

describe("getJewishCalendarMonth", () => {
  it("lists every day with Hebrew dates, holidays and Shabbat times", async () => {
    const days = await getJewishCalendarMonth(2026, 9, "en", tbilisi);
    expect(days).toHaveLength(30);
    expect(days[0].date).toBe("2026-09-01");
    const roshHashana = days.find((d) => d.date === "2026-09-12")!;
    expect(roshHashana.holidays[0]).toMatchObject({ key: "rosh-hashana", isYomTov: true });
    const friday = days.find((d) => d.date === "2026-09-18")!;
    expect(friday.weekday).toBe(5);
    expect(friday.candleLighting).toMatch(/^2026-09-18T/);
    expect(days.find((d) => d.date === "2026-09-19")!.havdalah).toMatch(/^2026-09-19T/);
  });

  it("works without a place (no times)", async () => {
    const days = await getJewishCalendarMonth(2027, 2, "he");
    expect(days).toHaveLength(28);
    expect(days.every((d) => d.candleLighting === undefined)).toBe(true);
  });
});
