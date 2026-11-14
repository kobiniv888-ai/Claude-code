import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createTranslator } from "use-intl/core";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ db: {} }));
// getTranslations needs the Next.js request context; read the real message files instead.
vi.mock("next-intl/server", () => ({
  getTranslations: async ({ locale, namespace }: { locale: string; namespace: string }) => {
    const [file, ...rest] = namespace.split(".");
    const messages = { [file]: JSON.parse(fs.readFileSync(path.join(process.cwd(), "messages", locale, `${file}.json`), "utf8")) };
    return createTranslator({ locale, messages, namespace: [file, ...rest].join(".") });
  },
}));

const { stayObservances } = await import("./server");

const tbilisi = { lat: 41.7151, lng: 44.8271, timezone: "Asia/Tbilisi" };

describe("stayObservances (Tbilisi, Israeli calendar, real @hebcal/core times)", () => {
  it("a stay with a Friday night: one Shabbat with candle lighting and Havdalah", async () => {
    const result = await stayObservances({ checkIn: "2026-11-12", checkOut: "2026-11-14", place: tbilisi }, "he");
    expect(result?.kind).toBe("shabbat");
    expect(result?.windows).toHaveLength(1);
    const [shabbat] = result!.windows;
    expect(shabbat.title).toBe("שבת");
    expect(shabbat.candleLighting.map((c) => c.date)).toEqual(["2026-11-13"]);
    expect(shabbat.havdalah?.date).toBe("2026-11-14");
    // Sunset in Tbilisi in mid-November is about 17:40 (13:40 UTC): candles before, Havdalah after.
    const candles = shabbat.candleLighting[0].time.getTime();
    expect(candles).toBeGreaterThan(Date.parse("2026-11-13T13:00:00Z"));
    expect(candles).toBeLessThan(Date.parse("2026-11-13T14:00:00Z"));
    expect(shabbat.havdalah!.time.getTime()).toBeGreaterThan(Date.parse("2026-11-14T14:00:00Z"));
  });

  it("no Friday night and no holiday: nothing at all", async () => {
    expect(await stayObservances({ checkIn: "2026-11-15", checkOut: "2026-11-20", place: tbilisi }, "en")).toBeNull();
    expect(await stayObservances({ checkIn: "2026-11-14", checkOut: "2026-11-16", place: tbilisi }, "en")).toBeNull();
  });

  it("Erev Pesach on a weekday: a holiday window, one day of Yom Tov (Israel)", async () => {
    const result = await stayObservances({ checkIn: "2027-04-20", checkOut: "2027-04-22", place: tbilisi }, "en");
    expect(result?.kind).toBe("holiday");
    expect(result?.windows.map((w) => [w.startDate, w.endDate])).toEqual([["2027-04-21", "2027-04-22"]]);
    expect(result?.windows[0].title).toMatch(/Pesach|Passover/i);
  });

  it("Pesach II is not Yom Tov on the Israeli calendar: Thursday night alone shows nothing", async () => {
    expect(await stayObservances({ checkIn: "2027-04-22", checkOut: "2027-04-23", place: tbilisi }, "en")).toBeNull();
  });

  it("Rosh Hashana on Shabbat: one window, two candle lightings, both names", async () => {
    const result = await stayObservances({ checkIn: "2026-09-10", checkOut: "2026-09-14", place: tbilisi }, "en");
    expect(result?.kind).toBe("both");
    expect(result?.windows).toHaveLength(1);
    expect(result?.windows[0].candleLighting.map((c) => c.date)).toEqual(["2026-09-11", "2026-09-12"]);
    expect(result?.windows[0].havdalah?.date).toBe("2026-09-13");
    expect(result?.windows[0].title).toMatch(/Shabbat · Rosh Hashana/);
  });

  it("without a place: the rule still applies, with no times", async () => {
    expect(await stayObservances({ checkIn: "2026-11-12", checkOut: "2026-11-14", place: null }, "ru")).toEqual({ kind: "shabbat", windows: [] });
  });
});
