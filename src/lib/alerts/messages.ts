import "server-only";
import { getTranslations } from "next-intl/server";
import { siteConfig, type AppLocale } from "@/config/site";
import { absoluteUrl } from "@/lib/site-url";
import type { HostBookingSummary } from "@/lib/booking/notify";
import type { PushPayload } from "./push-subscription";
import type { ConfirmingChannel } from "./rules";

/**
 * The words of Telegram messages, browser notifications and texts about booking alerts, in the
 * host's language (messages/<locale>/alerts.json, "message.*" and "telegram.*").
 *
 * As little as possible (security checklist 5, SECURITY_REPORT 5.i, conflict C17): these show on a
 * lock screen and stay in a Telegram chat, so a booking alert carries only the booking number and
 * the link ("New booking BT-7K3Q9 — open Bayit for the details"). The guest's name, the dates, the
 * guest count and the listing are in the email and on the site; an address or phone number never
 * appears here (nor the host's own bouncing email address in a "paused" notice).
 */

/** Settings page section with the alert channels (the booking step and notices link here). */
export const ALERT_SETTINGS_PATH = "/account/settings#booking-alerts";

export type HostAlertKind =
  | { kind: "new_booking"; booking: HostBookingSummary }
  | { kind: "cancelled"; booking: HostBookingSummary }
  | { kind: "test" }
  | { kind: "paused"; failed: ConfirmingChannel; stillInstant: boolean };

export type AlertTexts = { text: string; push: PushPayload };

function brandOf(locale: AppLocale): string {
  return siteConfig.localizedName[locale] ?? siteConfig.name;
}

export function settingsUrl(locale: AppLocale): { url: string; path: string } {
  const path = `/${locale}${ALERT_SETTINGS_PATH}`;
  return { url: absoluteUrl(path), path };
}

/** One text (Telegram, SMS) and one notification for an alert. */
export async function alertTexts(locale: AppLocale, alert: HostAlertKind): Promise<AlertTexts> {
  const t = await getTranslations({ locale, namespace: "alerts.message" });
  const brand = brandOf(locale);
  switch (alert.kind) {
    case "new_booking":
    case "cancelled": {
      const b = alert.booking;
      // Only these three values reach the texts (5.i): no name, dates, guest count or title.
      const values = { brand, code: b.code, url: b.url };
      const key = alert.kind === "new_booking" ? "newBooking" : "cancelled";
      return {
        text: t(`${key}.text`, values),
        push: { title: t(`${key}.title`, values), body: t(`${key}.body`, values), url: b.path, tag: `booking-${b.code}` },
      };
    }
    case "test": {
      const settings = settingsUrl(locale);
      return {
        text: t("test.text", { brand, url: settings.url }),
        push: { title: t("test.title", { brand }), body: t("test.body", { brand }), url: settings.path, tag: "bayit-test" },
      };
    }
    case "paused": {
      const settings = settingsUrl(locale);
      const values = { brand, url: settings.url };
      const what = t(`paused.${alert.failed}`, values);
      const next = alert.stillInstant ? t("paused.stillInstant") : t("paused.contactOnly");
      return {
        text: `${what} ${next} ${t("paused.fix", values)}`,
        push: { title: t("paused.title", { brand }), body: `${what} ${next}`, url: settings.path, tag: `bayit-paused-${alert.failed}` },
      };
    }
  }
}

/** Replies of the bot itself (connect, expired link, help, stop). */
export async function telegramReply(
  locale: AppLocale,
  key: "linked" | "expired" | "help" | "stopped" | "notLinked" | "resumed" | "disconnected",
): Promise<string> {
  const t = await getTranslations({ locale, namespace: "alerts.telegram" });
  const brand = brandOf(locale);
  return t(key, { brand, url: settingsUrl(locale).url });
}
