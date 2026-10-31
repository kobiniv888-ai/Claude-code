import { describe, expect, it } from "vitest";
import { BUILTIN_PHRASE_RULES, compileAdminPhrase, compilePattern, scanWithRules, type PhraseRule } from "./phrases";

const ruleIds = (text: string) => scanWithRules(text, BUILTIN_PHRASE_RULES).map((h) => h.rule.replace("builtin:", ""));

describe("built-in scam phrases", () => {
  it.each([
    // English
    ["Payment only by Western Union.", "western_union"],
    ["send via WESTERN-UNION please", "western_union"],
    ["MoneyGram accepted", "moneygram"],
    ["You can pay with Steam gift cards", "gift_cards"],
    ["We accept Bitcoin and USDT", "crypto"],
    ["Please send the deposit first to reserve", "deposit_first"],
    ["Pay before viewing, the place is very popular", "deposit_first"],
    ["I'm abroad right now, I will send you the keys by DHL", "abroad_keys"],
    ["Keys via courier after payment", "abroad_keys"],
    // Hebrew
    ["התשלום בווסטרן יוניון בלבד", "western_union"],
    ["אפשר לשלם במאני גרם", "moneygram"],
    ["מקבלים כרטיסי מתנה", "gift_cards"],
    ["תשלום בביטקוין", "crypto"],
    ["יש להעביר לי את המקדמה לפני ההגעה", "deposit_first"],
    ["פיקדון מראש בלבד", "deposit_first"],
    ["אני נמצא כרגע בחו״ל, אשלח לכם את המפתחות", "abroad_keys"],
    ["אני בחו\"ל עד הקיץ", "abroad_keys"],
    // Russian
    ["Оплата через Вестерн Юнион", "western_union"],
    ["Можно оплатить подарочной картой", "gift_cards"],
    ["Принимаем криптовалюту", "crypto"],
    ["Переведите залог, и квартира ваша", "deposit_first"],
    ["Задаток вперёд, без исключений", "deposit_first"],
    ["Я сейчас за границей, вышлю ключи почтой", "abroad_keys"],
    // Arabic
    ["الدفع عبر ويسترن يونيون فقط", "western_union"],
    ["نقبل بطاقات الهدايا", "gift_cards"],
    ["الدفع بالبيتكوين", "crypto"],
    ["أرسل العربون لحجز الشقة", "deposit_first"],
    ["أنا حاليا خارج البلد وسأرسل لك المفاتيح", "abroad_keys"],
    // Georgian
    ["გადახდა ვესტერნ იუნიონით", "western_union"],
    ["მიიღება სასაჩუქრე ბარათები", "gift_cards"],
    ["გადახდა ბიტკოინით", "crypto"],
    ["გადმორიცხეთ ავანსი და ბინა თქვენია", "deposit_first"],
    ["საზღვარგარეთ ვარ, გასაღებს ფოსტით გამოგიგზავნით", "abroad_keys"],
  ])("flags %j as %s", (text, rule) => {
    expect(ruleIds(text)).toContain(rule);
  });

  it("flags generic prepayment with a lower weight", () => {
    const hits = scanWithRules("Предоплата 30% при бронировании", BUILTIN_PHRASE_RULES);
    expect(hits.map((h) => h.rule)).toEqual(["builtin:prepayment"]);
    expect(hits[0].weight).toBe(15);
    expect(hits[0].action).toBe("FLAG");
  });

  it.each([
    "Bright apartment near Vake Park. Deposit: one month. Viewing any day.",
    "דירה מרווחת עם מרפסת, קרוב לבית הכנסת. אפשר לתאם צפייה.",
    "Уютная квартира, залог 500 $ при заселении, показ в любое время.",
    "شقة واسعة قريبة من البحر، يمكن المعاينة في أي وقت.",
    "მყუდრო ბინა ვაკეში, დათვალიერება ნებისმიერ დროს.",
    "Walking distance to the union square and the western part of the old town.",
    "Cryptic directions? No — we send a map after you contact us.",
  ])("does not flag %j", (text) => {
    expect(ruleIds(text)).toEqual([]);
  });
});

describe("compilePattern", () => {
  it("matches whole words, stems and optional groups", () => {
    const re = compilePattern("(send|wire) (me|) (the|) deposit*");
    expect(re.test(" send me the deposit now ")).toBe(true);
    expect(re.test(" wire deposits ")).toBe(true);
    expect(re.test(" resend the deposit ")).toBe(false);
  });

  it("allows Hebrew and Arabic prefixes", () => {
    expect(compilePattern("מקדמה").test(" והמקדמה ")).toBe(true);
    expect(compilePattern("بيتكوين").test(" بالبيتكوين ")).toBe(true);
  });
});

describe("admin phrases", () => {
  const rules: PhraseRule[] = [
    { id: "w1", category: "SCAM", action: "BLOCK", weight: 0, patterns: [compileAdminPhrase("Pay by PayPal Friends")!], source: "banned_word" },
    { id: "w2", category: "OFFENSIVE", action: "FLAG", weight: 10, patterns: [compileAdminPhrase("bad")!], source: "banned_word" },
  ];

  it("normalizes case and punctuation and allows endings on long last words", () => {
    const hits = scanWithRules("Please pay by PayPal-friends!", rules);
    expect(hits).toEqual([{ phrase: "pay by paypal friends", category: "SCAM", action: "BLOCK", weight: 0, rule: "banned_word:w1" }]);
    expect(scanWithRules("pay by paypal friendship", rules)).toHaveLength(1);
  });

  it("needs a whole word for short phrases", () => {
    expect(scanWithRules("a bad idea", rules)).toHaveLength(1);
    expect(scanWithRules("badge and badminton", rules)).toHaveLength(0);
  });
});
