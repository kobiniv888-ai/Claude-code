import { describe, expect, it } from "vitest";
import { hasTitleEmoji, stripTitleEmoji } from "./emoji";

const cp = (...points: number[]) => String.fromCodePoint(...points);
const BEACH = cp(0x1f3d6, 0xfe0f); // beach with umbrella + emoji presentation
const PIN = cp(0x1f4cd); // round pushpin
const PARTY = cp(0x1f389);
const FAMILY = cp(0x1f468, 0x200d, 0x1f469, 0x200d, 0x1f467); // man ZWJ woman ZWJ girl
const THUMBS_DARK = cp(0x1f44d, 0x1f3ff); // thumbs up + skin tone
const FLAG_GE = cp(0x1f1ec, 0x1f1ea);
const FLAG_IL = cp(0x1f1ee, 0x1f1f1);
const FLAG_ENGLAND = cp(0x1f3f4, 0xe0067, 0xe0062, 0xe0065, 0xe006e, 0xe0067, 0xe007f);
const KEYCAP_1 = cp(0x31, 0xfe0f, 0x20e3);
const HEART = cp(0x2764, 0xfe0f);
const STAR = cp(0x2b50);
const SPARKLES = cp(0x2728);
const FIRE = cp(0x1f525);
const RAINBOW_FLAG = cp(0x1f3f3, 0xfe0f, 0x200d, 0x1f308);

describe("stripTitleEmoji", () => {
  it("the founder's real title (listing 43)", () => {
    const title = `${BEACH} ORBI CITY – ზღვის პირველი ზოლი ${PIN} ზღვიდან რამდენიმე ნაბიჯში`;
    expect(stripTitleEmoji(title)).toBe("ORBI CITY – ზღვის პირველი ზოლი ზღვიდან რამდენიმე ნაბიჯში");
    expect(hasTitleEmoji(title)).toBe(true);
  });

  it("removes ZWJ sequences, skin tones, flags, tag flags and keycaps whole", () => {
    expect(stripTitleEmoji(`${FAMILY} Family flat`)).toBe("Family flat");
    expect(stripTitleEmoji(`Great host ${THUMBS_DARK}`)).toBe("Great host");
    expect(stripTitleEmoji(`${FLAG_GE}${FLAG_IL} Batumi`)).toBe("Batumi");
    expect(stripTitleEmoji(`London ${FLAG_ENGLAND} style`)).toBe("London style");
    expect(stripTitleEmoji(`${KEYCAP_1} bedroom`)).toBe("bedroom");
    expect(stripTitleEmoji(`Pride ${RAINBOW_FLAG} week`)).toBe("Pride week");
    expect(stripTitleEmoji(`${HEART}${STAR}${SPARKLES} דירה ${PARTY}`)).toBe("דירה");
  });

  it("tidies separators left hanging", () => {
    expect(stripTitleEmoji(`${FIRE} - Sea view`)).toBe("Sea view");
    expect(stripTitleEmoji(`Sea view | ${FIRE}`)).toBe("Sea view");
    expect(stripTitleEmoji(`Sea view - ${FIRE} - Batumi`)).toBe("Sea view - Batumi");
    expect(stripTitleEmoji(`Sea view ${FIRE}${FIRE}   Batumi`)).toBe("Sea view Batumi");
    expect(stripTitleEmoji(`${FIRE}`)).toBe("");
  });

  it("never touches letters, digits or ordinary punctuation", () => {
    for (const text of [
      "דירה מרווחת ליד הים, 3 חדרים!",
      "شقة جميلة قرب البحر (٣ غرف)",
      "Квартира у моря — 2 комнаты, 45 м²",
      "ბინა ზღვასთან ახლოს: 2 ოთახი",
      "Apt. #5 - 2BR / 1BA * new * 100%",
      "Hilton® Batumi ™ ©2026",
      "Room 1-2 · Old Town • quiet",
      "  spaces kept as they were  ",
    ]) {
      expect(stripTitleEmoji(text)).toBe(text);
      expect(hasTitleEmoji(text)).toBe(false);
    }
    // Digits next to an emoji stay.
    expect(stripTitleEmoji(`2${STAR} rooms`)).toBe("2 rooms");
    expect(stripTitleEmoji("")).toBe("");
    expect(hasTitleEmoji(null)).toBe(false);
  });

  it("emoji-styled ©/® (with U+FE0F) go, text ©/® stay", () => {
    expect(stripTitleEmoji(`Batumi ${cp(0xae, 0xfe0f)}`)).toBe("Batumi");
    expect(stripTitleEmoji(`Batumi ${cp(0xae)}`)).toBe(`Batumi ${cp(0xae)}`);
  });

  it("keeps a zero-width joiner inside a word of its script", () => {
    const zwjWord = `ab${cp(0x200d)}cd`;
    expect(stripTitleEmoji(`${zwjWord} ${FIRE}`)).toBe(zwjWord);
  });
});
