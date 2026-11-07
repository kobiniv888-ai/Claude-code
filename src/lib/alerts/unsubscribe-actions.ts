"use server";

/**
 * The one-tap unsubscribe page's button (round 3, brief 6.2): turns an email kind off (or back on)
 * for the account named in a signed link, without logging in. The token is the only proof
 * (src/lib/alerts/unsubscribe-token.ts); it can change nothing but that one switch in
 * User.notificationPrefs. Rate-limited per IP. Works without JavaScript (a plain form post).
 */
import { z } from "zod";
import { redirect } from "@/i18n/navigation";
import { isAppLocale } from "@/i18n/locale";
import { siteConfig } from "@/config/site";
import { rateLimitByIp } from "@/lib/rate-limit";
import { setWeeklyStatsEmail } from "./unsubscribe-server";
import { verifyUnsubscribeToken } from "./unsubscribe-token";

const formSchema = z.object({
  t: z.string().min(1).max(200),
  on: z.enum(["0", "1"]),
  locale: z.string().max(5),
});

export async function submitUnsubscribe(formData: FormData): Promise<void> {
  const parsed = formSchema.safeParse({ t: formData.get("t"), on: formData.get("on"), locale: formData.get("locale") });
  const locale = parsed.success && isAppLocale(parsed.data.locale) ? parsed.data.locale : siteConfig.i18n.primaryLocale;
  const token = parsed.success ? parsed.data.t : "";
  const verified = parsed.success ? verifyUnsubscribeToken(token) : null;
  if (!parsed.success || !verified) {
    redirect({ href: { pathname: "/unsubscribe", query: { state: "invalid" } }, locale });
  }
  const limit = await rateLimitByIp("unsubscribe", { limit: 30, windowSeconds: 3600 });
  if (!limit.ok) {
    redirect({ href: { pathname: "/unsubscribe", query: { t: token, state: "limited" } }, locale });
  }
  const on = parsed.data!.on === "1";
  const changed = await setWeeklyStatsEmail(verified!.userId, on).catch((error: unknown) => {
    console.error("[unsubscribe] could not change the preference:", error);
    return null;
  });
  const state = changed === null ? "error" : !changed ? "invalid" : on ? "on" : "off";
  // An error keeps the direction, so "retry" repeats the same change.
  redirect({ href: { pathname: "/unsubscribe", query: { t: token, state, ...(state === "error" ? { on: on ? "1" : "0" } : {}) } }, locale });
}
