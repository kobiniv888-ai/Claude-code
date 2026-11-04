import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { siteConfig, type AppLocale } from "@/config/site";
import { isAccountInGoodStanding } from "@/lib/auth/account-status";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { localeOfUser, reportChannelFailure, telegramUnblocked } from "./host";
import { telegramReply } from "./messages";
import { withChannelEnabled, withChannelFailing } from "./rules";
import { sendTelegramMessage } from "./telegram";
import { isFreshLinkClaim, verifyTelegramLinkToken } from "./telegram-token";
import type { TelegramCommand } from "./telegram-update";

/**
 * What the Bayit bot does with each message (round 3; the route is
 * src/app/api/webhooks/telegram/route.ts):
 * - "/start <token>": connects this chat to the account the token was made for (one chat per
 *   account, one account per chat), turns the Telegram channel on, clears an earlier pause and
 *   answers in the host's language;
 * - "/start" alone, an expired or used link: says how to get a new link;
 * - "/stop": disconnects;
 * - the host blocked the bot: pauses the channel (as a 403 would); unblocked: "back on".
 * Returns what it did (for the route's response and tests).
 */
export async function handleTelegramCommand(command: TelegramCommand, now: Date = new Date()): Promise<string> {
  const fallback: AppLocale = siteConfig.i18n.primaryLocale;
  switch (command.kind) {
    case "start": {
      const secret = process.env.BETTER_AUTH_SECRET ?? "";
      const claim = command.token ? verifyTelegramLinkToken(command.token, secret, now) : null;
      const user = claim
        ? await db.user.findUnique({
            where: { id: claim.userId },
            select: { id: true, locale: true, status: true, deletedAt: true, telegramChatId: true, telegramLinkedAt: true, notificationPrefs: true },
          })
        : null;
      if (!claim || !user || user.deletedAt || !isAccountInGoodStanding(user.status) || !isFreshLinkClaim(claim, user.telegramLinkedAt)) {
        const linked = await db.user.findUnique({ where: { telegramChatId: command.chatId }, select: { id: true, locale: true } });
        // This chat is already connected (to the account of the link, or "/start" alone): say so.
        const alreadyLinked = !!linked && (!command.token || linked.id === claim?.userId);
        const key = alreadyLinked ? "linked" : command.token ? "expired" : "help";
        await sendTelegramMessage(command.chatId, await telegramReply(linked ? localeOfUser(linked) : (command.locale ?? fallback), key));
        return alreadyLinked ? "already_linked" : key;
      }
      let prefs = withChannelFailing(user.notificationPrefs, "telegram", null);
      prefs = withChannelEnabled(prefs, "telegram", true);
      await db.$transaction([
        // One account per chat: a chat connected to another account moves here.
        db.user.updateMany({ where: { telegramChatId: command.chatId, id: { not: user.id } }, data: { telegramChatId: null, telegramLinkedAt: null } }),
        db.user.update({
          where: { id: user.id },
          data: { telegramChatId: command.chatId, telegramLinkedAt: now, notificationPrefs: prefs as Prisma.InputJsonValue },
        }),
      ]);
      await audit({ actorId: user.id, action: "alerts.telegram_connected", targetType: "User", targetId: user.id, details: { replaced: !!user.telegramChatId } });
      await sendTelegramMessage(command.chatId, await telegramReply(localeOfUser(user), "linked"));
      return "linked";
    }
    case "stop": {
      const user = await db.user.findUnique({ where: { telegramChatId: command.chatId }, select: { id: true, locale: true, notificationPrefs: true } });
      if (!user) {
        await sendTelegramMessage(command.chatId, await telegramReply(command.locale ?? fallback, "notLinked"));
        return "not_linked";
      }
      await db.user.update({
        where: { id: user.id },
        data: { telegramChatId: null, telegramLinkedAt: null, notificationPrefs: withChannelFailing(user.notificationPrefs, "telegram", null) as Prisma.InputJsonValue },
      });
      await audit({ actorId: user.id, action: "alerts.telegram_disconnected", targetType: "User", targetId: user.id, details: { from: "telegram" } });
      await sendTelegramMessage(command.chatId, await telegramReply(localeOfUser(user), "stopped"));
      return "stopped";
    }
    case "other": {
      const user = await db.user.findUnique({ where: { telegramChatId: command.chatId }, select: { locale: true } });
      await sendTelegramMessage(command.chatId, await telegramReply(user ? localeOfUser(user) : (command.locale ?? fallback), user ? "linked" : "help"));
      return "help";
    }
    case "blocked": {
      const user = await db.user.findUnique({ where: { telegramChatId: command.chatId }, select: { id: true } });
      if (!user) return "ignored";
      await reportChannelFailure({ userId: user.id, channel: "telegram", reason: "blocked", chatId: command.chatId, at: now });
      return "paused";
    }
    case "unblocked":
      return (await telegramUnblocked(command.chatId)) ? "resumed" : "ignored";
  }
}
