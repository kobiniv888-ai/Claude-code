/**
 * The accessibility coordinator on the accessibility statement (SECURITY_REPORT 15.6.b; Israel's
 * accessibility regulations require a coordinator's name and contact details). Settings, never in
 * the code: the founder sets them at the hosting (OWNER_TODO). Pure.
 *
 *   ACCESSIBILITY_COORDINATOR_NAME   the coordinator's name (or role)
 *   ACCESSIBILITY_COORDINATOR_PHONE  a phone number
 *   ACCESSIBILITY_COORDINATOR_EMAIL  an email address
 *
 * On the real site (SITE_ENV=production) the name and at least one way to reach the coordinator
 * are required: the server refuses to start without them (src/lib/startup-check.ts).
 */

type Env = Partial<Record<string, string | undefined>>;

export type AccessibilityCoordinator = { name: string | null; phone: string | null; email: string | null };

const EMAIL = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[^\s@<>()",;:]+$/;
const PHONE = /^\+?[\d\s().-]{7,20}$/;

const clean = (raw: string | undefined, max: number) => {
  const value = (raw ?? "").replace(/\s+/g, " ").trim();
  return value && value.length <= max ? value : null;
};

/** The coordinator's details from the settings (a malformed phone or email counts as missing). */
export function accessibilityCoordinator(env: Env = process.env): AccessibilityCoordinator {
  const email = clean(env.ACCESSIBILITY_COORDINATOR_EMAIL, 200);
  const phone = clean(env.ACCESSIBILITY_COORDINATOR_PHONE, 30);
  return {
    name: clean(env.ACCESSIBILITY_COORDINATOR_NAME, 120),
    phone: phone && PHONE.test(phone) && phone.replace(/\D/g, "").length >= 7 ? phone : null,
    email: email && EMAIL.test(email) ? email : null,
  };
}

/** What the startup check reports on the real site (names of settings only, never values). */
export function accessibilityStartupProblems(env: Env, site: string | null): string[] {
  if (site !== "production") return [];
  const problems: string[] = [];
  const coordinator = accessibilityCoordinator(env);
  if (!coordinator.name) problems.push("ACCESSIBILITY_COORDINATOR_NAME is not set: the accessibility statement must name its coordinator (SECURITY_REPORT 15.6.b).");
  if (!coordinator.phone && !coordinator.email) {
    problems.push("ACCESSIBILITY_COORDINATOR_PHONE or ACCESSIBILITY_COORDINATOR_EMAIL must be set (a valid phone number or email): the statement must say how to reach the coordinator.");
  }
  return problems;
}
