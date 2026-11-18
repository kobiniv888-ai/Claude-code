import { describe, expect, it, vi } from "vitest";
import { grantAdmin, grantMessage, maskIdentifier, parseGrantArgs, type GrantAccount, type GrantDb, type GrantTarget } from "./grant-admin";

/** `byLookup`: what findMany returns for an email lookup and for a phone lookup. */
function fakeDb(byLookup: { email?: GrantAccount[]; phone?: GrantAccount[] } | GrantAccount[]) {
  const updates: unknown[] = [];
  const audits: unknown[] = [];
  const findMany = vi.fn(async (args: { where: Record<string, unknown> }) => {
    if (Array.isArray(byLookup)) return byLookup;
    return ("email" in args.where ? byLookup.email : byLookup.phone) ?? [];
  });
  const db: GrantDb = {
    user: { findMany },
    $transaction: async (fn) =>
      fn({
        user: { update: async (args) => void updates.push(args) },
        auditLog: { create: async (args) => void audits.push(args) },
      }),
  };
  return { db, updates, audits, findMany };
}

const account = (over: Partial<GrantAccount> = {}): GrantAccount => ({
  id: "u1",
  role: "USER",
  isDemo: false,
  status: "ACTIVE",
  twoFactorEnabled: false,
  email: "someone@example.com",
  ...over,
});

const EMAIL: GrantTarget = { kind: "email", value: "someone@example.com" };
const PHONE: GrantTarget = { kind: "phone", value: "+995555123456", raw: "+995555123456" };

describe("parseGrantArgs", () => {
  it("reads --email and --phone (also with =)", () => {
    expect(parseGrantArgs(["--email", "Someone@Example.com"])).toEqual({ ok: true, targets: [EMAIL], fromEnv: false, skipped: [] });
    expect(parseGrantArgs(["--email=someone@example.com"])).toMatchObject({ ok: true, targets: [EMAIL] });
    expect(parseGrantArgs(["--phone", "+972 053-123-4567"])).toEqual({
      ok: true,
      targets: [{ kind: "phone", value: "+972531234567", raw: "+972 053-123-4567" }],
      fromEnv: false,
      skipped: [],
    });
  });

  it("--from-env tries BAYIT_ADMIN_EMAIL first, then BAYIT_ADMIN_PHONE", () => {
    expect(parseGrantArgs(["--from-env"], { BAYIT_ADMIN_EMAIL: "someone@example.com", BAYIT_ADMIN_PHONE: "+995 555 12 34 56" })).toEqual({
      ok: true,
      targets: [EMAIL, { kind: "phone", value: "+995555123456", raw: "+995 555 12 34 56" }],
      fromEnv: true,
      skipped: [],
    });
    expect(parseGrantArgs(["--from-env"], { BAYIT_ADMIN_PHONE: "+995555123456" })).toMatchObject({ ok: true, targets: [PHONE] });
  });

  it("--from-env with nothing set is not an error (nothing to do)", () => {
    expect(parseGrantArgs(["--from-env"], {})).toEqual({ ok: true, targets: [], fromEnv: true, skipped: [] });
    expect(parseGrantArgs(["--from-env"], { BAYIT_ADMIN_EMAIL: "  ", BAYIT_ADMIN_PHONE: "" })).toMatchObject({ ok: true, targets: [] });
  });

  it("--from-env names a malformed setting without its value", () => {
    expect(parseGrantArgs(["--from-env"], { BAYIT_ADMIN_EMAIL: "nope", BAYIT_ADMIN_PHONE: "12" })).toEqual({
      ok: true,
      targets: [],
      fromEnv: true,
      skipped: ["BAYIT_ADMIN_EMAIL", "BAYIT_ADMIN_PHONE"],
    });
  });

  it("never reads the settings without --from-env", () => {
    expect(parseGrantArgs([], { BAYIT_ADMIN_EMAIL: "someone@example.com" }).ok).toBe(false);
  });

  it("refuses missing, doubled, unknown and malformed input", () => {
    expect(parseGrantArgs([]).ok).toBe(false);
    expect(parseGrantArgs(["--email"]).ok).toBe(false);
    expect(parseGrantArgs(["--email", "a@example.com", "--phone", "+995555123456"]).ok).toBe(false);
    expect(parseGrantArgs(["--email", "a@example.com", "--from-env"]).ok).toBe(false);
    expect(parseGrantArgs(["--from-env=1"]).ok).toBe(false);
    expect(parseGrantArgs(["--role", "ADMIN"]).ok).toBe(false);
    expect(parseGrantArgs(["--email", "not-an-email"]).ok).toBe(false);
    expect(parseGrantArgs(["--phone", "12"]).ok).toBe(false);
    expect(parseGrantArgs(["--help"])).toEqual({ ok: false, error: "help" });
  });
});

describe("maskIdentifier", () => {
  it("never shows the full email or phone", () => {
    expect(maskIdentifier(EMAIL)).toBe("s•••@e•••.com");
    expect(maskIdentifier({ kind: "email", value: "a@b.co.il" })).toBe("a•••@b•••.il");
    const phone = maskIdentifier({ kind: "phone", value: "+972531234567", raw: "" });
    expect(phone.startsWith("+972")).toBe(true);
    expect(phone.endsWith("67")).toBe(true);
    expect(phone).not.toContain("531234");
  });
});

describe("grantAdmin", () => {
  it("grants ADMIN and writes the audit row in the same transaction", async () => {
    const { db, updates, audits } = fakeDb([account()]);
    const outcome = await grantAdmin(db, EMAIL);
    expect(outcome).toEqual({ status: "granted", userId: "u1", previousRole: "USER", twoFactorEnabled: false, placeholderEmail: false, target: EMAIL });
    expect(updates).toEqual([{ where: { id: "u1" }, data: { role: "ADMIN" } }]);
    expect(audits).toEqual([
      {
        data: {
          actorId: null,
          action: "user.role_change",
          targetType: "User",
          targetId: "u1",
          details: { from: "USER", to: "ADMIN", via: "script", lookup: "email" },
        },
      },
    ]);
    const text = grantMessage(outcome).lines.join("\n");
    expect(text).toContain("2-step login is REQUIRED");
    // Only the masked identifier: no email, no account id.
    expect(text).toContain("s•••@e•••.com");
    expect(text).not.toContain("someone@example.com");
    expect(text).not.toContain("u1");
  });

  it("looks a phone up by its international form and as typed", async () => {
    const { db, findMany } = fakeDb([account()]);
    await grantAdmin(db, { kind: "phone", value: "+972531234567", raw: "+9720531234567" });
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { phoneNumber: { in: ["+972531234567", "+9720531234567"] } } }));
  });

  it("uses the phone only when no account has the email", async () => {
    const { db, findMany, updates } = fakeDb({ email: [], phone: [account({ id: "u-phone" })] });
    const outcome = await grantAdmin(db, [EMAIL, PHONE]);
    expect(outcome).toMatchObject({ status: "granted", userId: "u-phone", target: PHONE });
    expect(findMany).toHaveBeenCalledTimes(2);
    expect(updates).toEqual([{ where: { id: "u-phone" }, data: { role: "ADMIN" } }]);

    const both = fakeDb({ email: [account({ id: "u-email" })], phone: [account({ id: "u-phone" })] });
    expect(await grantAdmin(both.db, [EMAIL, PHONE])).toMatchObject({ status: "granted", userId: "u-email" });
    expect(both.findMany).toHaveBeenCalledTimes(1);
  });

  it("refuses demo accounts", async () => {
    const { db, updates, audits } = fakeDb([account({ isDemo: true })]);
    const outcome = await grantAdmin(db, { kind: "email", value: "demo@example.com" });
    expect(outcome).toMatchObject({ status: "demo_account" });
    expect(updates).toEqual([]);
    expect(audits).toEqual([]);
    expect(grantMessage(outcome).ok).toBe(false);
    // Refusals are printed even with --from-env.
    expect(grantMessage(outcome, { quiet: true }).lines.join("")).toContain("demo account");
  });

  it("refuses banned or deleted accounts, unknown and ambiguous ones", async () => {
    expect(await grantAdmin(fakeDb([account({ status: "BANNED" })]).db, EMAIL)).toMatchObject({
      status: "blocked_account",
      accountStatus: "BANNED",
    });
    expect(await grantAdmin(fakeDb([]).db, EMAIL)).toEqual({ status: "not_found" });
    expect(await grantAdmin(fakeDb([account(), account({ id: "u2" })]).db, PHONE)).toMatchObject({ status: "ambiguous", count: 2 });
  });

  it("changes nothing for an existing admin, and warns about a phone-only account", async () => {
    const { db, updates } = fakeDb([account({ role: "ADMIN", email: "995555123456@phone.bayit.invalid" })]);
    const outcome = await grantAdmin(db, PHONE);
    expect(outcome).toMatchObject({ status: "already_admin", placeholderEmail: true });
    expect(updates).toEqual([]);
    expect(grantMessage(outcome).lines.join("\n")).toContain("no real email address");
  });

  it("--from-env stays quiet for a missing account and a ready admin, but reminds about 2-step login", async () => {
    expect(grantMessage({ status: "not_found" }, { quiet: true })).toEqual({ ok: true, lines: [] });
    expect(grantMessage({ status: "not_found" }).ok).toBe(false);
    const ready = await grantAdmin(fakeDb([account({ role: "ADMIN", twoFactorEnabled: true })]).db, EMAIL);
    expect(grantMessage(ready, { quiet: true })).toEqual({ ok: true, lines: [] });
    const noCode = await grantAdmin(fakeDb([account({ role: "ADMIN", twoFactorEnabled: false })]).db, EMAIL);
    expect(grantMessage(noCode, { quiet: true }).lines.join("\n")).toContain("2-step login is REQUIRED");
  });
});
