import { describe, expect, it } from "vitest";
import {
  buildChannelHref,
  channelCopiesMessage,
  displayValue,
  e164,
  messengerUsername,
  parseContactMethods,
  revealedValue,
  telegramTarget,
} from "./links";
import { messageVariant, stayQuery, stayRequestFrom } from "./message";

describe("parseContactMethods", () => {
  it("keeps valid methods in the owner's order, one per channel", () => {
    const methods = parseContactMethods([
      { channel: "PHONE", value: "+995555000011", order: 2 },
      { channel: "WHATSAPP", value: "+995555000011", order: 0 },
      { channel: "WHATSAPP", value: "+972501234567", order: 1 },
      { channel: "CHAT", value: "x", order: 3 },
      { channel: "EMAIL", value: "  ", order: 4 },
      null,
      "junk",
    ]);
    expect(methods.map((m) => m.channel)).toEqual(["WHATSAPP", "PHONE"]);
  });

  it("returns [] for anything that is not an array", () => {
    expect(parseContactMethods(null)).toEqual([]);
    expect(parseContactMethods({ channel: "PHONE" })).toEqual([]);
  });

  it("never reveals the email address", () => {
    expect(revealedValue({ channel: "EMAIL", value: "owner@example.com", order: 0 })).toBeNull();
    expect(revealedValue({ channel: "PHONE", value: "+995555000011", order: 0 })).toBe("+995555000011");
  });
});

describe("channel links", () => {
  const message = "Hi! ID 1234 & more";

  it("builds WhatsApp links with the message", () => {
    expect(buildChannelHref("WHATSAPP", "+995 555 00-00-11", message)).toBe(
      "https://wa.me/995555000011?text=Hi!%20ID%201234%20%26%20more",
    );
  });

  it("builds Viber, phone and SMS links", () => {
    expect(buildChannelHref("VIBER", "+995555000011", message)).toBe("viber://chat?number=%2B995555000011");
    expect(buildChannelHref("PHONE", "+995555000011", message)).toBe("tel:+995555000011");
    expect(buildChannelHref("SMS", "+995555000011", "Hi")).toBe("sms:+995555000011?body=Hi");
  });

  it("builds Telegram links from usernames, URLs and phones", () => {
    expect(telegramTarget("@bayit_demo_yossi")).toBe("bayit_demo_yossi");
    expect(telegramTarget("https://t.me/bayit_owner")).toBe("bayit_owner");
    expect(telegramTarget("+995 555 000 011")).toBe("+995555000011");
    expect(telegramTarget("no spaces allowed")).toBeNull();
    expect(buildChannelHref("TELEGRAM", "@bayit_demo_yossi", message)).toBe("https://t.me/bayit_demo_yossi");
  });

  it("builds Messenger links from usernames and Facebook URLs", () => {
    expect(messengerUsername("https://www.facebook.com/bayit.owner")).toBe("bayit.owner");
    expect(messengerUsername("m.me/bayit.owner")).toBe("bayit.owner");
    expect(buildChannelHref("MESSENGER", "bayit.owner", "Hi")).toBe("https://m.me/bayit.owner?text=Hi");
    expect(buildChannelHref("MESSENGER", "javascript:alert(1)", "Hi")).toBeNull();
  });

  it("refuses unusable values and EMAIL", () => {
    expect(e164("12")).toBeNull();
    expect(buildChannelHref("PHONE", "abc", message)).toBeNull();
    expect(buildChannelHref("EMAIL", "owner@example.com", message)).toBeNull();
    expect(buildChannelHref("WHATSAPP", null, message)).toBeNull();
  });

  it("copies the message for apps without a text parameter", () => {
    expect(channelCopiesMessage("TELEGRAM")).toBe(true);
    expect(channelCopiesMessage("VIBER")).toBe(true);
    expect(channelCopiesMessage("WHATSAPP")).toBe(false);
  });

  it("shows readable values", () => {
    expect(displayValue("TELEGRAM", "bayit_owner")).toBe("@bayit_owner");
    expect(displayValue("PHONE", "+995 555 000 011")).toBe("+995555000011");
    expect(displayValue("EMAIL", null)).toBeNull();
  });
});

describe("ready message", () => {
  it("reads dates and guests from the URL", () => {
    expect(stayRequestFrom({ checkIn: "2026-03-10", checkOut: "2026-03-17", guests: "4" })).toEqual({
      checkIn: "2026-03-10",
      checkOut: "2026-03-17",
      guests: 4,
    });
  });

  it("drops invalid or reversed values", () => {
    expect(stayRequestFrom({ checkIn: "2026-03-10", checkOut: "2026-03-01", guests: "0" })).toEqual({
      checkIn: "2026-03-10",
      checkOut: null,
      guests: null,
    });
    expect(stayRequestFrom({ checkOut: "2026-03-10", guests: ["x"] })).toEqual({ checkIn: null, checkOut: null, guests: null });
  });

  it("picks the right variant", () => {
    const both = { checkIn: "2026-03-10", checkOut: "2026-03-17", guests: 4 };
    expect(messageVariant("SHORT_STAY", both)).toBe("datesGuests");
    expect(messageVariant("SHORT_STAY", { ...both, guests: null })).toBe("dates");
    expect(messageVariant("HOTEL_ROOM", { checkIn: null, checkOut: null, guests: 2 })).toBe("guests");
    expect(messageVariant("MONTHLY_RENT", both)).toBe("dates");
    expect(messageVariant("SALE", both)).toBe("sale");
    expect(messageVariant("SHORT_STAY", { checkIn: null, checkOut: null, guests: null })).toBe("plain");
  });

  it("keeps the stay in links", () => {
    expect(stayQuery({ checkIn: "2026-03-10", checkOut: "2026-03-17", guests: 4 })).toBe(
      "?checkIn=2026-03-10&checkOut=2026-03-17&guests=4",
    );
    expect(stayQuery({ checkIn: null, checkOut: null, guests: null })).toBe("");
  });
});
