import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { locales, type AppLocale } from "@/config/site";

/**
 * What the Bayit bot's webhook reads from Telegram (round 3). Pure, so it is unit-tested; the
 * route is src/app/api/webhooks/telegram/route.ts.
 *
 * Telegram sends the secret given to setWebhook in the X-Telegram-Bot-Api-Secret-Token header
 * (TELEGRAM_WEBHOOK_SECRET); every other request is refused.
 */

export const TELEGRAM_SECRET_HEADER = "x-telegram-bot-api-secret-token";

/** Constant-time comparison of the webhook secret header. */
export function verifyTelegramSecret(given: string | null | undefined, secret: string | null | undefined): boolean {
  const expected = secret?.trim();
  if (!expected || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

const chatSchema = z.object({ id: z.union([z.number().int(), z.string().regex(/^-?\d{1,20}$/)]), type: z.string().max(20) });
const fromSchema = z.object({ language_code: z.string().max(20).optional(), is_bot: z.boolean().optional() }).partial();

const updateSchema = z.object({
  update_id: z.number().int(),
  message: z
    .object({
      chat: chatSchema,
      from: fromSchema.optional(),
      text: z.string().max(4096).optional(),
    })
    .passthrough()
    .optional(),
  my_chat_member: z
    .object({
      chat: chatSchema,
      from: fromSchema.optional(),
      new_chat_member: z.object({ status: z.string().max(30) }).passthrough(),
    })
    .passthrough()
    .optional(),
});

export type TelegramCommand =
  /** "/start <token>" from a link on the settings page (token may be null: "/start" alone). */
  | { kind: "start"; chatId: string; token: string | null; locale: AppLocale | null }
  /** "/stop": stop booking alerts here (disconnect). */
  | { kind: "stop"; chatId: string; locale: AppLocale | null }
  /** Anything else typed to the bot: a short help text. */
  | { kind: "other"; chatId: string; locale: AppLocale | null }
  /** The user blocked the bot (kicked) or unblocked it (member). */
  | { kind: "blocked" | "unblocked"; chatId: string };

/** Telegram's language_code ("he", "iw", "ru-RU", "en-US") → one of our languages, else null. */
export function telegramLocale(code: string | null | undefined): AppLocale | null {
  const base = code?.trim().toLowerCase().split(/[-_]/)[0] ?? "";
  const mapped = base === "iw" ? "he" : base;
  return (locales as readonly string[]).includes(mapped) ? (mapped as AppLocale) : null;
}

/** The command in a webhook body, or null for updates the bot ignores (groups, edits, bad JSON). */
export function parseTelegramUpdate(body: unknown): TelegramCommand | null {
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return null;
  const { message, my_chat_member: member } = parsed.data;
  if (message) {
    // Only private chats with a person: groups and channels never get booking alerts.
    if (message.chat.type !== "private" || message.from?.is_bot) return null;
    const chatId = String(message.chat.id);
    const locale = telegramLocale(message.from?.language_code);
    const text = message.text?.trim() ?? "";
    const command = /^\/(start|stop)(?:@\w+)?(?:\s+(\S+))?/i.exec(text);
    if (command?.[1].toLowerCase() === "start") return { kind: "start", chatId, token: command[2] ?? null, locale };
    if (command?.[1].toLowerCase() === "stop") return { kind: "stop", chatId, locale };
    return { kind: "other", chatId, locale };
  }
  if (member && member.chat.type === "private") {
    const chatId = String(member.chat.id);
    if (member.new_chat_member.status === "kicked") return { kind: "blocked", chatId };
    if (member.new_chat_member.status === "member") return { kind: "unblocked", chatId };
  }
  return null;
}
