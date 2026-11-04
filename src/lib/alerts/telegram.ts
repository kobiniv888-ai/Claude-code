import "server-only";

/**
 * The Bayit Telegram bot (round 3, founder's answer 4): booking alerts to hosts who connected it
 * once. Plain Bot API calls over fetch, no library.
 *
 * Setup (the founder, OWNER_TODO): create the bot with @BotFather, then set
 *   TELEGRAM_BOT_TOKEN      the token BotFather gives ("123456:ABC…")
 *   TELEGRAM_BOT_USERNAME   the bot's username without "@" (for the t.me link)
 *   TELEGRAM_WEBHOOK_SECRET any long random string (openssl rand -hex 32)
 * and register the webhook once:
 *   https://api.telegram.org/bot<TOKEN>/setWebhook?url=<SITE_URL>/api/webhooks/telegram&secret_token=<SECRET>
 * Without the token and username the settings show Telegram as "coming soon".
 *
 * "Accepted" = sendMessage answered ok. A 403 means the host blocked the bot: that channel is
 * paused (src/lib/alerts/failures.ts).
 */

const API = "https://api.telegram.org";
const TIMEOUT_MS = 8_000;
/** Telegram's limit for a message. */
const MAX_TEXT = 4096;

export type TelegramConfig = { token: string; username: string; webhookSecret: string | null };

export function telegramConfig(): TelegramConfig | null {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const username = process.env.TELEGRAM_BOT_USERNAME?.trim().replace(/^@/, "");
  if (!token || !username) return null;
  return { token, username, webhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET?.trim() || null };
}

/** The bot can send alerts and hosts can connect it. */
export function isTelegramConfigured(): boolean {
  return telegramConfig() !== null;
}

export type TelegramSendResult =
  | { ok: true; messageId: number | null }
  | { ok: false; blocked: boolean; status: number | null; error: string };

/** Sends a plain-text message (no Markdown: listing titles and names can't break it). Never throws. */
export async function sendTelegramMessage(chatId: string, text: string): Promise<TelegramSendResult> {
  const config = telegramConfig();
  if (!config) return { ok: false, blocked: false, status: null, error: "not_configured" };
  try {
    const response = await fetch(`${API}/bot${config.token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT - 1)}…` : text,
        link_preview_options: { is_disabled: true },
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    const data = (await response.json().catch(() => null)) as { ok?: boolean; result?: { message_id?: number }; description?: string } | null;
    if (response.ok && data?.ok) return { ok: true, messageId: data.result?.message_id ?? null };
    // 403: "bot was blocked by the user" / "user is deactivated" — this chat can't get alerts.
    const blocked = response.status === 403;
    // The description never contains the token; keep it short in logs.
    const error = (data?.description ?? `HTTP ${response.status}`).slice(0, 200);
    console.warn(`[telegram] sendMessage failed (${response.status}): ${error}`);
    return { ok: false, blocked, status: response.status, error };
  } catch (error) {
    const message = (error as Error)?.name === "TimeoutError" ? "timeout" : ((error as Error)?.message ?? String(error)).slice(0, 200);
    console.warn(`[telegram] sendMessage failed: ${message}`);
    return { ok: false, blocked: false, status: null, error: message };
  }
}
