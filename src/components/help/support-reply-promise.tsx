import { getLocale, getTranslations } from "next-intl/server";
import { isAppLocale } from "@/i18n/locale";
import { getSettings } from "@/lib/settings";

/**
 * The support reply promise (SECURITY_REPORT 19.b, founder's answer 9): "Replies within one business
 * day, Sunday to Thursday. Messages sent Friday or Saturday are answered on Sunday." The founder can
 * change it per language in Admin → Settings → Support (SiteSetting `supportReplyPromise`); an
 * empty language shows the default text (help.json `replyTime.promise`). Server component.
 */
export async function SupportReplyPromise({ className }: { className?: string }) {
  const [t, settings, locale] = await Promise.all([getTranslations("help.replyTime"), getSettings(), getLocale()]);
  const custom = isAppLocale(locale) ? settings.supportReplyPromise[locale]?.trim() : undefined;
  return (
    <p className={className} data-testid="support-reply-promise">
      {custom || t("promise")}
    </p>
  );
}
