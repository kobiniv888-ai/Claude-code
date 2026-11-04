import { describe, expect, it } from "vitest";
import { isFreshLinkClaim, telegramLinkToken, telegramStartUrl, TELEGRAM_LINK_TTL_SECONDS, TELEGRAM_START_MAX, verifyTelegramLinkToken } from "./telegram-token";
import { parseTelegramUpdate, telegramLocale, verifyTelegramSecret } from "./telegram-update";

const SECRET = "test-secret-not-a-real-one";
const NOW = new Date("2026-11-03T12:00:00Z");
const USER = "Abc123DEFghi456JKLmno789PQRstu01"; // 32 characters, like a Better Auth id

describe("the Telegram /start token", () => {
  it("round-trips for the user it was made for, and fits Telegram's /start limit", () => {
    const token = telegramLinkToken(USER, SECRET, NOW)!;
    expect(token.length).toBeLessThanOrEqual(TELEGRAM_START_MAX);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(verifyTelegramLinkToken(token, SECRET, NOW)).toEqual({ userId: USER, issuedAt: new Date(Math.floor(NOW.getTime() / 1000) * 1000) });
    expect(telegramLinkToken("demo-user-yossi", SECRET, NOW)).not.toBeNull();
  });
  it("is refused when changed, signed with another secret, expired or from the future", () => {
    const token = telegramLinkToken(USER, SECRET, NOW)!;
    expect(verifyTelegramLinkToken(token, "another-secret", NOW)).toBeNull();
    const other = token.replace(USER, "demo-user-yossi");
    expect(verifyTelegramLinkToken(other, SECRET, NOW)).toBeNull();
    const lastChar = token.at(-1) === "A" ? "B" : "A";
    expect(verifyTelegramLinkToken(token.slice(0, -1) + lastChar, SECRET, NOW)).toBeNull();
    const later = new Date(NOW.getTime() + (TELEGRAM_LINK_TTL_SECONDS + 1) * 1000);
    expect(verifyTelegramLinkToken(token, SECRET, later)).toBeNull();
    const earlier = new Date(NOW.getTime() - 5 * 60_000);
    expect(verifyTelegramLinkToken(token, SECRET, earlier)).toBeNull();
    expect(verifyTelegramLinkToken("", SECRET, NOW)).toBeNull();
    expect(verifyTelegramLinkToken("garbage", SECRET, NOW)).toBeNull();
    expect(verifyTelegramLinkToken(token, "", NOW)).toBeNull();
  });
  it("can't be made for ids it couldn't carry, or without a secret", () => {
    expect(telegramLinkToken("has_underscore", SECRET, NOW)).toBeNull();
    expect(telegramLinkToken("x".repeat(41), SECRET, NOW)).toBeNull();
    expect(telegramLinkToken(USER, "", NOW)).toBeNull();
  });
  it("works once: a token issued before the last connection is spent", () => {
    const claim = verifyTelegramLinkToken(telegramLinkToken(USER, SECRET, NOW)!, SECRET, NOW)!;
    expect(isFreshLinkClaim(claim, null)).toBe(true);
    expect(isFreshLinkClaim(claim, new Date(NOW.getTime() - 60_000))).toBe(true);
    expect(isFreshLinkClaim(claim, new Date(NOW.getTime() + 1000))).toBe(false);
  });
  it("builds the t.me link", () => {
    expect(telegramStartUrl("@BayitAlertsBot", "abc_1_x")).toBe("https://t.me/BayitAlertsBot?start=abc_1_x");
  });
});

describe("the bot webhook", () => {
  it("checks the secret header in constant time", () => {
    expect(verifyTelegramSecret("s3cret", "s3cret")).toBe(true);
    expect(verifyTelegramSecret("s3cret", "other")).toBe(false);
    expect(verifyTelegramSecret(null, "s3cret")).toBe(false);
    expect(verifyTelegramSecret("s3cret", "")).toBe(false);
  });
  it("reads /start with and without a token, /stop, and anything else", () => {
    const message = (text: string, extra: Record<string, unknown> = {}) => ({
      update_id: 1,
      message: { message_id: 5, chat: { id: 123456789, type: "private" }, from: { id: 1, is_bot: false, language_code: "he" }, text, ...extra },
    });
    expect(parseTelegramUpdate(message("/start abc_1_x"))).toEqual({ kind: "start", chatId: "123456789", token: "abc_1_x", locale: "he" });
    expect(parseTelegramUpdate(message("/start"))).toEqual({ kind: "start", chatId: "123456789", token: null, locale: "he" });
    expect(parseTelegramUpdate(message("/start@BayitAlertsBot tok"))).toMatchObject({ kind: "start", token: "tok" });
    expect(parseTelegramUpdate(message("/stop"))).toMatchObject({ kind: "stop", chatId: "123456789" });
    expect(parseTelegramUpdate(message("hello"))).toMatchObject({ kind: "other" });
  });
  it("ignores groups, bots, edits and broken updates", () => {
    expect(parseTelegramUpdate({ update_id: 1, message: { chat: { id: -100, type: "group" }, text: "/start x" } })).toBeNull();
    expect(parseTelegramUpdate({ update_id: 1, message: { chat: { id: 1, type: "private" }, from: { is_bot: true }, text: "/start x" } })).toBeNull();
    expect(parseTelegramUpdate({ update_id: 1, edited_message: { chat: { id: 1, type: "private" }, text: "/start x" } })).toBeNull();
    expect(parseTelegramUpdate({ nope: true })).toBeNull();
    expect(parseTelegramUpdate(null)).toBeNull();
  });
  it("reads blocking and unblocking the bot", () => {
    const member = (status: string) => ({ update_id: 2, my_chat_member: { chat: { id: 42, type: "private" }, new_chat_member: { status } } });
    expect(parseTelegramUpdate(member("kicked"))).toEqual({ kind: "blocked", chatId: "42" });
    expect(parseTelegramUpdate(member("member"))).toEqual({ kind: "unblocked", chatId: "42" });
    expect(parseTelegramUpdate(member("administrator"))).toBeNull();
  });
  it("maps Telegram's language codes to ours", () => {
    expect(telegramLocale("iw")).toBe("he");
    expect(telegramLocale("ru-RU")).toBe("ru");
    expect(telegramLocale("ka")).toBe("ka");
    expect(telegramLocale("fr")).toBeNull();
    expect(telegramLocale(undefined)).toBeNull();
  });
});
