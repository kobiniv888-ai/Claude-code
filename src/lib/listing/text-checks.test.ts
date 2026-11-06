import { describe, expect, it } from "vitest";
import {
  clockMinutes,
  dominantScript,
  findCurrencyMentions,
  findStayTimes,
  findTimeMentions,
  normalizeListingText,
  titleScriptMismatch,
} from "./text-checks";

/** "kind HH:MM|HH:MM" for each mention, to keep the expectations short. */
function times(description: string): string[] {
  return findStayTimes(description).map(
    (m) => `${m.kind} ${m.time.minutes.map((x) => `${String(Math.floor(x / 60)).padStart(2, "0")}:${String(x % 60).padStart(2, "0")}`).join("|")}`,
  );
}

describe("findStayTimes: Hebrew", () => {
  it("reads 24-hour times after צ'ק אין / צ'ק אאוט (the founder's listing 44)", () => {
    expect(times("צ'ק אין בשעה 13:00, צ'ק אאוט עד 10:00.")).toEqual(["checkIn 13:00", "checkOut 10:00|22:00"]);
  });

  it("reads everyday wording: בשעה 1 בצהריים, 10 בבוקר", () => {
    expect(times("הכניסה בשעה 1 בצהריים והיציאה עד 10 בבוקר")).toEqual(["checkIn 13:00", "checkOut 10:00"]);
  });

  it("reads אחה\"צ, בערב, the Hebrew geresh and a maqaf", () => {
    expect(times("צ׳ק־אין מ-3 אחה״צ. צ׳ק־אאוט עד 11 בבוקר")).toEqual(["checkIn 15:00", "checkOut 11:00"]);
    expect(times("הגעה אחרי 8 בערב")).toEqual(["checkIn 20:00"]);
  });

  it("reads בשעה with a bare 24-hour number, and noon", () => {
    expect(times("כניסה החל מהשעה 14, פינוי הדירה בצהריים")).toEqual(["checkIn 14:00", "checkOut 12:00"]);
  });

  it("skips late check-out and early check-in (their times are extras)", () => {
    expect(times("יציאה מאוחרת עד 14:00 בתוספת תשלום. צ'ק אין מוקדם בשעה 10:00 בתיאום")).toEqual([]);
  });

  it("does not read a price or a count as a time", () => {
    expect(times("כניסה לבריכה: 50 ₪ לאדם")).toEqual([]);
    expect(times("צ'ק אין ל-4 אורחים")).toEqual([]);
  });
});

describe("findStayTimes: English", () => {
  it("reads am/pm and noon", () => {
    expect(times("Check-in at 1pm, check-out by 11 a.m.")).toEqual(["checkIn 13:00", "checkOut 11:00"]);
    expect(times("Checkout before noon.")).toEqual(["checkOut 12:00"]);
  });

  it("reads 24-hour times and ranges", () => {
    expect(times("Check in from 14:00 to 22:00. Check out until 11:00")).toEqual(["checkIn 14:00", "checkIn 22:00", "checkOut 11:00|23:00"]);
  });

  it("reads a bare hour after a preposition as either am or pm", () => {
    expect(times("Check-in after 3, checkout by 11.")).toEqual(["checkIn 03:00|15:00", "checkOut 11:00|23:00"]);
  });

  it("does not read a count after a preposition as an hour", () => {
    expect(times("Check-in for 2 guests only")).toEqual([]);
    expect(times("Arrival from 3 airports is easy")).toEqual([]);
  });

  it("skips late check-out, prices and dates", () => {
    expect(times("Late check-out until 2pm for 20 GEL")).toEqual([]);
    expect(times("Check-in fee 10.50 ₾")).toEqual([]);
    expect(times("Check-in on 14.11.2026")).toEqual([]);
  });

  it("reads the time of the word it belongs to when both share a sentence", () => {
    expect(times("Check-in 15:00 and check-out 10:00")).toEqual(["checkIn 15:00", "checkOut 10:00|22:00"]);
  });

  it("'after noon' is not 12:00", () => {
    expect(times("Check-in after noon")).toEqual([]);
  });
});

describe("findStayTimes: Russian", () => {
  it("reads заезд с 14:00 / выезд до 12:00", () => {
    expect(times("Заезд с 14:00, выезд до 12:00.")).toEqual(["checkIn 14:00", "checkOut 12:00"]);
  });

  it("reads everyday wording: 2 часа дня, 11 утра, 8 вечера", () => {
    expect(times("Заселение после 2 часов дня, выселение до 11 утра")).toEqual(["checkIn 14:00", "checkOut 11:00"]);
    expect(times("Заезд в 8 вечера")).toEqual(["checkIn 20:00"]);
  });

  it("reads bare 24-hour numbers after с / до", () => {
    expect(times("заезд с 14, выезд до 12")).toEqual(["checkIn 14:00", "checkOut 12:00"]);
  });

  it("does not read a count as an hour, and skips поздний выезд", () => {
    expect(times("Заезд с 2 детьми возможен")).toEqual([]);
    expect(times("Поздний выезд до 15:00 за доплату")).toEqual([]);
  });
});

describe("findStayTimes: Arabic", () => {
  it("reads تسجيل الوصول / المغادرة with ظهرًا and صباحًا", () => {
    expect(times("تسجيل الوصول الساعة 2 ظهرًا وتسجيل المغادرة حتى 11 صباحًا")).toEqual(["checkIn 14:00", "checkOut 11:00"]);
  });

  it("reads Arabic-Indic digits and مساءً", () => {
    expect(times("تسجيل الدخول من الساعة ١٤:٠٠، الخروج حتى ١٢:٠٠")).toEqual(["checkIn 14:00", "checkOut 12:00"]);
    expect(times("الوصول بعد 3 مساءً")).toEqual(["checkIn 15:00"]);
  });

  it("skips late check-out", () => {
    expect(times("المغادرة المتأخرة حتى 14:00 مقابل رسوم")).toEqual([]);
  });
});

describe("findStayTimes: Georgian", () => {
  it("reads შესვლა 14:00-დან / გასვლა 12:00-მდე", () => {
    expect(times("შესვლა 14:00-დან, გასვლა 12:00-მდე")).toEqual(["checkIn 14:00", "checkOut 12:00"]);
  });

  it("reads markers before the number: შუადღის 2 საათზე, დილის 11 საათზე, საღამოს 8", () => {
    expect(times("ჩეკ-ინი შუადღის 2 საათზე, ჩეკ-აუთი დილის 11 საათზე")).toEqual(["checkIn 14:00", "checkOut 11:00"]);
    expect(times("განთავსება საღამოს 8 საათიდან")).toEqual(["checkIn 20:00"]);
  });

  it("reads a time written before the word (14:00-დან შესვლა)", () => {
    expect(times("14:00-დან შესვლა")).toEqual(["checkIn 14:00"]);
  });

  it("skips გვიანი გასვლა (late check-out)", () => {
    expect(times("გვიანი გასვლა 15:00-მდე დამატებით საფასურად")).toEqual([]);
  });

  it("keeps the marker in the written words", () => {
    const [mention] = findStayTimes("ჩეკ-ინი შუადღის 2 საათზე");
    expect(mention.time.text).toBe("შუადღის 2 საათზე");
  });
});

describe("findTimeMentions", () => {
  it("12 pm is noon, 12 am and 12 at night are midnight", () => {
    expect(findTimeMentions("12 pm").map((t) => t.minutes)).toEqual([[720]]);
    expect(findTimeMentions("12 am").map((t) => t.minutes)).toEqual([[0]]);
    expect(findTimeMentions("11 בלילה").map((t) => t.minutes)).toEqual([[23 * 60]]);
  });

  it("an hour above 12 needs no marker and keeps its minutes", () => {
    expect(findTimeMentions("בשעה 13:30").map((t) => t.minutes)).toEqual([[13 * 60 + 30]]);
  });
});

describe("clockMinutes", () => {
  it("reads HH:MM and rejects the rest", () => {
    expect(clockMinutes("14:00")).toBe(840);
    expect(clockMinutes("9:30")).toBe(570);
    expect(clockMinutes("")).toBeNull();
    expect(clockMinutes(null)).toBeNull();
    expect(clockMinutes("25:00")).toBeNull();
  });
});

describe("findCurrencyMentions", () => {
  it("finds prices in every language and sign", () => {
    expect(
      findCurrencyMentions('קנס של 200 שקל, $50, 50 лари, 30₾, €20, 100 ש"ח, 5 דולר, 20 евро, 50 ლარი, 10 دولار, 7 NIS, 300 руб.').map(
        (m) => `${m.currency} ${m.text}`,
      ),
    ).toEqual([
      "ILS 200 שקל",
      "USD $50",
      "GEL 50 лари",
      "GEL 30₾",
      "EUR €20",
      'ILS 100 ש"ח',
      "USD 5 דולר",
      "EUR 20 евро",
      "GEL 50 ლარი",
      "USD 10 دولار",
      "ILS 7 NIS",
      "RUB 300 руб.",
    ]);
  });

  it("finds Hebrew gershayim and Arabic-Indic digits", () => {
    expect(findCurrencyMentions("200 ש״ח").map((m) => m.currency)).toEqual(["ILS"]);
    expect(findCurrencyMentions("٢٠٠ شيكل").map((m) => m.text)).toEqual(["200 شيكل"]);
  });

  it("a currency word without a number is not a price", () => {
    expect(findCurrencyMentions("We accept dollars and euros, משלמים בשקלים")).toEqual([]);
  });
});

describe("titles: dominantScript and titleScriptMismatch", () => {
  it("names the alphabet as a locale", () => {
    expect(dominantScript("דירה מול הים")).toBe("he");
    expect(dominantScript("Квартира у моря")).toBe("ru");
    expect(dominantScript("ბინა ზღვასთან")).toBe("ka");
    expect(dominantScript("شقة بجانب البحر")).toBe("ar");
    expect(dominantScript("Sea view flat")).toBe("en");
    expect(dominantScript("12 3")).toBeNull();
  });

  it("warns for a title clearly in another alphabet", () => {
    expect(titleScriptMismatch("Sunny flat in Batumi", "he")).toBe("en");
    expect(titleScriptMismatch("Квартира у моря", "en")).toBe("ru");
    expect(titleScriptMismatch("ბინა ზღვასთან", "ru")).toBe("ka");
  });

  it("allows a brand or place name in Latin letters inside a title", () => {
    expect(titleScriptMismatch("דירה מול הים ב-Orbi City", "he")).toBeNull();
    expect(titleScriptMismatch("Квартира в Orbi City у моря", "ru")).toBeNull();
    expect(titleScriptMismatch("שקט ונוף", "he")).toBeNull();
  });
});

describe("normalizeListingText", () => {
  it("unifies apostrophes, quotes, dashes and digits", () => {
    expect(normalizeListingText("צ׳ק־אין ש״ח ١٤")).toBe("צ'ק-אין ש\"ח 14");
  });
});
