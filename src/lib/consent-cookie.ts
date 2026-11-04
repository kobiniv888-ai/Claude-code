/**
 * Cookie consent — the shared, client-safe part (format of the "bayit_consent" cookie).
 * Server code reads it with getConsent() from "@/lib/consent".
 *
 * Before using analytics or storing a non-essential preference in the browser, check:
 *   if (hasConsent("analytics")) { … }
 */

export const CONSENT_COOKIE_NAME = "bayit_consent";
/** Bump when the categories change: older choices are then asked again. */
export const CONSENT_VERSION = 1;
/** 180 days, in seconds. */
export const CONSENT_MAX_AGE_SECONDS = 180 * 24 * 60 * 60;
/** Fired on window after the visitor saves a choice (the banner sends it; stores and loaders listen). */
export const CONSENT_EVENT = "bayit:consent";

export type ConsentCategory = "necessary" | "preferences" | "analytics";

export type Consent = {
  necessary: true;
  preferences: boolean;
  analytics: boolean;
  v: typeof CONSENT_VERSION;
};

export const ALL_CONSENT: Consent = { necessary: true, preferences: true, analytics: true, v: CONSENT_VERSION };
export const NECESSARY_ONLY: Consent = { necessary: true, preferences: false, analytics: false, v: CONSENT_VERSION };

export function makeConsent(choice: { preferences: boolean; analytics: boolean }): Consent {
  return { necessary: true, preferences: !!choice.preferences, analytics: !!choice.analytics, v: CONSENT_VERSION };
}

/** The cookie value (URL-encoded JSON). */
export function serializeConsent(consent: Consent): string {
  return encodeURIComponent(JSON.stringify(makeConsent(consent)));
}

/** Reads a cookie value; null when missing, malformed or from an older consent version. */
export function parseConsent(raw: string | null | undefined): Consent | null {
  if (!raw) return null;
  let value: unknown;
  try {
    value = JSON.parse(decodeURIComponent(raw));
  } catch {
    return null;
  }
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (record.v !== CONSENT_VERSION) return null;
  if (typeof record.preferences !== "boolean" || typeof record.analytics !== "boolean") return null;
  return makeConsent({ preferences: record.preferences, analytics: record.analytics });
}

/** A full Set-Cookie style string for document.cookie. */
export function consentCookieString(consent: Consent, { secure }: { secure: boolean }): string {
  return [
    `${CONSENT_COOKIE_NAME}=${serializeConsent(consent)}`,
    `Max-Age=${CONSENT_MAX_AGE_SECONDS}`,
    "Path=/",
    "SameSite=Lax",
    ...(secure ? ["Secure"] : []),
  ].join("; ");
}

/** The value of one cookie in a `document.cookie` string. */
export function readCookie(cookieHeader: string, name: string): string | null {
  for (const part of cookieHeader.split(";")) {
    const index = part.indexOf("=");
    if (index === -1) continue;
    if (part.slice(0, index).trim() === name) return part.slice(index + 1).trim();
  }
  return null;
}

// ── Browser helpers ──

/** The visitor's saved choice (browser only; null on the server or before they choose). */
export function readConsent(): Consent | null {
  if (typeof document === "undefined") return null;
  return parseConsent(readCookie(document.cookie, CONSENT_COOKIE_NAME));
}

/** Saves the choice for 180 days (browser only). */
export function writeConsent(consent: Consent): void {
  if (typeof document === "undefined") return;
  document.cookie = consentCookieString(consent, { secure: window.location.protocol === "https:" });
}

/** True when the visitor allowed this category. "necessary" is always allowed. */
export function hasConsent(category: ConsentCategory): boolean {
  if (category === "necessary") return true;
  return readConsent()?.[category] === true;
}
