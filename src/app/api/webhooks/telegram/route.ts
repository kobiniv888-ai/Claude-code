import { handleTelegramCommand } from "@/lib/alerts/telegram-bot";
import { parseTelegramUpdate, TELEGRAM_SECRET_HEADER, verifyTelegramSecret } from "@/lib/alerts/telegram-update";
import { rateLimit, rateLimitHeaders } from "@/lib/rate-limit";

/**
 * POST /api/webhooks/telegram — updates for the Bayit bot (round 3, booking alerts by Telegram).
 *
 * Registered once by the founder (OWNER_TODO):
 *   https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook?url=<SITE_URL>/api/webhooks/telegram&secret_token=<TELEGRAM_WEBHOOK_SECRET>
 * Telegram then sends that secret in X-Telegram-Bot-Api-Secret-Token with every update; anything
 * without it gets 401 and changes nothing. Handled: "/start <token>" (connect, from the settings
 * page link), "/stop" (disconnect), blocking / unblocking the bot (pause / resume the channel);
 * other messages get a short help text (src/lib/alerts/telegram-bot.ts).
 *
 * Telegram retries an update until it gets a 2xx, so a failure we can't fix by retrying (bad
 * JSON, an update we ignore) still answers 200.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Telegram's updates are small. */
const MAX_BODY_BYTES = 64 * 1024;
/** Per chat: enough for a person, not for a script. */
const CHAT_LIMIT = { limit: 30, windowSeconds: 60 };

function reply(status: number, body: Record<string, unknown>, headers: Record<string, string> = {}): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store", ...headers } });
}

export async function POST(request: Request): Promise<Response> {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
  if (!secret || !process.env.TELEGRAM_BOT_TOKEN?.trim()) return reply(503, { error: "not_configured" });
  if (!verifyTelegramSecret(request.headers.get(TELEGRAM_SECRET_HEADER), secret)) return reply(401, { error: "bad_secret" });

  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_BODY_BYTES) return reply(413, { error: "too_large" });
  const body = await request.text();
  if (body.length > MAX_BODY_BYTES) return reply(413, { error: "too_large" });

  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    return reply(200, { ok: true, ignored: true });
  }
  const command = parseTelegramUpdate(json);
  if (!command) return reply(200, { ok: true, ignored: true });

  // Rate limit per chat (Telegram's servers share a few IPs, so not per IP).
  const rate = await rateLimit(`webhook:telegram:${command.chatId}`, CHAT_LIMIT);
  if (!rate.ok) return reply(200, { ok: true, ignored: "rate_limited" }, rateLimitHeaders(rate, CHAT_LIMIT.limit));

  try {
    const result = await handleTelegramCommand(command);
    return reply(200, { ok: true, result });
  } catch (error) {
    console.error(`[webhook:telegram] ${command.kind} could not be handled:`, error);
    // 500: Telegram retries later (the database may be back by then).
    return reply(500, { error: "failed" });
  }
}
