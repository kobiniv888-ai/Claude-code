import "server-only";
import { sendFounderEmail } from "@/lib/alerts/founder-admin";
import { db } from "@/lib/db";
import { notificationEmailFor, sendEmail } from "@/lib/email";
import { recordSecurityEvent } from "@/lib/security/events";
import { firstNameOf } from "./first-name";
import { SECURITY_CODE_TTL_MS } from "./fresh-proof-rules";
import { isPlaceholderEmail } from "./phone";
import { isStaffRole } from "./permissions";
import type { SecurityChangeKind, StaffAlertKind } from "./security-email-templates";

/**
 * Account-security notices (SECURITY_REPORT 3.6.d/e, 3.7.a/c/e). Email only (P3 a), in the
 * account's language; demo accounts' made-up addresses stay in the outbox. Never throws: a notice
 * that cannot be sent is logged, and the change it reports is not undone.
 */

type NoticeUser = {
  id: string;
  name: string;
  firstName: string | null;
  email: string;
  contactEmail: string | null;
  locale: string;
  isDemo: boolean;
  role: string;
};

async function loadUser(userId: string): Promise<NoticeUser | null> {
  return db.user
    .findUnique({
      where: { id: userId },
      select: { id: true, name: true, firstName: true, email: true, contactEmail: true, locale: true, isDemo: true, role: true },
    })
    .catch(() => null);
}

const greeting = (user: NoticeUser) => (user.isDemo ? null : firstNameOf(user));

/** The 6-digit security code email (the code is masked in the outbox). */
export async function sendSecurityCodeEmail(input: {
  userId: string;
  to: string;
  code: string;
  purpose: "confirm" | "unlock" | "contact";
}): Promise<boolean> {
  const user = await loadUser(input.userId);
  if (!user) return false;
  const result = await sendEmail({
    to: input.to,
    template: "security_code",
    locale: user.locale,
    data: { code: input.code, minutes: Math.round(SECURITY_CODE_TTL_MS / 60_000), purpose: input.purpose, name: greeting(user) },
    redact: [input.code],
    outboxOnly: user.isDemo,
  }).catch(() => ({ ok: false }));
  if (!result.ok) console.error("[auth] the security code email could not be sent");
  return result.ok;
}

/**
 * Something changed on the account: tells the OLD address ("If this wasn't you…") and writes a
 * security event. `oldAddresses`: where the notice goes (the old contact email…); by default the
 * account's notification address before the change.
 */
export async function notifySecurityChange(input: {
  userId: string;
  kind: SecurityChangeKind;
  masked?: string | null;
  provider?: string | null;
  left?: number | null;
  oldAddresses?: (string | null | undefined)[];
}): Promise<void> {
  await recordSecurityEvent({ type: input.kind === "recovery_code_used" ? "recovery_code_used" : "sensitive_change", userId: input.userId, meta: { kind: input.kind, ...(input.provider ? { provider: input.provider } : {}) } });
  const user = await loadUser(input.userId);
  if (!user) return;
  const targets = new Set<string>();
  const candidates = input.oldAddresses ?? [notificationEmailFor(user)];
  for (const address of candidates) {
    const value = address?.trim().toLowerCase();
    if (value && !isPlaceholderEmail(value)) targets.add(value);
  }
  await Promise.all(
    [...targets].map((to) =>
      sendEmail({
        to,
        template: "security_change",
        locale: user.locale,
        data: { kind: input.kind, masked: input.masked ?? null, provider: input.provider ?? null, left: input.left ?? null, at: new Date().toISOString(), name: greeting(user) },
        outboxOnly: user.isDemo,
      }).catch((error) => console.error("[auth] security notice not sent:", (error as Error)?.message)),
    ),
  );
}

/** A sign-in from a new device: the account is told (hosts and staff), and the founder for staff. */
export async function notifyNewDevice(input: { userId: string; device: string | null }): Promise<void> {
  const user = await loadUser(input.userId);
  if (!user) return;
  const to = notificationEmailFor(user);
  const at = new Date().toISOString();
  if (to) {
    await sendEmail({
      to,
      template: "security_new_device",
      locale: user.locale,
      data: { device: input.device, at, name: greeting(user) },
      outboxOnly: user.isDemo,
    }).catch((error) => console.error("[auth] new-device notice not sent:", (error as Error)?.message));
  }
  if (isStaffRole(user.role) && !user.isDemo) await alertFounderAboutStaff({ kind: "new_device", user, device: input.device });
}

/** Founder email about a staff account's security event (never for demo staff). */
export async function alertFounderAboutStaff(input: { kind: StaffAlertKind; user: Pick<NoticeUser, "name" | "role" | "isDemo">; device?: string | null }): Promise<void> {
  if (input.user.isDemo) return;
  await sendFounderEmail("security_staff_alert", {
    kind: input.kind,
    staffName: input.user.name,
    role: input.user.role,
    device: input.device ?? null,
    at: new Date().toISOString(),
  });
}

/** The account was locked after 20 wrong 2-step codes today: the account and (staff) the founder. */
export async function notifyTotpLocked(userId: string): Promise<void> {
  const user = await loadUser(userId);
  if (!user) return;
  await notifySecurityChange({ userId, kind: "totp_locked" });
  if (isStaffRole(user.role)) await alertFounderAboutStaff({ kind: "totp_locked", user });
}
