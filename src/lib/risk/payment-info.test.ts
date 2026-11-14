import { describe, expect, it } from "vitest";
import { detectExclusionaryText } from "./exclusion";
import {
  bech32Ok,
  cardNetworkOk,
  detectPaymentInfo,
  detectPaymentInfoIn,
  hasPaymentInfo,
  ibanChecksumOk,
  isValidIban,
  luhnOk,
  type PaymentFindingKind,
} from "./payment-info";

/**
 * SECURITY_REPORT 14.2.a: payment details are found in the 5 languages, written plainly or
 * obfuscated, and normal listing text (prices, dates, phones, codes) is never caught. All the
 * numbers are fake: the registry's example IBANs, card networks' test numbers and the BIP-173
 * example address.
 */

const kinds = (text: string): PaymentFindingKind[] => detectPaymentInfo(text).kinds;

/** A number with its Luhn check digit appended. */
function withLuhn(body: string): string {
  for (let d = 0; d <= 9; d++) if (luhnOk(`${body}${d}`)) return `${body}${d}`;
  throw new Error("no check digit");
}

/** An IBAN with correct check digits for `country` + `bban`. */
function iban(country: string, bban: string): string {
  for (let c = 2; c <= 98; c++) {
    const value = `${country}${String(c).padStart(2, "0")}${bban}`;
    if (ibanChecksumOk(value)) return value;
  }
  throw new Error("no check digits");
}

const group4 = (value: string) => value.replace(/(.{4})/g, "$1 ").trim();

describe("checksums", () => {
  it("validates IBANs with mod-97 and the country length", () => {
    expect(isValidIban("GE29NB0000000101904917")).toBe(true);
    expect(isValidIban("IL620108000000099999999")).toBe(true);
    expect(isValidIban("DE89 3704 0044 0532 0130 00")).toBe(true);
    expect(isValidIban("GE29NB0000000101904918")).toBe(false);
    expect(isValidIban("GE29NB000000010190491")).toBe(false);
    expect(isValidIban("XX29NB0000000101904917")).toBe(false);
  });

  it("validates card numbers with Luhn and the card network", () => {
    expect(luhnOk("4111111111111111")).toBe(true);
    expect(luhnOk("4111111111111112")).toBe(false);
    expect(cardNetworkOk("4111111111111111")).toBe(true);
    expect(cardNetworkOk("378282246310005")).toBe(true);
    expect(cardNetworkOk("1506202615092026")).toBe(false);
  });

  it("validates bech32 addresses", () => {
    expect(bech32Ok("bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4")).toBe(true);
    expect(bech32Ok("bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t5")).toBe(false);
  });
});

describe("payment links", () => {
  it.each([
    "Pay the deposit here: paypal.me/flat_owner",
    "PayPal.Me/FlatOwner for the deposit",
    "https://www.paypal.com/paypalme/flatowner",
    "revolut.me/owner123",
    "send it to wise.com/pay/r/abc123",
    "venmo.com/u/owner",
    "cash.app/$owner",
    "buy.stripe.com/test_00abc",
    "keepz.me/p/12345",
    "bit.ly/3xYzAb",
    "tinyurl.com/flat-deposit",
    "Complete the payment here: secure-booking-confirm.top/b/123",
    "To confirm your booking pay at booking-verify.site",
    "לתשלום המקדמה: payments-georgia.online/x",
  ])("blocks %s", (text) => {
    expect(kinds(text)).toContain("payment_link");
  });

  it.each([
    ["spaced letters", "p a y p a l . m e / owner"],
    ["dotted letters", "p.a.y.p.a.l.me/owner"],
    ["(dot)", "paypal(dot)me/owner"],
    ["[.]", "paypal[.]me/owner"],
    ["dot as a word", "paypal dot me slash owner"],
    ["Cyrillic look-alikes", "раураl.me/owner"],
    ["Greek look-alikes", "pαypαl.me/owner"],
    ["digits in the word", "p4yp4l.me/owner"],
    ["full-width letters", "ｐａｙｐａｌ．ｍｅ/owner"],
    ["invisible characters", "pay​pal.me/owner"],
  ])("sees through %s", (_label, text) => {
    expect(kinds(text)).toContain("payment_link");
  });
});

describe("IBANs", () => {
  it.each([
    "IBAN: GE29 NB00 0000 0101 9049 17",
    "GE29NB0000000101904917",
    "ge29 nb00 0000 0101 9049 17",
    "Transfer to IL62 0108 0000 0009 9999 999 please",
    "IL62-0108-0000-0009-9999-999",
    "DE89370400440532013000",
    "GB82 WEST 1234 5698 7654 32",
    `חשבון: ${iban("IL", "0126000000012345678")}`,
    `счёт ${group4(iban("GE", "TB1234567890123456"))}`,
  ])("blocks %s", (text) => {
    expect(kinds(text)).toContain("iban");
  });

  it("sees through look-alike letters and spelled-out digits", () => {
    expect(kinds("GЕ29 NВ00 0000 0101 9049 17")).toContain("iban"); // Cyrillic Е and В
  });

  it("blocks an IBAN that is labelled even with a typo in the check digits", () => {
    expect(kinds("IBAN GE00 NB00 0000 0101 9049 17")).toContain("iban");
    expect(kinds("איבאן: IL00 0108 0000 0009 9999 999")).toContain("iban");
  });

  it("ignores words that happen to follow letters and two digits", () => {
    expect(kinds("Walk to me 22 times a day and evening walks along the sea")).toEqual([]);
    expect(kinds("Flat GE22 is on the second floor of block B")).toEqual([]);
  });
});

describe("card numbers", () => {
  it.each([
    "card 4111 1111 1111 1111 exp 12/29",
    "4111-1111-1111-1111",
    "4111111111111111",
    "5555 5555 5555 4444",
    "3782 822463 10005",
    `Mir ${group4(withLuhn("220070021272707"))}`,
    "4 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1",
    "4111 l111 1111 1111",
    "٤١١١ ١١١١ ١١١١ ١١١١",
    "four one one one one one one one one one one one one one one one",
    "ארבע אחד אחד אחד אחד אחד אחד אחד אחד אחד אחד אחד אחד אחד אחד אחד",
  ])("blocks %s", (text) => {
    expect(kinds(text)).toContain("card_number");
  });

  it("never reads phones, dates or codes as a card", () => {
    expect(kinds("+995 555 12 34 56 or +972 54 123 4567")).toEqual([]);
    expect(kinds("0541234567 0549876543")).toEqual([]);
    expect(kinds("23.06.2026 - 30.06.2026 available")).toEqual([]);
    expect(kinds("15.06.2026-15.09.2026")).toEqual([]);
    expect(kinds("Cadastral code 01.14.14.009.033.01.500")).toEqual([]);
    expect(kinds("4111 1111 1111 1112")).toEqual([]);
  });
});

describe("card-detail requests", () => {
  it.each([
    "send me the CVV",
    "Please send your card number and expiry date",
    "To hold the booking we need your credit card details",
    "the 3 digits on the back",
    "Verify your card on the link we sent",
    "שלחו לי את מספר הכרטיס",
    "צריך את פרטי האשראי שלכם",
    "ואת שלוש הספרות בגב הכרטיס",
    "Пришлите номер карты",
    "Нужны данные карты для брони",
    "код безопасности карты",
    "أرسل رقم البطاقة",
    "نحتاج بيانات البطاقة",
    "გამომიგზავნეთ ბარათის ნომერი",
    "ბარათის მონაცემები",
    "c.v.v please",
  ])("blocks %s", (text) => {
    expect(kinds(text)).toContain("card_request");
  });

  it("allows paying by card on arrival and other uses of 'card' and 'visa'", () => {
    expect(kinds("We accept cash and card on arrival. Bank transfer at check-in is possible.")).toEqual([]);
    expect(kinds("Israelis need no visa. Visa info: up to 1 year stay.")).toEqual([]);
    expect(kinds("אפשר לשלם במזומן או בכרטיס אשראי בהגעה")).toEqual([]);
    expect(kinds("Оплата при заезде наличными или картой")).toEqual([]);
    expect(kinds("الدفع نقدا أو بالبطاقة عند الوصول")).toEqual([]);
    expect(kinds("გადახდა ადგილზე ნაღდით ან ბარათით")).toEqual([]);
  });
});

describe("crypto", () => {
  it.each([
    "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4",
    "Send to 1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2",
    "0x52908400098527886E0F7030069857D2E4169EE7",
    "TQn9Y2khEsLJW1ChVWFMSMeRDow5KcbLSE",
  ])("blocks the wallet %s", (text) => {
    expect(kinds(text)).toContain("crypto_wallet");
  });

  it.each([
    "Pay 100 USDT (TRC20)",
    "U.S.D.T only",
    "payment in bitcoin",
    "we accept crypto",
    "שלמו בביטקוין",
    "אפשר להעביר בקריפטו",
    "оплата криптовалютой",
    "переведите в биткоинах",
    "الدفع بالبيتكوين",
    "გადაიხადეთ კრიპტოვალუტით",
  ])("blocks the ask %s", (text) => {
    expect(kinds(text)).toContain("crypto_ask");
  });

  it("allows a plain mention of crypto without a payment word", () => {
    expect(kinds("No crypto mining in the apartment, please")).toEqual([]);
  });
});

describe("money transfers and gift cards", () => {
  it.each([
    "send via Western Union to my name",
    "Pay the deposit through MoneyGram",
    "Pay with Ria money transfer",
    "שלחו את המקדמה בווסטרן יוניון",
    "переведите через Вестерн Юнион",
    "ارسل العربون عبر ويسترن يونيون",
    "გადმორიცხეთ ვესტერნ იუნიონით, თანხა",
    "Give me the MTCN",
    "W3stern Uni0n transfer",
  ])("blocks %s", (text) => {
    expect(kinds(text)).toContain("money_transfer");
  });

  it.each(["Pay with iTunes gift card codes", "send Steam cards", "שלחו קודים של כרטיס מתנה", "оплата подарочными картами", "ادفع ببطاقات هدايا"])(
    "blocks the gift card ask %s",
    (text) => {
      expect(kinds(text)).toContain("gift_card");
    },
  );

  it("allows naming a service without asking for a payment", () => {
    expect(kinds("The Western Union office is next to the building")).toEqual([]);
    expect(kinds("ליד הבניין יש סניף של ווסטרן יוניון")).toEqual([]);
  });
});

describe("no false positives on normal listing text", () => {
  it.each([
    "Price 150 ₾ per night, 15.06-15.09.2026",
    "1,200 USD / month, deposit 1 month on signing the contract at the agency",
    "Price: 250 000 $. Bank transfer at the notary.",
    "דירה מקסימה 3 חדרים ליד הים, 250 שקל ללילה. צ'ק אין ב-14:00, צ'ק אאוט ב-11:00",
    "Уютная квартира, 2 спальни, 80 м², 5 этаж из 9. Заезд с 14:00.",
    "شقة جميلة قرب البحر، 3 غرف، 120 دولار لليلة",
    "ლამაზი ბინა ზღვასთან, 2 საძინებელი, ფასი 200 ლარი",
    "Listing #123456, cadastral 01.14.14.009.033, built in 2019, renovated 2024",
    "Kosher kitchen, Shabbat elevator, 5 minutes to the synagogue",
    "Payment on arrival in cash. Please pay the host when you arrive.",
    "Wi-Fi password is on the fridge. Room card at the reception.",
  ])("%s", (text) => {
    expect(detectPaymentInfo(text)).toEqual({ kinds: [], samples: [] });
  });

  it("joins several fields into one scan", () => {
    expect(hasPaymentInfo(detectPaymentInfoIn(["Nice flat", null, "IBAN GE29NB0000000101904917"]))).toBe(true);
    expect(hasPaymentInfo(detectPaymentInfoIn(["Nice flat", undefined, ""]))).toBe(false);
  });

  it("masks numbers in the samples it keeps", () => {
    const found = detectPaymentInfo("4111 1111 1111 1111 and GE29NB0000000101904917");
    expect(JSON.stringify(found.samples)).not.toContain("4111111111111111");
    expect(JSON.stringify(found.samples)).not.toContain("0101904917");
  });
});

describe("exclusionary text (14.5.e)", () => {
  it.each([
    "Apartment for Jews only",
    "No Arabs, no pets",
    "We don't rent to Russians",
    "not for Muslim guests",
    "לא לערבים",
    "ליהודים בלבד",
    "רק לישראלים",
    "לא משכירים לזרים",
    "Только для славян",
    "без кавказцев",
    "не сдаём иностранцам",
    "للمسلمين فقط",
    "ممنوع اليهود",
    "მხოლოდ ქართველებს",
    "უცხოელებს არ ვაქირავებთ",
  ])("flags %s", (text) => {
    expect(detectExclusionaryText(text).length).toBeGreaterThan(0);
  });

  it.each([
    "Kosher kitchen, suits religious families, near the synagogue",
    "The host speaks Hebrew and Russian, no English",
    "מתאים למשפחות דתיות, קרוב לבית הכנסת",
    "Хозяин говорит по-русски и по-английски",
    "قريب من المسجد والكنيسة",
    "ქართული და რუსული ენა",
  ])("does not flag %s", (text) => {
    expect(detectExclusionaryText(text)).toEqual([]);
  });
});

describe("the demo listings (real-looking text in 5 languages)", () => {
  it("has no payment details and no exclusionary text in any title or description", async () => {
    const { ALL_LISTINGS } = await import("../../../prisma/seed/listings/all");
    let checked = 0;
    for (const listing of ALL_LISTINGS) {
      for (const [locale, text] of Object.entries(listing.text)) {
        for (const part of [text.title, text.description]) {
          expect(detectPaymentInfo(part).samples, `listing ${listing.n} (${locale}): ${part.slice(0, 60)}`).toEqual([]);
          expect(detectExclusionaryText(part), `listing ${listing.n} (${locale})`).toEqual([]);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(100);
  });
});
