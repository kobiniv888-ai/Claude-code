/**
 * Account settings: input schemas and the notification preferences shape (pure, client-safe).
 *
 * User.notificationPrefs (JSON):
 *   { email: { listing: true, tickets: true, messages: true, marketing: false }, whatsapp: false }
 * Missing values fall back to NOTIFICATION_DEFAULTS — the same defaults the senders assume
 * (listing and ticket emails on unless turned off, tips & news off unless turned on).
 */
import { z } from "zod";
import { FIRST_NAME_MAX, looksLikeContact } from "@/lib/auth/first-name";
import { locales } from "@/config/site";
import { enabledCurrencies } from "@/lib/currency/convert";

/** Languages offered in "Languages you speak" (ISO 639-1), shown with their localized names. */
export const SPOKEN_LANGUAGE_OPTIONS = [
  "he",
  "en",
  "ru",
  "ka",
  "ar",
  "uk",
  "fr",
  "de",
  "es",
  "it",
  "pt",
  "tr",
  "az",
  "hy",
  "yi",
  "am",
  "fa",
  "pl",
  "ro",
  "hu",
  "nl",
  "zh",
] as const;

export const MAX_SPOKEN_LANGUAGES = 12;
export const NAME_MAX = 60;
export const BIO_MAX = 1000;
export const BUSINESS_NAME_MAX = 120;

const languageCode = z.string().regex(/^[a-z]{2,3}$/);

export const profileSchema = z
  .object({
    name: z.string().trim().min(2).max(NAME_MAX),
    // "שלום, <first name>" (brief 5.8): required, never a phone or an email.
    firstName: z
      .string()
      .transform((value) => value.replace(/\s+/g, " ").trim())
      .pipe(
        z
          .string()
          .min(1, "required")
          .max(FIRST_NAME_MAX, "invalid")
          .refine((value) => !looksLikeContact(value), "not_a_name"),
      ),
    bio: z
      .string()
      .trim()
      .max(BIO_MAX)
      .optional()
      .transform((v) => v || null),
    spokenLanguages: z
      .array(languageCode)
      .max(MAX_SPOKEN_LANGUAGES)
      .transform((list) => [...new Set(list)]),
    keepsShabbat: z.boolean(),
    accountType: z.enum(["PRIVATE", "BUSINESS"]),
    businessName: z
      .string()
      .trim()
      .max(BUSINESS_NAME_MAX)
      .optional()
      .transform((v) => v || null),
  })
  .superRefine((value, ctx) => {
    if (value.accountType === "BUSINESS" && !value.businessName) {
      ctx.addIssue({ code: "custom", path: ["businessName"], message: "required" });
    }
  });
export type ProfileInput = z.input<typeof profileSchema>;

export const contactEmailSchema = z.object({
  contactEmail: z
    .string()
    .trim()
    .max(254)
    .transform((v) => v.toLowerCase())
    .refine((v) => v === "" || z.email().safeParse(v).success, { message: "invalid_email" })
    .transform((v) => v || null),
});

export const preferencesSchema = z.object({
  locale: z.enum(locales),
  /**
   * Sent only when the visitor changed it (round 3, bug 2.8: saving the form used to pin whatever
   * currency the page showed). "auto" = follow the language again (User.currency = null).
   */
  currency: z
    .string()
    .refine((v) => v === "auto" || (enabledCurrencies as readonly string[]).includes(v), { message: "invalid" })
    .optional(),
  showHebrewDates: z.boolean(),
});
export type PreferencesInput = z.input<typeof preferencesSchema>;

export type NotificationPrefs = {
  email: { listing: boolean; tickets: boolean; messages: boolean; marketing: boolean };
  whatsapp: boolean;
};

export const NOTIFICATION_DEFAULTS: NotificationPrefs = {
  email: { listing: true, tickets: true, messages: true, marketing: false },
  whatsapp: false,
};

export const notificationsSchema = z.object({
  email: z.object({
    listing: z.boolean(),
    tickets: z.boolean(),
    messages: z.boolean(),
    marketing: z.boolean(),
  }),
  whatsapp: z.boolean(),
});

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

/** Reads User.notificationPrefs (any shape) into the full preferences with defaults. */
export function parseNotificationPrefs(value: unknown): NotificationPrefs {
  const root = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  const email = root.email && typeof root.email === "object" && !Array.isArray(root.email) ? (root.email as Record<string, unknown>) : {};
  const d = NOTIFICATION_DEFAULTS;
  return {
    email: {
      listing: bool(email.listing, d.email.listing),
      tickets: bool(email.tickets, d.email.tickets),
      messages: bool(email.messages, d.email.messages),
      marketing: bool(email.marketing, d.email.marketing),
    },
    whatsapp: bool(root.whatsapp, d.whatsapp),
  };
}

/** Lower-cased, trimmed text without repeated spaces (typed confirmations). */
export function normalizeConfirmation(text: string): string {
  return text.normalize("NFC").trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

/** The typed confirmation matches the word shown in the user's language (or the English one). */
export function confirmationMatches(typed: string, expected: readonly string[]): boolean {
  const value = normalizeConfirmation(typed);
  return value.length > 0 && expected.some((word) => normalizeConfirmation(word) === value);
}

/** Placeholder address given to a deleted account (unique, never deliverable). */
export function deletedEmailFor(userId: string): string {
  return `deleted-${userId}@deleted.bayit.invalid`;
}

/** The storage key of an avatar we stored for this user, from its public URL (else null). */
export function ownAvatarKey(imageUrl: string | null | undefined, userId: string): string | null {
  if (!imageUrl || !userId) return null;
  const match = /(?:^|\/)avatars\/([A-Za-z0-9_-]+)\.webp$/.exec(imageUrl.split(/[?#]/)[0]);
  if (!match || !match[1].startsWith(`${userId}-`)) return null;
  return `avatars/${match[1]}.webp`;
}

/** How many ways to sign in remain if `providerId` is removed. */
export function remainingSignInMethods(
  data: { hasPhoneLogin: boolean; hasPasswordLogin: boolean; linked: readonly string[] },
  removing: string,
): number {
  return (data.hasPhoneLogin ? 1 : 0) + (data.hasPasswordLogin ? 1 : 0) + data.linked.filter((p) => p !== removing).length;
}
