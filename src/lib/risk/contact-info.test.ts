import { describe, expect, it } from "vitest";
import { detectContactInfo, hasContactInfo } from "./contact-info";

const phones = (text: string) => detectContactInfo(text).phones;
const urls = (text: string) => detectContactInfo(text).urls;
const emails = (text: string) => detectContactInfo(text).emails;
const handles = (text: string) => detectContactInfo(text).handles;

describe("phones", () => {
  it.each([
    ["Call me: +995 555 12 34 56", "+995555123456"],
    ["WhatsApp 555-123-456 any time", "+995555123456"],
    ["Mobile: (+995) 599 12-34-56", "+995599123456"],
    ["00995 577 123 456", "+995577123456"],
    ["לפרטים: 054-1234567", "+972541234567"],
    ["התקשרו 050 123 4567 בכל שעה", "+972501234567"],
    ["טלפון +972-52-123-4567", "+972521234567"],
    ["Звоните 8 (916) 123-45-67", "+79161234567"],
    ["Пишите в вотсап +7 916 123 45 67", "+79161234567"],
    ["Телефон: +380 67 123 4567", "+380671234567"],
    ["اتصل على ٥٥٥١٢٣٤٥٦", "+995555123456"],
    ["واتساب: +٩٩٥ ٥٩٩ ١٢ ٣٤ ٥٦", "+995599123456"],
    ["დამირეკეთ 599 12 34 56", "+995599123456"],
    ["ტელ: 568.12.34.56", "+995568123456"],
    ["Tbilisi landline 032 2 12 34 56", "+995322123456"],
    ["full width ５５５１２３４５６", "+995555123456"],
    ["hidden 555​123​456 characters", "+995555123456"],
  ])("finds the number in %j", (text, expected) => {
    expect(phones(text)).toEqual([expected]);
  });

  it("finds numbers spelled out digit by digit", () => {
    expect(phones("call 0 5 4 1 2 3 4 5 6 7 now")).toHaveLength(1);
    expect(phones("5.9.9.1.2.3.4.5.6")).toHaveLength(1);
    expect(phones("5 - 5 - 5 - 1 - 2 - 3 - 4 - 5 - 6")).toHaveLength(1);
  });

  it("finds two numbers", () => {
    expect(phones("555 12 34 56 or 054-1234567")).toEqual(["+995555123456", "+972541234567"]);
  });

  it.each([
    "Price: 1 500 000 ₾",
    "₾ 250 000 for the whole flat",
    "Sale price 2 500 000 000 GEL (yes, a palace)",
    "1,250,000$ negotiable",
    "מחיר: 1,200,000 ₪",
    "מחיר 950 000 ש\"ח",
    "Цена 120 000 $ торг",
    "Цена: 350 000 000 лари",
    "السعر 250000 دولار",
    "ფასი 150 000 ₾",
    "Built in 2019, renovated in 2023",
    "Renovated 2019 2020 2021 2022",
    "120 m², floor 5 of 12, ID 12345",
    "Listing ID 123456789",
    "Квартира 85 кв.м, 4 этаж из 9",
    "דירת 4 חדרים, 105 מ\"ר, קומה 3 מתוך 8",
    "شقة ٣ غرف، ٨٥ م٢، الطابق ٤",
    "3 ოთახი, 85 მ², მე-4 სართული",
    "Cadastral code 01.14.14.009.033",
    "Cadastral 01.14.14.009.033.01.500",
    "Available 12.05.2026 - 15.05.2026",
    "Dates 2026-05-12 – 2026-05-19",
    "Check-in 14:00, check-out 11:00",
    "3.5 km to the sea, 15 min to the airport",
    "Land 1 200 000 m2 for development",
    "Plot 600 sq m, 1 250 000 USD",
  ])("ignores %j", (text) => {
    expect(phones(text)).toEqual([]);
  });
});

describe("links", () => {
  it.each([
    ["See https://airbnb.com/rooms/123.", "https://airbnb.com/rooms/123"],
    ["www.myflat.ge has more photos", "www.myflat.ge"],
    ["write me wa.me/995555123456", "wa.me/995555123456"],
    ["Telegram: t.me/batumi_flats", "t.me/batumi_flats"],
    ["viber://chat?number=%2B995555123456", "viber://chat?number=%2B995555123456"],
    ["short link bit.ly/3abcDEF", "bit.ly/3abcDEF"],
    ["more on myflat.com", "myflat.com"],
    ["פרטים באתר dira-batumi.co.il/flat", "dira-batumi.co.il/flat"],
    ["подробнее на kvartira.ru", "kvartira.ru"],
    ["التفاصيل على example.com/flat", "example.com/flat"],
    ["იხილეთ ჩემი გვერდი myhome.ge", "myhome.ge"],
    ["instagram.com/flat.in.vake", "instagram.com/flat.in.vake"],
    ["site.it/flat-123", "site.it/flat-123"],
  ])("finds the link in %j", (text, expected) => {
    expect(urls(text)).toEqual([expected]);
  });

  it.each([
    "Nice flat.It is close to the park",
    "e.g. near the metro, i.e. very central",
    "3.5 km to the sea",
    "Sea view.To the beach 5 minutes",
    "Price is 2.5k per month",
  ])("ignores %j", (text) => {
    expect(urls(text)).toEqual([]);
  });
});

describe("emails and handles", () => {
  it("finds emails, also written with (at) and (dot)", () => {
    expect(emails("Email: Owner.Name@Gmail.com")).toEqual(["owner.name@gmail.com"]);
    expect(emails("owner (at) gmail (dot) com")).toEqual(["owner@gmail.com"]);
    expect(emails("כתבו ל owner[at]walla[dot]co[dot]il")).toEqual(["owner@walla.co.il"]);
    expect(emails("пишите: ivan (собака) mail (точка) ru")).toEqual(["ivan@mail.ru"]);
  });

  it("finds @usernames but not emails or prices", () => {
    expect(handles("Telegram @batumi_rent")).toEqual(["@batumi_rent"]);
    expect(handles("טלגרם: @flat_owner")).toEqual(["@flat_owner"]);
    expect(handles("пишите в телеграм @kvartira_tbilisi")).toEqual(["@kvartira_tbilisi"]);
    expect(handles("تيليجرام @gudauri.ski")).toEqual(["@gudauri.ski"]);
    expect(handles("me@example.com")).toEqual([]);
    expect(handles("only @100 per night")).toEqual([]);
  });
});

describe("clean listings", () => {
  it.each([
    "Bright 3-room apartment in Vake, 95 m², 7th floor of 12, renovated in 2023. Price 1 800 $ per month. Near Vake Park, 10 min walk to the synagogue.",
    "דירה מוארת בבטומי, 2 חדרים, 65 מ\"ר, נוף לים, קומה 15. מחיר 85 $ ללילה, מינימום 3 לילות. 5 דקות הליכה לבית חב\"ד.",
    "Уютная квартира в Сабуртало, 2 комнаты, 60 кв.м, 3/9 этаж. Цена 600 $ в месяц, депозит 600 $. Год постройки 2018.",
    "شقة جميلة في باتومي، غرفتان، ٧٠ م٢، إطلالة على البحر. السعر ٩٠ دولار لليلة.",
    "მყუდრო ბინა ვაკეში, 3 ოთახი, 90 მ², მე-5 სართული. ფასი 2 000 ₾ თვეში.",
  ])("finds nothing in %j", (text) => {
    expect(hasContactInfo(detectContactInfo(text))).toBe(false);
  });
});
