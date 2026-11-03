/**
 * Making an existing account the site's admin (founder's answer 1, round 3). Used by
 * `npm run admin:grant` (scripts/admin-grant.ts), the only way to create the FIRST admin; later
 * admins can be given roles in Admin → Roles.
 *
 *   npm run admin:grant -- --email you@example.com
 *   npm run admin:grant -- --phone +972531234567
 *   npm run admin:grant                       (reads BAYIT_ADMIN_EMAIL / BAYIT_ADMIN_PHONE from .env)
 *
 * Rules: the account must already exist (sign in once first), must not be a demo account and must
 * not be banned or deleted. The change and an AuditLog row ("user.role_change", actor = none,
 * details.via = "script") are written in one transaction. 2-step login is never turned off: the
 * next visit to /admin asks for it (src/lib/auth/staff-access.ts).
 *
 * Takes the database client as a parameter so it is unit-tested without a database. Never put a
 * real address or number in code, tests or docs; it comes from the command line or .env.
 */
import { normalizePhone } from "@/lib/phone";

export type GrantTarget = { kind: "email"; value: string } | { kind: "phone"; value: string; raw: string };

export type GrantArgsResult = { ok: true; target: GrantTarget } | { ok: false; error: string };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Reads `--email x` / `--phone y` (or `--email=x`), else BAYIT_ADMIN_EMAIL / BAYIT_ADMIN_PHONE. */
export function parseGrantArgs(argv: readonly string[], env: { BAYIT_ADMIN_EMAIL?: string; BAYIT_ADMIN_PHONE?: string } = {}): GrantArgsResult {
  let email: string | undefined;
  let phone: string | undefined;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const [flag, inline] = arg.includes("=") ? [arg.slice(0, arg.indexOf("=")), arg.slice(arg.indexOf("=") + 1)] : [arg, undefined];
    if (flag === "--email" || flag === "--phone") {
      const value = inline ?? argv[i + 1];
      if (inline === undefined) i += 1;
      if (!value || value.startsWith("--")) return { ok: false, error: `${flag} needs a value` };
      if (flag === "--email") email = value;
      else phone = value;
    } else if (flag === "--help" || flag === "-h") {
      return { ok: false, error: "help" };
    } else {
      return { ok: false, error: `unknown option: ${arg}` };
    }
  }
  if (email && phone) return { ok: false, error: "give --email OR --phone, not both" };
  if (!email && !phone) {
    email = env.BAYIT_ADMIN_EMAIL?.trim() || undefined;
    phone = email ? undefined : env.BAYIT_ADMIN_PHONE?.trim() || undefined;
  }
  if (email) {
    const value = email.trim().toLowerCase();
    if (!EMAIL.test(value)) return { ok: false, error: "that is not an email address" };
    return { ok: true, target: { kind: "email", value } };
  }
  if (phone) {
    const value = normalizePhone(phone);
    if (!value) return { ok: false, error: "that is not a phone number in international format (+972… / +995…)" };
    return { ok: true, target: { kind: "phone", value, raw: phone.trim() } };
  }
  return { ok: false, error: "give --email or --phone (or set BAYIT_ADMIN_EMAIL / BAYIT_ADMIN_PHONE in .env)" };
}

export type GrantAccount = {
  id: string;
  role: string;
  isDemo: boolean;
  status: string;
  twoFactorEnabled: boolean;
  email: string;
};

/** The few database calls the grant needs (a Prisma client fits). */
export type GrantDb = {
  user: {
    findMany(args: {
      where: Record<string, unknown>;
      select: Record<keyof GrantAccount, true>;
      take: number;
    }): Promise<GrantAccount[]>;
  };
  $transaction<T>(fn: (tx: GrantTx) => Promise<T>): Promise<T>;
};
export type GrantTx = {
  user: { update(args: { where: { id: string }; data: { role: "ADMIN" } }): Promise<unknown> };
  auditLog: {
    create(args: {
      data: { actorId: null; action: string; targetType: string; targetId: string; details: Record<string, unknown> };
    }): Promise<unknown>;
  };
};

export type GrantOutcome =
  | { status: "granted"; userId: string; previousRole: string; twoFactorEnabled: boolean; placeholderEmail: boolean }
  | { status: "already_admin"; userId: string; twoFactorEnabled: boolean; placeholderEmail: boolean }
  | { status: "not_found" }
  | { status: "ambiguous"; count: number }
  | { status: "demo_account" }
  | { status: "blocked_account"; accountStatus: string };

const ACCOUNT_SELECT = { id: true, role: true, isDemo: true, status: true, twoFactorEnabled: true, email: true } as const;

/** Phone-only accounts carry "<digits>@phone.bayit.invalid": they cannot receive admin emails. */
function isPlaceholder(email: string): boolean {
  return email.toLowerCase().endsWith("@phone.bayit.invalid");
}

export async function grantAdmin(db: GrantDb, target: GrantTarget): Promise<GrantOutcome> {
  const where =
    target.kind === "email"
      ? { email: { equals: target.value, mode: "insensitive" } }
      : // Older rows may still hold the number as typed until the phone clean-up runs.
        { phoneNumber: { in: Array.from(new Set([target.value, target.raw])) } };
  const found = await db.user.findMany({ where, select: ACCOUNT_SELECT, take: 2 });
  if (found.length === 0) return { status: "not_found" };
  if (found.length > 1) return { status: "ambiguous", count: found.length };
  const account = found[0];
  if (account.isDemo) return { status: "demo_account" };
  if (account.status === "BANNED" || account.status === "DELETED") return { status: "blocked_account", accountStatus: account.status };
  const placeholderEmail = isPlaceholder(account.email);
  if (account.role === "ADMIN") {
    return { status: "already_admin", userId: account.id, twoFactorEnabled: account.twoFactorEnabled, placeholderEmail };
  }
  await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: account.id }, data: { role: "ADMIN" } });
    await tx.auditLog.create({
      data: {
        actorId: null,
        action: "user.role_change",
        targetType: "User",
        targetId: account.id,
        details: { from: account.role, to: "ADMIN", via: "script", lookup: target.kind },
      },
    });
  });
  return { status: "granted", userId: account.id, previousRole: account.role, twoFactorEnabled: account.twoFactorEnabled, placeholderEmail };
}

/** What the script prints for an outcome (English: it runs in a terminal). */
export function grantMessage(outcome: GrantOutcome): { ok: boolean; lines: string[] } {
  const twoStep = [
    "",
    "Next: sign in on the site with this account and open /admin.",
    "2-step login is REQUIRED for the admin: the site asks you to scan a QR code with Google",
    "Authenticator (/two-factor/setup) before the admin panel opens. Keep the backup codes safe.",
  ];
  const noEmail = [
    "",
    "Note: this account has no real email address (phone-only), so admin emails cannot reach it.",
    "Add an email address in the account settings, and set ADMIN_ALERT_EMAIL for the alerts.",
  ];
  switch (outcome.status) {
    case "granted":
      return {
        ok: true,
        lines: [
          `Done: account ${outcome.userId} is now ADMIN (was ${outcome.previousRole}). Written to the audit log.`,
          ...(outcome.twoFactorEnabled ? ["2-step login is already set up for this account."] : twoStep),
          ...(outcome.placeholderEmail ? noEmail : []),
        ],
      };
    case "already_admin":
      return {
        ok: true,
        lines: [
          `Account ${outcome.userId} is already ADMIN. Nothing changed.`,
          ...(outcome.twoFactorEnabled ? [] : twoStep),
          ...(outcome.placeholderEmail ? noEmail : []),
        ],
      };
    case "not_found":
      return { ok: false, lines: ["No account found. Sign in on the site once with this email or phone, then run this again."] };
    case "ambiguous":
      return { ok: false, lines: [`${outcome.count} accounts match. Use the email address instead.`] };
    case "demo_account":
      return { ok: false, lines: ["Refused: this is a demo account. Demo accounts can never be made admin."] };
    case "blocked_account":
      return { ok: false, lines: [`Refused: this account is ${outcome.accountStatus.toLowerCase()}.`] };
  }
}
