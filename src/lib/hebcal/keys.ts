/**
 * Stable keys for Jewish holidays and Torah portions (client-safe, pure).
 * Names in every language live in messages/<locale>/hebcal.json under the same keys:
 *   holidays.<HolidayKey>, parashot.<parasha key>, months.<month key>.
 */

export const HOLIDAY_KEYS = [
  "rosh-hashana",
  "tzom-gedaliah",
  "yom-kippur",
  "sukkot",
  "shemini-atzeret",
  "simchat-torah",
  "chanukah",
  "asara-btevet",
  "tu-bishvat",
  "taanit-esther",
  "purim",
  "shushan-purim",
  "pesach",
  "yom-hashoah",
  "yom-hazikaron",
  "yom-haatzmaut",
  "pesach-sheni",
  "lag-baomer",
  "yom-yerushalayim",
  "shavuot",
  "tzom-tammuz",
  "tisha-bav",
  "tu-bav",
] as const;
export type HolidayKey = (typeof HOLIDAY_KEYS)[number];

export type HolidayCategory = "major" | "minor" | "fast" | "modern";

/** Hebcal's English event base name → our key. Events not listed here are not shown. */
export const HEBCAL_HOLIDAY_KEYS: Record<string, HolidayKey> = {
  "Rosh Hashana": "rosh-hashana",
  "Tzom Gedaliah": "tzom-gedaliah",
  "Yom Kippur": "yom-kippur",
  Sukkot: "sukkot",
  "Shmini Atzeret": "shemini-atzeret",
  "Simchat Torah": "simchat-torah",
  Chanukah: "chanukah",
  "Asara B'Tevet": "asara-btevet",
  "Tu BiShvat": "tu-bishvat",
  "Ta'anit Esther": "taanit-esther",
  Purim: "purim",
  "Shushan Purim": "shushan-purim",
  Pesach: "pesach",
  "Yom HaShoah": "yom-hashoah",
  "Yom HaZikaron": "yom-hazikaron",
  "Yom HaAtzma'ut": "yom-haatzmaut",
  "Pesach Sheni": "pesach-sheni",
  "Lag BaOmer": "lag-baomer",
  "Yom Yerushalayim": "yom-yerushalayim",
  Shavuot: "shavuot",
  "Tzom Tammuz": "tzom-tammuz",
  "Tish'a B'Av": "tisha-bav",
  "Tu B'Av": "tu-bav",
};

export const HOLIDAY_CATEGORY: Record<HolidayKey, HolidayCategory> = {
  "rosh-hashana": "major",
  "tzom-gedaliah": "fast",
  "yom-kippur": "major",
  sukkot: "major",
  "shemini-atzeret": "major",
  "simchat-torah": "major",
  chanukah: "minor",
  "asara-btevet": "fast",
  "tu-bishvat": "minor",
  "taanit-esther": "fast",
  purim: "minor",
  "shushan-purim": "minor",
  pesach: "major",
  "yom-hashoah": "modern",
  "yom-hazikaron": "modern",
  "yom-haatzmaut": "modern",
  "pesach-sheni": "minor",
  "lag-baomer": "minor",
  "yom-yerushalayim": "modern",
  shavuot: "major",
  "tzom-tammuz": "fast",
  "tisha-bav": "fast",
  "tu-bav": "minor",
};

export function isHolidayKey(value: unknown): value is HolidayKey {
  return typeof value === "string" && (HOLIDAY_KEYS as readonly string[]).includes(value);
}

/** Listing filters that matter during a holiday (keys of the Jewish-features vocabulary). */
export type HolidayFilterHint = "sukkah_space" | "pesach_ready";

/**
 * "Your dates include Sukkot — filter for sukkah space."
 * Returns the Jewish-feature filter worth suggesting for a holiday, or null.
 */
export function holidayFilterHint(key: string): HolidayFilterHint | null {
  if (key === "sukkot") return "sukkah_space";
  if (key === "pesach") return "pesach_ready";
  return null;
}

/** Hebcal's English parasha names → our message keys. */
export const PARASHA_KEYS: Record<string, string> = {
  Bereshit: "bereshit",
  Noach: "noach",
  "Lech-Lecha": "lech-lecha",
  Vayera: "vayera",
  "Chayei Sara": "chayei-sara",
  Toldot: "toldot",
  Vayetzei: "vayetzei",
  Vayishlach: "vayishlach",
  Vayeshev: "vayeshev",
  Miketz: "miketz",
  Vayigash: "vayigash",
  Vayechi: "vayechi",
  Shemot: "shemot",
  Vaera: "vaera",
  Bo: "bo",
  Beshalach: "beshalach",
  Yitro: "yitro",
  Mishpatim: "mishpatim",
  Terumah: "terumah",
  Tetzaveh: "tetzaveh",
  "Ki Tisa": "ki-tisa",
  Vayakhel: "vayakhel",
  Pekudei: "pekudei",
  Vayikra: "vayikra",
  Tzav: "tzav",
  Shmini: "shmini",
  Tazria: "tazria",
  Metzora: "metzora",
  "Achrei Mot": "achrei-mot",
  Kedoshim: "kedoshim",
  Emor: "emor",
  Behar: "behar",
  Bechukotai: "bechukotai",
  Bamidbar: "bamidbar",
  Nasso: "nasso",
  "Beha'alotcha": "behaalotcha",
  "Sh'lach": "shlach",
  Korach: "korach",
  Chukat: "chukat",
  Balak: "balak",
  Pinchas: "pinchas",
  Matot: "matot",
  Masei: "masei",
  Devarim: "devarim",
  Vaetchanan: "vaetchanan",
  Eikev: "eikev",
  "Re'eh": "reeh",
  Shoftim: "shoftim",
  "Ki Teitzei": "ki-teitzei",
  "Ki Tavo": "ki-tavo",
  Nitzavim: "nitzavim",
  Vayeilech: "vayeilech",
  "Ha'azinu": "haazinu",
  "Vezot Haberakhah": "vezot-haberakhah",
};

/** Portions that are sometimes read together; each has its own message key. */
export const COMBINED_PARASHA_KEYS = [
  "vayakhel-pekudei",
  "tazria-metzora",
  "achrei-mot-kedoshim",
  "behar-bechukotai",
  "chukat-balak",
  "matot-masei",
  "nitzavim-vayeilech",
] as const;

/** ["Vayakhel", "Pekudei"] → "vayakhel-pekudei". Unknown names are slugified. */
export function parashaKey(names: readonly string[]): string {
  return names
    .map(
      (name) =>
        PARASHA_KEYS[name] ??
        name
          .toLowerCase()
          .replace(/['’]/g, "")
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, ""),
    )
    .join("-");
}

/** Hebcal month names → message keys under "months". */
export const MONTH_KEYS: Record<string, string> = {
  Nisan: "nisan",
  Iyyar: "iyyar",
  Sivan: "sivan",
  Tamuz: "tamuz",
  Av: "av",
  Elul: "elul",
  Tishrei: "tishrei",
  Cheshvan: "cheshvan",
  Kislev: "kislev",
  Tevet: "tevet",
  "Sh'vat": "shvat",
  Adar: "adar",
  "Adar I": "adar1",
  "Adar II": "adar2",
};
