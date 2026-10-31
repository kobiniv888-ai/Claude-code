import "server-only";
import { cookies } from "next/headers";
import { CONSENT_COOKIE_NAME, parseConsent, type Consent, type ConsentCategory } from "./consent-cookie";

/**
 * Cookie consent on the server. The banner (<CookieConsent />) saves the choice in the
 * "bayit_consent" cookie: { necessary: true, preferences, analytics, v: 1 } for 180 days.
 * Client code uses `readConsent()` / `hasConsent()` from "@/lib/consent-cookie".
 */

export {
  ALL_CONSENT,
  CONSENT_COOKIE_NAME,
  CONSENT_MAX_AGE_SECONDS,
  CONSENT_VERSION,
  NECESSARY_ONLY,
  type Consent,
  type ConsentCategory,
} from "./consent-cookie";

/** The visitor's choice, or null when they have not chosen yet (show the banner). */
export async function getConsent(): Promise<Consent | null> {
  try {
    return parseConsent((await cookies()).get(CONSENT_COOKIE_NAME)?.value);
  } catch {
    // Outside a request (scripts, static generation): no choice.
    return null;
  }
}

/** True when the visitor allowed this category ("necessary" is always allowed). */
export async function hasConsent(category: ConsentCategory): Promise<boolean> {
  if (category === "necessary") return true;
  return (await getConsent())?.[category] === true;
}
