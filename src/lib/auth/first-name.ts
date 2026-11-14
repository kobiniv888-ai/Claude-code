/**
 * First names (brief 5.8, bug 8.2). Asked right after the first sign-up and in the settings;
 * the account greets "שלום, <first name>" or "שלום!". A phone number, an email or a placeholder
 * ("+972…", "995…@phone.bayit.invalid") is never shown as a name. Pure, safe on server and client.
 * No zod here (client components import these helpers): the form schema is in ./first-name-schema.
 */

export const FIRST_NAME_MAX = 40;

/** True when a "name" is really a phone number or an email address. */
export function looksLikeContact(value: string | null | undefined): boolean {
  const text = value?.trim() ?? "";
  if (!text) return false;
  if (text.includes("@")) return true;
  const digits = text.replace(/\D/g, "").length;
  if (digits >= 7) return true;
  // "+972", "050-123": only digits and phone punctuation.
  return digits >= 3 && /^[+\d\s().\-‐-―]+$/.test(text);
}

/** Collapses runs of spaces and trims. */
export function tidy(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

/** A first name fit to store and show, or null (empty, too long, a phone or an email). */
export function cleanFirstName(value: string | null | undefined): string | null {
  const name = tidy(value);
  if (!name || name.length > FIRST_NAME_MAX || looksLikeContact(name)) return null;
  return name;
}

/** The stored full name when it is a real name; null when empty, a phone or an email. */
export function safeDisplayName(name: string | null | undefined): string | null {
  const value = tidy(name);
  return value && !looksLikeContact(value) ? value : null;
}

/** User.firstName, else the first word of a real full name ("Noa Levi" → "Noa"), else null. */
export function firstNameOf(user: { firstName?: string | null; name?: string | null }): string | null {
  const own = cleanFirstName(user.firstName);
  if (own) return own;
  const full = safeDisplayName(user.name);
  return full ? cleanFirstName(full.split(" ")[0]) : null;
}

/** The name to show for a person: their real full name, else their first name, else null. */
export function personName(user: { firstName?: string | null; name?: string | null }): string | null {
  return safeDisplayName(user.name) ?? cleanFirstName(user.firstName);
}

/**
 * Must this account still give its first name? Demo accounts keep their "Demo …" names and are
 * never asked.
 */
export function needsFirstName(user: { firstName?: string | null; name?: string | null; isDemo?: boolean }): boolean {
  return !user.isDemo && !firstNameOf(user);
}
