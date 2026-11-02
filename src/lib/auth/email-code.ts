import "server-only";
import { isAppLocale } from "@/i18n/locale";
import { db } from "@/lib/db";
import { isEmailAddress, sendEmail } from "@/lib/email";
import { firstNameOf } from "./first-name";
import { isPlaceholderEmail } from "./phone";
import { emailCodeKey, rememberScreenCode, type EmailCodeRoute } from "./sms";

/** Email login codes (Better Auth emailOTP plugin → our branded "login_code" email). */

/** A normalized address fit for an email code, or null (invalid, or a phone-only placeholder). */
export function checkLoginEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  if (!email || !isEmailAddress(email) || isPlaceholderEmail(email)) return null;
  return email;
}

export async function sendLoginEmailCode(input: {
  email: string;
  code: string;
  ttlSeconds: number;
  locale?: string | null;
  route: EmailCodeRoute;
}): Promise<void> {
  if (input.route === "unavailable") return; // refused earlier by the hook in ./server.ts
  if (input.route === "screen") {
    rememberScreenCode(emailCodeKey(input.email), input.code, input.ttlSeconds);
  }
  const user = await db.user
    .findUnique({ where: { email: input.email }, select: { firstName: true, name: true, locale: true, isDemo: true } })
    .catch(() => null);
  // The account's language when it has one, else the interface language of the request.
  const locale = user?.locale ?? (isAppLocale(input.locale) ? input.locale : "en");
  const result = await sendEmail({
    to: input.email,
    template: "login_code",
    locale,
    data: {
      code: input.code,
      minutes: Math.round(input.ttlSeconds / 60),
      name: user && !user.isDemo ? firstNameOf(user) : null,
    },
    redact: [input.code],
  });
  if (!result.ok) console.error("[auth] the login code email could not be sent");
}
