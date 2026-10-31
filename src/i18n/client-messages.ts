import "server-only";
import type { AbstractIntlMessages } from "next-intl";

/**
 * Which interface text the browser receives.
 *
 * The root layout's <NextIntlClientProvider> serializes its messages into every page (HTML and
 * the RSC payload). All namespaces together are ~300 KB of Hebrew text, most of it for the admin
 * panel, the post wizard, the dashboard, legal pages and emails, which no client component on a
 * public page reads. Public pages therefore get every namespace except the ones below, and the
 * sections that need them (`/account`, `/admin`, `/post`) mount their own provider with all
 * messages (`<NextIntlClientProvider>` without `messages` inherits the full set).
 *
 * A namespace listed here must not be read by a client component (`useTranslations` in a
 * "use client" module, or a module it imports) outside those sections. Server components read
 * the full set from i18n/request.ts and are not affected.
 */
export const SECTION_ONLY_NAMESPACES = [
  // Only client components under /admin, /account or /post.
  "admin",
  "adminContent",
  "account",
  "moderation",
  "uploads",
  "wizard",
  // Only read by server components.
  "about",
  "banners",
  "emails",
  "footer",
  "hebcal",
  "home",
  "howItWorks",
  "legal",
  "owner",
  "safety",
  "shabbat",
] as const;

/** All messages minus the section-only namespaces: what public pages send to the browser. */
export function publicClientMessages(messages: AbstractIntlMessages): AbstractIntlMessages {
  const omit = new Set<string>(SECTION_ONLY_NAMESPACES);
  return Object.fromEntries(Object.entries(messages).filter(([namespace]) => !omit.has(namespace)));
}
