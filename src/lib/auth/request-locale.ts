import { locales, type AppLocale } from "@/config/site";
import { isAppLocale } from "@/i18n/locale";

/** Pure helper for the sign-up hook (safe anywhere). */

type RequestContext = {
  getCookie: (key: string) => string | null;
  headers?: Headers | undefined;
} | null | undefined;

/**
 * The visitor's language for a new account: the NEXT_LOCALE cookie (set by the language
 * switcher / next-intl), else the browser's Accept-Language. Apple signs in with a cross-site
 * form POST that carries no SameSite=Lax cookies, so the header fallback matters there.
 */
export function localeFromRequest(ctx: RequestContext): AppLocale | null {
  const cookie = ctx?.getCookie("NEXT_LOCALE");
  if (isAppLocale(cookie)) return cookie;
  const header = ctx?.headers?.get("accept-language");
  if (!header) return null;
  const preferred = header
    .split(",")
    .map((part) => {
      const [tag, ...params] = part.trim().split(";");
      const q = params.find((p) => p.trim().startsWith("q="));
      return { tag: tag.toLowerCase().split("-")[0], q: q ? Number(q.trim().slice(2)) || 0 : 1 };
    })
    .sort((a, b) => b.q - a.q);
  const match = preferred.find(({ tag }) => (locales as readonly string[]).includes(tag));
  return match ? (match.tag as AppLocale) : null;
}
