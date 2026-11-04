/**
 * Making an existing account the site's admin (founder's answer 1, round 3). Used by
 * `npm run admin:grant` (scripts/admin-grant.ts), the only way to create the FIRST admin; later
 * admins can be given roles in Admin → Roles.
 *
 *   npm run admin:grant -- --email you@example.com
 *   npm run admin:grant -- --phone +972531234567
 *   npm run admin:grant -- --from-env      (BAYIT_ADMIN_EMAIL, else BAYIT_ADMIN_PHONE, from .env)
 *
 * Rules: the account must already exist (sign in once first), must not be a demo account and must
 * not be banned or deleted. The email is looked up first; the phone (normalized with
 * normalizePhone) only when there is no email or no account has it. The change and an AuditLog
 * row ("user.role_change", actor = none, details.via = "script") are written in one transaction.
 * 2-step login is never turned off: the next visit to /admin asks for it
 * (src/lib/auth/staff-access.ts).
 *
 * --from-env runs at every codespace start (.devcontainer/start.sh, setup.sh): it says nothing
 * when the settings are empty, when no such account exists yet, or when the account is already
 * an admin with 2-step login set up.
 *
 * The output never shows the full email or phone (maskIdentifier). Takes the database client as
 * a parameter so it is unit-tested without a database. Never put a real address or number in
 * code, tests or docs; it comes from the command line or .env.
 */
import { normalizePhone } from "@/lib/phone";
import { maskPhone } from "./plan";

export type GrantTarget = { kind: "email"; value: string } | { kind: "phone"; value: string; raw: string };

export type GrantArgsResult =
  | {
      ok: true;
      /** Looked up in this order; the first one that finds an account is used. */
      targets: GrantTarget[];
      fromEnv: boolean;
      /** --from-env only: settings that were set but are not usable (names, never values). */
      skipped: string[];
    }
  | { ok: false; error: string };

export type GrantEnv = { BAYIT_ADMIN_EMAIL?: string; BAYIT_ADMIN_PHONE?: string };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function emailTarget(raw: string): GrantTarget | null {
  const value = raw.trim().toLowerCase();
  return EMAIL.test(value) ? { kind: "email", value } : null;
}

function phoneTarget(raw: string): GrantTarget | null {
  const value = normalizePhone(raw);
  return value ? { kind: "phone", value, raw: raw.trim() } : null;
}

/** Reads `--email x`, `--phone y` (or `--email=x`) or `--from-env`. */
export function parseGrantArgs(argv: readonly string[], env: GrantEnv = {}): GrantArgsResult {
  let email: string | undefined;
  let phone: string | undefined;
  let fromEnv = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const [flag, inline] = arg.includes("=") ? [arg.slice(0, arg.indexOf("=")), arg.slice(arg.indexOf("=") + 1)] : [arg, undefined];
    if (flag === "--email" || flag === "--phone") {
      const value = inline ?? argv[i + 1];
      if (inline === undefined) i += 1;
      if (!value || value.startsWith("--")) return { ok: false, error: `${flag} needs a value` };
      if (flag === "--email") email = value;
      else phone = value;
    } else if (flag === "--from-env" && inline === undefined) {
      fromEnv = true;
    } else if (flag === "--help" || flag === "-h") {
      return { ok: false, error: "help" };
    } else {
      return { ok: false, error: `unknown option: ${arg}` };
    }
  }
  const given = [email, phone, fromEnv || undefined].filter((v) => v !== undefined).length;
  if (given > 1) return { ok: false, error: "give ONE of --email, --phone or --from-env" };

  if (fromEnv) {
    const targets: GrantTarget[] = [];
    const skipped: string[] = [];
    const envEmail = env.BAYIT_ADMIN_EMAIL?.trim();
    const envPhone = env.BAYIT_ADMIN_PHONE?.trim();
    if (envEmail) {
      const target = emailTarget(envEmail);
      if (target) targets.push(target);
      else skipped.push("BAYIT_ADMIN_EMAIL");
    }
    if (envPhone) {
      const target = phoneTarget(envPhone);
      if (target) targets.push(target);
      else skipped.push("BAYIT_ADMIN_PHONE");
    }
    return { ok: true, targets, fromEnv: true, skipped };
  }
  if (email) {
    const target = emailTarget(email);
    return target ? { ok: true, targets: [target], fromEnv: false, skipped: [] } : { ok: false, error: "that is not an email address" };
  }
  if (phone) {
    const target = phoneTarget(phone);
    return target
      ? { ok: true, targets: [target], fromEnv: false, skipped: [] }
      : { ok: false, error: "that is not a phone number in international format (+972… / +995…)" };
  }
  return { ok: false, error: "give --email, --phone or --from-env" };
}

/** "someone@example.com" → "s•••@e•••.com"; a phone keeps its country part and last 2 digits. */
export function maskIdentifier(target: GrantTarget): string {
  if (target.kind === "phone") return maskPhone(target.value);
  const [local, domain = ""] = target.value.split("@");
  const dot = domain.lastIndexOf(".");
  const name = dot > 0 ? domain.slice(0, dot) : domain;
  const tld = dot > 0 ? domain.slice(dot) : "";
  return `${Array.from(local)[0] ?? ""}•••@${Array.from(name)[0] ?? ""}•••${tld}`;
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
  | { status: "granted"; userId: string; previousRole: string; twoFactorEnabled: boolean; placeholderEmail: boolean; target: GrantTarget }
  | { status: "already_admin"; userId: string; twoFactorEnabled: boolean; placeholderEmail: boolean; target: GrantTarget }
  | { status: "not_found" }
  | { status: "ambiguous"; count: number; target: GrantTarget }
  | { status: "demo_account"; target: GrantTarget }
  | { status: "blocked_account"; accountStatus: string; target: GrantTarget };

const ACCOUNT_SELECT = { id: true, role: true, isDemo: true, status: true, twoFactorEnabled: true, email: true } as const;

/** Phone-only accounts carry "<digits>@phone.bayit.invalid": they cannot receive admin emails. */
function isPlaceholder(email: string): boolean {
  return email.toLowerCase().endsWith("@phone.bayit.invalid");
}

async function grantOne(db: GrantDb, target: GrantTarget): Promise<GrantOutcome> {
  const where =
    target.kind === "email"
      ? { email: { equals: target.value, mode: "insensitive" } }
      : // Older rows may still hold the number as typed until the phone clean-up runs.
        { phoneNumber: { in: Array.from(new Set([target.value, target.raw])) } };
  const found = await db.user.findMany({ where, select: ACCOUNT_SELECT, take: 2 });
  if (found.length === 0) return { status: "not_found" };
  if (found.length > 1) return { status: "ambiguous", count: found.length, target };
  const account = found[0];
  if (account.isDemo) return { status: "demo_account", target };
  if (account.status === "BANNED" || account.status === "DELETED") return { status: "blocked_account", accountStatus: account.status, target };
  const placeholderEmail = isPlaceholder(account.email);
  if (account.role === "ADMIN") {
    return { status: "already_admin", userId: account.id, twoFactorEnabled: account.twoFactorEnabled, placeholderEmail, target };
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
  return { status: "granted", userId: account.id, previousRole: account.role, twoFactorEnabled: account.twoFactorEnabled, placeholderEmail, target };
}

/** Tries the targets in order (email first); the first one that finds an account decides. */
export async function grantAdmin(db: GrantDb, targets: GrantTarget | readonly GrantTarget[]): Promise<GrantOutcome> {
  for (const target of Array.isArray(targets) ? targets : [targets]) {
    const outcome = await grantOne(db, target as GrantTarget);
    if (outcome.status !== "not_found") return outcome;
  }
  return { status: "not_found" };
}

/**
 * What the script prints for an outcome (English: it runs in a terminal). Only the masked
 * identifier, never the full email or phone, never the account id. `quiet` (--from-env): nothing
 * for "no such account yet" and for an admin that already has 2-step login.
 */
export function grantMessage(outcome: GrantOutcome, { quiet = false }: { quiet?: boolean } = {}): { ok: boolean; lines: string[] } {
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
  const who = "target" in outcome ? maskIdentifier(outcome.target) : "";
  switch (outcome.status) {
    case "granted":
      return {
        ok: true,
        lines: [
          `Done: the account ${who} is now ADMIN (was ${outcome.previousRole}). Written to the audit log.`,
          ...(outcome.twoFactorEnabled ? ["2-step login is already set up for this account."] : twoStep),
          ...(outcome.placeholderEmail ? noEmail : []),
        ],
      };
    case "already_admin":
      if (quiet && outcome.twoFactorEnabled && !outcome.placeholderEmail) return { ok: true, lines: [] };
      return {
        ok: true,
        lines: [
          `The account ${who} is already ADMIN. Nothing changed.`,
          ...(outcome.twoFactorEnabled ? [] : twoStep),
          ...(outcome.placeholderEmail ? noEmail : []),
        ],
      };
    case "not_found":
      if (quiet) return { ok: true, lines: [] };
      return { ok: false, lines: ["No account found. Sign in on the site once with this email or phone, then run this again."] };
    case "ambiguous":
      return { ok: false, lines: [`${outcome.count} accounts match ${who}. Use the email address instead.`] };
    case "demo_account":
      return { ok: false, lines: [`Refused: ${who} is a demo account. Demo accounts can never be made admin.`] };
    case "blocked_account":
      return { ok: false, lines: [`Refused: the account ${who} is ${outcome.accountStatus.toLowerCase()}.`] };
  }
}
