import { describe, expect, it, vi } from "vitest";
import { grantAdmin, grantMessage, parseGrantArgs, type GrantAccount, type GrantDb } from "./grant-admin";

function fakeDb(accounts: GrantAccount[]) {
  const updates: unknown[] = [];
  const audits: unknown[] = [];
  const findMany = vi.fn(async () => accounts);
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

describe("parseGrantArgs", () => {
  it("reads --email and --phone (also with =)", () => {
    expect(parseGrantArgs(["--email", "Someone@Example.com"])).toEqual({ ok: true, target: { kind: "email", value: "someone@example.com" } });
    expect(parseGrantArgs(["--email=someone@example.com"])).toEqual({ ok: true, target: { kind: "email", value: "someone@example.com" } });
    expect(parseGrantArgs(["--phone", "+972 053-123-4567"])).toEqual({
      ok: true,
      target: { kind: "phone", value: "+972531234567", raw: "+972 053-123-4567" },
    });
  });

  it("falls back to BAYIT_ADMIN_EMAIL, then BAYIT_ADMIN_PHONE", () => {
    expect(parseGrantArgs([], { BAYIT_ADMIN_EMAIL: "a@example.com", BAYIT_ADMIN_PHONE: "+995555123456" })).toMatchObject({
      ok: true,
      target: { kind: "email", value: "a@example.com" },
    });
    expect(parseGrantArgs([], { BAYIT_ADMIN_PHONE: "+995555123456" })).toMatchObject({ ok: true, target: { kind: "phone", value: "+995555123456" } });
  });

  it("refuses missing, doubled, unknown and malformed input", () => {
    expect(parseGrantArgs([]).ok).toBe(false);
    expect(parseGrantArgs(["--email"]).ok).toBe(false);
    expect(parseGrantArgs(["--email", "a@example.com", "--phone", "+995555123456"]).ok).toBe(false);
    expect(parseGrantArgs(["--role", "ADMIN"]).ok).toBe(false);
    expect(parseGrantArgs(["--email", "not-an-email"]).ok).toBe(false);
    expect(parseGrantArgs(["--phone", "12"]).ok).toBe(false);
    expect(parseGrantArgs(["--help"])).toEqual({ ok: false, error: "help" });
  });
});

describe("grantAdmin", () => {
  it("grants ADMIN and writes the audit row in the same transaction", async () => {
    const { db, updates, audits } = fakeDb([account()]);
    const outcome = await grantAdmin(db, { kind: "email", value: "someone@example.com" });
    expect(outcome).toEqual({ status: "granted", userId: "u1", previousRole: "USER", twoFactorEnabled: false, placeholderEmail: false });
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
    expect(grantMessage(outcome).lines.join("\n")).toContain("2-step login is REQUIRED");
  });

  it("looks a phone up by its international form and as typed", async () => {
    const { db, findMany } = fakeDb([account()]);
    await grantAdmin(db, { kind: "phone", value: "+972531234567", raw: "+9720531234567" });
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { phoneNumber: { in: ["+972531234567", "+9720531234567"] } } }));
  });

  it("refuses demo accounts", async () => {
    const { db, updates, audits } = fakeDb([account({ isDemo: true })]);
    expect(await grantAdmin(db, { kind: "email", value: "demo@example.com" })).toEqual({ status: "demo_account" });
    expect(updates).toEqual([]);
    expect(audits).toEqual([]);
  });

  it("refuses banned or deleted accounts, unknown and ambiguous ones", async () => {
    expect(await grantAdmin(fakeDb([account({ status: "BANNED" })]).db, { kind: "email", value: "x@example.com" })).toEqual({
      status: "blocked_account",
      accountStatus: "BANNED",
    });
    expect(await grantAdmin(fakeDb([]).db, { kind: "email", value: "x@example.com" })).toEqual({ status: "not_found" });
    expect(await grantAdmin(fakeDb([account(), account({ id: "u2" })]).db, { kind: "phone", value: "+995555123456", raw: "+995555123456" })).toEqual({
      status: "ambiguous",
      count: 2,
    });
  });

  it("changes nothing for an existing admin, and warns about a phone-only account", async () => {
    const { db, updates } = fakeDb([account({ role: "ADMIN", email: "995555123456@phone.bayit.invalid" })]);
    const outcome = await grantAdmin(db, { kind: "phone", value: "+995555123456", raw: "+995555123456" });
    expect(outcome).toMatchObject({ status: "already_admin", placeholderEmail: true });
    expect(updates).toEqual([]);
    expect(grantMessage(outcome).lines.join("\n")).toContain("no real email address");
  });
});
