/**
 * i18n-1 (round 3, phase 4 hardening): guest and room counts in the room picker and the hotel
 * calendar are ICU plurals in every language ("עד אורח אחד", "до 21 гостя", "свободно 0 из 1"
 * never shows). The same arguments as room-picker.tsx and room-calendar.tsx.
 */
import fs from "node:fs";
import path from "node:path";
import { createTranslator } from "use-intl/core";
import { describe, expect, it } from "vitest";
import { formatNumber } from "@/lib/format";

const LOCALES = ["he", "en", "ru", "ar", "ka"] as const;
const load = (locale: string, ns: string) => JSON.parse(fs.readFileSync(path.join(process.cwd(), "messages", locale, `${ns}.json`), "utf8"));

function texts(locale: (typeof LOCALES)[number]) {
  const booking = createTranslator({ locale, messages: { booking: load(locale, "booking") }, namespace: "booking" });
  const host = createTranslator({ locale, messages: { hostBooking: load(locale, "hostBooking") }, namespace: "hostBooking.calendar.rooms" });
  const n = (value: number) => formatNumber(value, locale);
  return {
    fits: (guests: number, rooms: number) => booking("rooms.fits", { count: guests, countText: n(guests), rooms, roomsText: n(rooms) }),
    needRooms: (guests: number, rooms: number) => booking("rooms.needRooms", { count: guests, countText: n(guests), rooms: booking("price.rooms", { count: rooms }) }),
    freeOf: (free: number, total: number) => host("freeOf", { free, freeText: n(free), total, totalText: n(total) }),
  };
}

describe("room counts in sentences", () => {
  it("are plural-correct in every language", () => {
    const he = texts("he");
    expect(he.fits(1, 1)).toBe("אורח אחד בחדר אחד");
    expect(he.fits(4, 2)).toBe("עד 4 אורחים בשני חדרים");
    expect(he.fits(6, 3)).toBe("עד 6 אורחים ב־3 חדרים");
    expect(he.freeOf(1, 3)).toBe("1 מתוך 3 חדרים פנויים");
    expect(he.freeOf(0, 1)).toBe("החדר תפוס");
    expect(he.freeOf(1, 1)).toBe("החדר פנוי");

    const en = texts("en");
    expect(en.fits(1, 1)).toBe("1 guest in 1 room");
    expect(en.fits(21, 3)).toBe("Up to 21 guests in 3 rooms");
    expect(en.freeOf(0, 1)).toBe("The room is taken");

    const ru = texts("ru");
    expect(ru.fits(1, 1)).toBe("До 1 гостя в 1 номере");
    expect(ru.fits(21, 3)).toBe("До 21 гостя в 3 номерах");
    expect(ru.fits(4, 2)).toBe("До 4 гостей в 2 номерах");
    expect(ru.needRooms(21, 3)).toContain("Для 21 гостя");
    expect(ru.freeOf(0, 1)).toBe("номер занят");
    expect(ru.freeOf(5, 21)).toBe("свободно 5 из 21 номера");
    expect(ru.freeOf(2, 3)).toBe("свободно 2 из 3 номеров");

    const ar = texts("ar");
    expect(ar.fits(1, 1)).toBe("ضيف واحد في غرفة واحدة");
    expect(ar.fits(21, 2)).toBe("حتى 21 ضيفًا في غرفتين");
    expect(ar.freeOf(0, 1)).toBe("الغرفة محجوزة");

    for (const locale of LOCALES) {
      const t = texts(locale);
      for (const text of [t.fits(1, 1), t.fits(21, 3), t.needRooms(4, 2), t.freeOf(0, 1), t.freeOf(2, 3)]) {
        expect(text, `${locale}: ${text}`).not.toMatch(/[{}#]|[٠-٩]/);
      }
    }
    expect(texts("he").fits(1, 1)).not.toContain("1 אורחים");
  });
});
