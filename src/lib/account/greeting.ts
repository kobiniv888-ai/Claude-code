import { cleanFirstName, firstNameOf } from "@/lib/auth/first-name";

/**
 * How the account overview greets the user ("שלום, יוסי"), or "שלום!" without a first name. A phone
 * number or an email is never used as a name (brief 5.8, bug 8.2).
 *
 * Seeded demo accounts keep their "Demo …" names so they never pass for real hosts, so they are
 * greeted by the personal part of the name with a demo tag ("Demo Owner — Yossi" → "Yossi (demo)"),
 * or neutrally when the name has no personal part ("Demo Admin", "Demo Hotel Batumi").
 */
export type AccountGreeting =
  | { kind: "name"; name: string }
  | { kind: "demoName"; name: string }
  | { kind: "demo" }
  /** No first name yet: "שלום!". */
  | { kind: "none" };

/** Splits "Demo Owner — Yossi" (em dash, en dash or a spaced hyphen) into its parts. */
const NAME_SEPARATOR = /\s+[—–-]\s+/;

/** The personal first name in a demo account's name ("Demo Guest — Noa Levi" → "Noa"), or null. */
export function demoPersonalName(fullName: string): string | null {
  const parts = fullName.trim().split(NAME_SEPARATOR);
  const personal = parts.length > 1 ? parts[parts.length - 1].trim().split(/\s+/)[0] : "";
  return personal && !/^demo$/i.test(personal) ? personal : null;
}

/**
 * The first name the settings form starts with: the saved one, else the first word of a real
 * name. Demo accounts use the personal part of their name or nothing — never "Demo".
 */
export function settingsFirstName(user: { firstName?: string | null; name?: string | null; isDemo?: boolean }): string | null {
  if (!user.isDemo) return firstNameOf(user);
  return cleanFirstName(user.firstName) ?? demoPersonalName(user.name ?? "");
}

export function accountGreeting(fullName: string, isDemo: boolean, firstName?: string | null): AccountGreeting {
  const name = fullName.trim();
  if (!isDemo) {
    const first = firstNameOf({ firstName, name });
    return first ? { kind: "name", name: first } : { kind: "none" };
  }
  const personal = demoPersonalName(name);
  return personal ? { kind: "demoName", name: personal } : { kind: "demo" };
}

/**
 * The one letter shown in an avatar without a photo: the first letter of the first name
 * ("Yossi" → "Y"), or null (a person icon is shown instead). The header menu, the account sidebar,
 * Settings and the host avatars all use it, so a person has the same letter everywhere. Demo
 * accounts use the personal part of their name, never the "D" of "Demo". `isDemo` defaults to a
 * name that starts with "Demo".
 */
export function avatarInitial(user: { firstName?: string | null; name?: string | null; isDemo?: boolean }): string | null {
  const isDemo = user.isDemo ?? /^demo\s/i.test(user.name?.trim() ?? "");
  const first = settingsFirstName({ ...user, isDemo });
  const letter = first ? Array.from(first.trim())[0] : undefined;
  return letter ? letter.toLocaleUpperCase() : null;
}
