/**
 * How the account overview greets the user ("שלום, יוסי").
 *
 * Seeded demo accounts keep their "Demo …" names so they never pass for real hosts, so they are
 * greeted by the personal part of the name with a demo tag ("Demo Owner — Yossi" → "Yossi (demo)"),
 * or neutrally when the name has no personal part ("Demo Admin", "Demo Hotel Batumi").
 */
export type AccountGreeting =
  | { kind: "name"; name: string }
  | { kind: "demoName"; name: string }
  | { kind: "demo" };

/** Splits "Demo Owner — Yossi" (em dash, en dash or a spaced hyphen) into its parts. */
const NAME_SEPARATOR = /\s+[—–-]\s+/;

export function accountGreeting(fullName: string, isDemo: boolean): AccountGreeting {
  const name = fullName.trim();
  if (!isDemo) return { kind: "name", name: name.split(/\s+/)[0] || name };
  const parts = name.split(NAME_SEPARATOR);
  const personal = parts.length > 1 ? parts[parts.length - 1].trim().split(/\s+/)[0] : "";
  return personal && !/^demo$/i.test(personal) ? { kind: "demoName", name: personal } : { kind: "demo" };
}
