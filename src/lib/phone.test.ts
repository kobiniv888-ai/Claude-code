import { describe, expect, it } from "vitest";
import { buildChannelHref } from "@/lib/contact/links";
import {
  callingCodeOf,
  formatPhoneForDisplay,
  isValidPhone,
  normalizePhone,
  phoneCountry,
  planPhoneFix,
  smsHref,
  telHref,
  whatsappHref,
} from "./phone";

describe("normalizePhone: E.164 without the national 0 (brief 2.5)", () => {
  it("the founder's examples", () => {
    expect(normalizePhone("+972 053-123-4567")).toBe("+972531234567");
    expect(normalizePhone("0531234567", "IL")).toBe("+972531234567");
    expect(normalizePhone("+9950555123456")).toBe("+995555123456");
  });

  it("Israeli numbers written every usual way", () => {
    for (const raw of ["+972531234567", "+972 53 123 4567", "+972-53-123-4567", "+972 (0)53-123-4567", "00972531234567", "00 972 53 123 4567"]) {
      expect(normalizePhone(raw, "GE")).toBe("+972531234567");
    }
    expect(normalizePhone("053-123-4567", "IL")).toBe("+972531234567");
    expect(normalizePhone("972531234567", "IL")).toBe("+972531234567");
  });

  it("Georgian mobiles and landlines", () => {
    expect(normalizePhone("555 12 34 56", "GE")).toBe("+995555123456");
    expect(normalizePhone("0555123456", "GE")).toBe("+995555123456");
    expect(normalizePhone("+995 555 12 34 56")).toBe("+995555123456");
    expect(normalizePhone("+995 32 2 12 34 56")).toBe("+995322123456");
  });

  it("ignores bidi marks, Arabic-Indic digits and pasted links", () => {
    const lrm = String.fromCharCode(0x200e);
    const rlm = String.fromCharCode(0x200f);
    expect(normalizePhone(`${lrm}+972 53 123 4567${rlm}`)).toBe("+972531234567");
    const arabicIndic = "0531234567".replace(/\d/g, (d) => String.fromCharCode(0x0660 + Number(d)));
    expect(normalizePhone(arabicIndic, "IL")).toBe("+972531234567");
    expect(normalizePhone("tel:+995555123456")).toBe("+995555123456");
    expect(normalizePhone("https://wa.me/972531234567")).toBe("+972531234567");
  });

  it("the default country only applies to numbers without a country code", () => {
    expect(normalizePhone("+995555123456", "IL")).toBe("+995555123456");
    expect(normalizePhone("0531234567")).toBeNull();
  });

  it("returns null for things that are not phone numbers", () => {
    for (const raw of ["", "   ", "+", "abc", "12", "+97205312345678901", "053-123-4567 Yossi"]) {
      expect(normalizePhone(raw, "IL")).toBeNull();
    }
    expect(normalizePhone(null)).toBeNull();
    expect(normalizePhone(531234567)).toBeNull();
    expect(normalizePhone("1".repeat(60), "IL")).toBeNull();
  });
});

describe("links for Israeli and Georgian numbers", () => {
  it("wa.me/972531234567 from every way of writing the Israeli number", () => {
    for (const [raw, country] of [
      ["+972 053-123-4567", null],
      ["0531234567", "IL"],
      ["+9720531234567", null],
    ] as const) {
      expect(whatsappHref(raw, null, country)).toBe("https://wa.me/972531234567");
    }
    expect(whatsappHref("+972531234567", "שלום, ראיתי את המודעה")).toBe(
      `https://wa.me/972531234567?text=${encodeURIComponent("שלום, ראיתי את המודעה")}`,
    );
  });

  it("tel:+995555123456 from every way of writing the Georgian number", () => {
    for (const [raw, country] of [
      ["+9950555123456", null],
      ["0555123456", "GE"],
      ["555 12 34 56", "GE"],
      ["+995 555 12 34 56", "IL"],
    ] as const) {
      expect(telHref(raw, country)).toBe("tel:+995555123456");
    }
    expect(telHref("+972 053-123-4567")).toBe("tel:+972531234567");
    expect(whatsappHref("+9950555123456")).toBe("https://wa.me/995555123456");
  });

  it("short service numbers are dialled as written; garbage gives no link", () => {
    expect(telHref("112", "GE")).toBe("tel:112");
    expect(telHref("abc")).toBeNull();
    expect(whatsappHref("112", null, "GE")).toBeNull();
    expect(smsHref("+995555123456", "Hi")).toBe("sms:+995555123456?body=Hi");
  });

  it("the contact buttons give the same links once the server has normalized the value", () => {
    const il = normalizePhone("+972 053-123-4567");
    const ge = normalizePhone("0555123456", "GE");
    expect(buildChannelHref("WHATSAPP", il, "")).toBe("https://wa.me/972531234567");
    expect(buildChannelHref("PHONE", ge, "")).toBe("tel:+995555123456");
    expect(buildChannelHref("VIBER", ge, "")).toBe("viber://chat?number=%2B995555123456");
  });
});

describe("helpers", () => {
  it("validity, country, calling code and display", () => {
    expect(isValidPhone("+972531234567")).toBe(true);
    expect(isValidPhone("+995555123456")).toBe(true);
    expect(isValidPhone("+99512")).toBe(false);
    expect(phoneCountry("+972531234567")).toBe("IL");
    expect(phoneCountry("0555123456", "GE")).toBe("GE");
    expect(callingCodeOf("IL")).toBe("+972");
    expect(callingCodeOf("ge")).toBe("+995");
    expect(callingCodeOf("XX")).toBeNull();
    expect(formatPhoneForDisplay("+972531234567")).toBe("+972 53 123 4567");
    expect(formatPhoneForDisplay("+9950555123456")).toBe("+995 555 12 34 56");
    expect(formatPhoneForDisplay("not a phone")).toBe("not a phone");
  });
});

describe("planPhoneFix (the clean-up's dry run, no database)", () => {
  it("leaves good values, rewrites fixable ones, lists the rest", () => {
    expect(planPhoneFix("+972531234567")).toEqual({ status: "ok", value: "+972531234567" });
    expect(planPhoneFix("+9720531234567")).toEqual({ status: "changed", from: "+9720531234567", value: "+972531234567" });
    expect(planPhoneFix("0555123456", "GE")).toEqual({ status: "changed", from: "0555123456", value: "+995555123456" });
    expect(planPhoneFix("call me")).toEqual({ status: "invalid", from: "call me" });
    expect(planPhoneFix(null)).toEqual({ status: "ok", value: "" });
    expect(planPhoneFix("  ")).toEqual({ status: "ok", value: "" });
  });
});

describe("save paths store E.164 without the national 0", () => {
  it("the post form's contact phones (normalizeContactValue)", async () => {
    const { contactValueProblem, normalizeContactValue } = await import("@/lib/wizard/schemas");
    expect(normalizeContactValue("WHATSAPP", "+972 053-123-4567")).toBe("+972531234567");
    expect(normalizeContactValue("PHONE", "0555123456")).toBe("+995555123456");
    expect(normalizeContactValue("TELEGRAM", "+9720531234567")).toBe("+972531234567");
    expect(normalizeContactValue("TELEGRAM", "@cohen_home")).toBe("@cohen_home");
    expect(contactValueProblem("WHATSAPP", normalizeContactValue("WHATSAPP", "+9720531234567"))).toBeNull();
  });

  it("the admin place phone (optionalPhone)", async () => {
    const { optionalPhone } = await import("@/lib/admin/content/schemas");
    expect(optionalPhone.parse("+995 032 2 12 34 56")).toBe("+995322123456");
    expect(optionalPhone.parse("0322123456")).toBe("+995322123456");
    expect(optionalPhone.parse("")).toBe("");
    expect(optionalPhone.safeParse("not a phone").success).toBe(false);
  });

  it("the booking contact helper (hostContactFor) and its WhatsApp link", async () => {
    const { hostContactFor, whatsappUrl } = await import("@/lib/booking/reveal");
    const contact = hostContactFor([{ channel: "WHATSAPP", value: "+9720531234567", order: 0 }], "+995555123456");
    expect(contact).toEqual({ phone: "+972531234567", whatsapp: "+972531234567" });
    expect(whatsappUrl(contact.whatsapp!)).toBe("https://wa.me/972531234567");
    expect(hostContactFor([], "+9950555123456")).toEqual({ phone: "+995555123456", whatsapp: null });
  });
});
