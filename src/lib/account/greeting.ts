import { firstNameOf } from "@/lib/auth/first-name";

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

export function accountGreeting(fullName: string, isDemo: boolean, firstName?: string | null): AccountGreeting {
  const name = fullName.trim();
  if (!isDemo) {
    const first = firstNameOf({ firstName, name });
    return first ? { kind: "name", name: first } : { kind: "none" };
  }
  const parts = name.split(NAME_SEPARATOR);
  const personal = parts.length > 1 ? parts[parts.length - 1].trim().split(/\s+/)[0] : "";
  return personal && !/^demo$/i.test(personal) ? { kind: "demoName", name: personal } : { kind: "demo" };
}
