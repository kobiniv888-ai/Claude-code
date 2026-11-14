import "server-only";
import { getTranslations } from "next-intl/server";
import { siteConfig } from "@/config/site";
import { absoluteUrl } from "@/lib/site-url";
import { notificationEmailFor, sendEmail, type EmailData, type EmailTemplate } from "@/lib/email";
import { alertEnvironment, hostAlertTarget, loadAlertHost, localeOfUser } from "./host";
import { fallbackChannels, planListingDecision, type DecisionChannel } from "./listing-decision-rules";
import { pushToUser } from "./push";
import { currentFailure, emailChannelStatus, emailDeliveryAccepted, hostAlertChannels, parseAlertPrefs } from "./rules";
import { sendTelegramMessage } from "./telegram";

/**
 * Tells a host about a staff decision on their listing (the rules: ./listing-decision-rules.ts):
 * the decision email, and when email is not available or fails, Telegram and app/browser
 * notifications. Demo hosts' emails stay in the outbox. An email only logged because Resend
 * isn't set up doesn't count as delivered (the other channels are tried). Never throws; returns
 * what went out.
 */

export type ListingDecisionKind = "approved" | "needs_changes" | "rejected";

export type ListingDecisionResult = { email: boolean; telegram: boolean; push: boolean };

export async function notifyListingDecision<K extends EmailTemplate>(input: {
  ownerId: string;
  kind: ListingDecisionKind;
  listingTitle: string;
  /** Where the host acts: the live listing, or "My listings" (a site path without the locale). */
  path: string;
  email: { template: K; data: EmailData[K] };
}): Promise<ListingDecisionResult> {
  const result: ListingDecisionResult = { email: false, telegram: false, push: false };
  try {
    const host = await loadAlertHost(input.ownerId);
    if (!host) return result;
    const target = hostAlertTarget(host);
    const env = alertEnvironment();
    const to = notificationEmailFor(host);
    const plan = planListingDecision({
      email: to,
      emailFailing: !!currentFailure(parseAlertPrefs(host.notificationPrefs), "email", target),
      channels: hostAlertChannels(target, env),
    });

    if (plan.email && to) {
      // Always sent (a logged email stays in the outbox, to be sent again once Resend is set up).
      const sent = await sendEmail({ to, template: input.email.template, locale: host.locale, data: input.email.data, outboxOnly: host.isDemo });
      result.email = sent.ok && emailDeliveryAccepted(sent.delivery, emailChannelStatus(target, env).transport);
    }
    const channels = fallbackChannels(plan, result.email);
    if (channels.length === 0) return result;

    const locale = localeOfUser(host);
    const t = await getTranslations({ locale, namespace: "emails.hostChannel" });
    const path = `/${locale}${input.path.startsWith("/") ? input.path : `/${input.path}`}`;
    const values = { brand: siteConfig.localizedName[locale] ?? siteConfig.name, title: input.listingTitle, url: absoluteUrl(path) };
    const send = async (channel: DecisionChannel) => {
      if (channel === "telegram") {
        if (!host.telegramChatId) return;
        const sent = await sendTelegramMessage(host.telegramChatId, t(`${input.kind}.text`, values));
        result.telegram = sent.ok;
        return;
      }
      const pushed = await pushToUser(host.id, {
        title: t(`${input.kind}.title`, values),
        body: t(`${input.kind}.body`, values),
        url: path,
        tag: `listing-decision-${input.kind}`,
      });
      result.push = pushed.accepted > 0;
    };
    await Promise.all(channels.map((channel) => send(channel).catch((error) => console.error(`[alerts] listing decision by ${channel} failed:`, error))));
  } catch (error) {
    console.error(`[alerts] listing decision for ${input.ownerId} could not be sent:`, error);
  }
  return result;
}
