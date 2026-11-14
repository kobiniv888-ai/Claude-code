/**
 * Emergency and embassy contacts shown on /jewish-life (pure, client-safe).
 *
 * Admins store them in SiteSetting key "emergencyContacts" as a JSON array:
 *   [{ "label": { "he": "…", "en": "Embassy of Israel", "ru": "…", "ar": "…", "ka": "…" },
 *      "phone": "+995 32 2XX XX XX", "url": "https://…" }]
 * Each entry needs a label and a phone number or a URL. Invalid entries are skipped.
 */
import { z } from "zod";
import { COUNTRIES, DEFAULT_COUNTRY } from "@/config/countries";
import { locales, type Localized } from "@/config/site";
import { telHref } from "@/lib/phone";
import { safeWebsiteUrl } from "./places";

export const EMERGENCY_CONTACTS_SETTING_KEY = "emergencyContacts";

/** Georgia's single emergency number (police, ambulance, fire): src/config/countries.ts. */
export const GEORGIA_EMERGENCY_NUMBER = COUNTRIES[DEFAULT_COUNTRY].emergencyNumber;

const labelSchema = z
  .object(Object.fromEntries(locales.map((l) => [l, z.string().trim().max(200).optional()])) as Record<
    (typeof locales)[number],
    z.ZodOptional<z.ZodString>
  >)
  .refine((label) => Object.values(label).some((v) => typeof v === "string" && v.length > 0), "Label is empty");

const entrySchema = z
  .object({
    label: labelSchema,
    phone: z.string().trim().max(40).optional().nullable(),
    url: z.string().trim().max(500).optional().nullable(),
  })
  .refine((e) => Boolean(e.phone?.trim() || e.url?.trim()), "Phone or URL required");

export type EmergencyContact = {
  label: Partial<Localized>;
  /** As entered (show inside <Ltr>). */
  phone: string | null;
  /** `tel:` link for `phone`. */
  phoneHref: string | null;
  /** Normalized http(s) URL. */
  url: string | null;
};

/** Validates the stored setting; never throws. */
export function parseEmergencyContacts(value: unknown): EmergencyContact[] {
  if (!Array.isArray(value)) return [];
  const out: EmergencyContact[] = [];
  for (const raw of value.slice(0, 50)) {
    const parsed = entrySchema.safeParse(raw);
    if (!parsed.success) continue;
    const phone = parsed.data.phone?.trim() || null;
    // E.164 without a national 0 ("+995 032…" → tel:+99532…); short numbers like 112 as written.
    const phoneHref = phone ? telHref(phone, COUNTRIES[DEFAULT_COUNTRY].defaultPhoneCountry) : null;
    const url = safeWebsiteUrl(parsed.data.url);
    if (!phoneHref && !url) continue;
    const label: Partial<Localized> = {};
    for (const locale of locales) {
      const text = parsed.data.label[locale];
      if (text) label[locale] = text;
    }
    out.push({ label, phone: phoneHref ? phone : null, phoneHref, url });
  }
  return out;
}
