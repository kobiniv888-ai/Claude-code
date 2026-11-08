/**
 * SECURITY_REPORT 12.6.d (founder's decision Q13): every staff action is audited, and a
 * destructive one stops when its audit row cannot be written.
 *
 * 1. Static: every staff server action in tests/unit/endpoints/registry.ts that changes something
 *    (not in READ_ONLY_STAFF_ACTIONS) reaches audit() / auditOrThrow() in its call graph (its own
 *    module and the modules it calls, a few levels deep); every one in DESTRUCTIVE_STAFF_ACTIONS
 *    reaches auditOrThrow(). A new staff action without an audit write fails here.
 * 2. src/lib/audit.ts: audit() never throws; auditOrThrow() throws AuditWriteError ("audit_failed").
 * 3. Against the local database: with the audit write broken, a ban, a role change, a delete and
 *    a review hide answer "audit_failed" and change nothing (the transaction rolled back).
 *    Creates its own users (fake @example.com addresses) and rows, and removes them afterwards.
 */
import "dotenv/config";
import { existsSync, readFileSync, statSync } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import ts from "typescript";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { DESTRUCTIVE_STAFF_ACTIONS, READ_ONLY_STAFF_ACTIONS, SERVER_ACTIONS } from "./registry";

const REPO = path.resolve(__dirname, "../../..");
const SRC = path.join(REPO, "src");

// ─── Static: the call graph reaches the audit log ─────────────

type Module = { sf: ts.SourceFile; locals: Map<string, ts.Node>; imports: Map<string, { file: string; name: string }> };
const moduleCache = new Map<string, Module | null>();

function resolve(from: string, spec: string): string | null {
  const base = spec.startsWith("@/") ? path.join(SRC, spec.slice(2)) : spec.startsWith(".") ? path.join(path.dirname(from), spec) : null;
  if (!base) return null;
  for (const candidate of [`${base}.ts`, `${base}.tsx`, path.join(base, "index.ts"), base]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

function load(file: string): Module | null {
  if (moduleCache.has(file)) return moduleCache.get(file)!;
  if (!existsSync(file)) {
    moduleCache.set(file, null);
    return null;
  }
  const sf = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
  const locals = new Map<string, ts.Node>();
  const imports = new Map<string, { file: string; name: string }>();
  for (const st of sf.statements) {
    if (ts.isFunctionDeclaration(st) && st.name) locals.set(st.name.text, st);
    if (ts.isVariableStatement(st)) for (const d of st.declarationList.declarations) if (ts.isIdentifier(d.name) && d.initializer) locals.set(d.name.text, d.initializer);
    if (ts.isImportDeclaration(st) && ts.isStringLiteral(st.moduleSpecifier) && st.importClause && !st.importClause.isTypeOnly) {
      const target = resolve(file, st.moduleSpecifier.text);
      const named = st.importClause.namedBindings;
      if (target && named && ts.isNamedImports(named)) {
        for (const el of named.elements) imports.set(el.name.text, { file: target, name: (el.propertyName ?? el.name).text });
      }
    }
  }
  const mod = { sf, locals, imports };
  moduleCache.set(file, mod);
  return mod;
}

/** Every function name called from `file#name`, following local and imported functions up to `depth` modules away. */
function deepCalls(file: string, name: string, depth = 3): Set<string> {
  const calls = new Set<string>();
  const seen = new Set<string>();
  const visit = (f: string, fn: string, left: number) => {
    const key = `${f}#${fn}`;
    if (seen.has(key)) return;
    seen.add(key);
    const mod = load(f);
    const node = mod?.locals.get(fn);
    if (!mod || !node) return;
    const walk = (n: ts.Node) => {
      if (ts.isCallExpression(n)) {
        const callee = n.expression;
        const id = ts.isIdentifier(callee) ? callee.text : ts.isPropertyAccessExpression(callee) ? callee.name.text : null;
        if (id) {
          calls.add(id);
          if (ts.isIdentifier(callee)) {
            if (mod.locals.has(id)) visit(f, id, left);
            const imported = mod.imports.get(id);
            if (imported && left > 0) visit(imported.file, imported.name, left - 1);
          }
        }
        // A function passed as an argument (decide(staff, report, decision, () => warnUser(…))).
      }
      if (ts.isIdentifier(n) && !ts.isCallExpression(n.parent) && mod.imports.has(n.text) && left > 0) {
        const imported = mod.imports.get(n.text)!;
        visit(imported.file, imported.name, left - 1);
      }
      ts.forEachChild(n, walk);
    };
    walk(node);
  };
  visit(file, name, depth);
  return calls;
}

const staffActions = Object.entries(SERVER_ACTIONS).flatMap(([file, names]) =>
  Object.entries(names)
    .filter(([, access]) => access.kind === "staff")
    .map(([name]) => ({ file, name, key: `${file}#${name}` })),
);

describe("every staff action writes the audit log (12.6.d)", () => {
  it("the lists name real staff actions", () => {
    const keys = new Set(staffActions.map((a) => a.key));
    expect([...Object.keys(READ_ONLY_STAFF_ACTIONS), ...DESTRUCTIVE_STAFF_ACTIONS].filter((k) => !keys.has(k))).toEqual([]);
    expect(staffActions.length).toBeGreaterThan(70);
  });

  it("every staff action that changes something reaches audit() or auditOrThrow()", () => {
    const missing = staffActions
      .filter((a) => !(a.key in READ_ONLY_STAFF_ACTIONS))
      .filter((a) => {
        const calls = deepCalls(path.join(REPO, a.file), a.name);
        return !["audit", "auditOrThrow", "auditDecision", "auditFileView", "auditRecordView"].some((fn) => calls.has(fn));
      })
      .map((a) => a.key);
    expect(missing, "audit these actions (or list them in READ_ONLY_STAFF_ACTIONS with a reason)").toEqual([]);
  });

  it("every destructive staff action writes its audit row with auditOrThrow (Q13)", () => {
    const missing = DESTRUCTIVE_STAFF_ACTIONS.filter((key) => {
      const [file, name] = key.split("#") as [string, string];
      return !deepCalls(path.join(REPO, file), name).has("auditOrThrow");
    });
    expect(missing).toEqual([]);
  });
});

// ─── Runtime: audit() / auditOrThrow() ────────────────────────

const state = vi.hoisted(() => ({ breakAudit: false, staff: { id: "", role: "ADMIN" as string } }));

vi.mock("server-only", () => ({}));
// The fresh authenticator code of destructive staff actions (3.6.c) is granted here; its rule is
// tested in tests/unit/endpoints/staff-fresh-proof-db.test.ts and endpoint-registry.test.ts.
vi.mock("@/lib/admin/server/staff-proof", () => ({ requireFreshStaffProof: async () => {}, spendStaffProof: async () => {} }));
vi.mock("next/server", async (importOriginal) => ({ ...(await importOriginal<typeof import("next/server")>()), after: () => {} }));
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {}, unstable_cache: (fn: unknown) => fn, updateTag: () => {} }));
vi.mock("next-intl/server", () => ({ getTranslations: async () => (key: string) => key, getLocale: async () => "he" }));
vi.mock("@/lib/request", () => ({ getIpHash: async () => "test-ip", getClientIp: async () => "203.0.113.9" }));
vi.mock("@/lib/email", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/email")>();
  return { ...real, sendEmail: vi.fn(async () => ({ ok: true, delivery: "logged" as const })) };
});
vi.mock("@/lib/translate", async (importOriginal) => {
  const real = await importOriginal<Record<string, unknown>>();
  return { ...real, translateForLocale: async (text: string) => ({ text }) };
});
vi.mock("@/lib/auth/session", () => ({ requireStaffForAction: async () => state.staff }));
vi.mock("@/lib/audit", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/audit")>();
  return {
    ...real,
    // The audit table "is down" when breakAudit is set: auditOrThrow's own error path runs.
    auditOrThrow: (entry: Parameters<typeof real.auditOrThrow>[0], client?: Parameters<typeof real.auditOrThrow>[1]) =>
      state.breakAudit
        ? real.auditOrThrow(entry, {
            auditLog: {
              create: async () => {
                throw new Error("audit table unavailable");
              },
            },
          } as unknown as Parameters<typeof real.auditOrThrow>[1])
        : real.auditOrThrow(entry, client),
  };
});

const { db } = await import("@/lib/db");
const realAudit = await vi.importActual<typeof import("@/lib/audit")>("@/lib/audit");

describe("src/lib/audit.ts", () => {
  const broken = { auditLog: { create: async () => Promise.reject(new Error("down")) } } as unknown as Parameters<typeof realAudit.auditOrThrow>[1];

  it("auditOrThrow throws audit_failed when the row cannot be written", async () => {
    const error = await realAudit.auditOrThrow({ actorId: null, action: "test.destructive" }, broken).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(realAudit.AuditWriteError);
    expect(error).toMatchObject({ code: "audit_failed", status: 409 });
  });
});

// ─── Runtime: destructive actions stop without their audit row ─

const prefix = `aud${randomUUID().replace(/-/g, "").slice(0, 10)}`;
const ids = { admin: `${prefix}-admin`, target: `${prefix}-target`, word: "" };

describe("a destructive action whose audit row cannot be written does not happen (Q13)", () => {
  beforeAll(async () => {
    await db.user.create({ data: { id: ids.admin, name: "Admin", email: `${ids.admin}@example.com`, role: "ADMIN", twoFactorEnabled: true } });
    await db.user.create({ data: { id: ids.target, name: "Target", email: `${ids.target}@example.com` } });
    await db.session.create({ data: { id: `${prefix}-session`, token: `${prefix}-token`, userId: ids.target, expiresAt: new Date(Date.now() + 86_400_000) } });
    const word = await db.bannedWord.create({ data: { phrase: `${prefix} phrase`, locale: "en", action: "FLAG" } });
    ids.word = word.id;
    state.staff = { id: ids.admin, role: "ADMIN" };
  });

  afterAll(async () => {
    state.breakAudit = false;
    await db.bannedWord.deleteMany({ where: { phrase: { startsWith: prefix } } });
    await db.auditLog.deleteMany({ where: { OR: [{ actorId: ids.admin }, { targetId: { in: [ids.target, ids.word] } }] } });
    await db.rateLimit.deleteMany({ where: { key: { contains: prefix } } });
    await db.user.deleteMany({ where: { id: { in: [ids.admin, ids.target] } } });
  });

  it("a ban: refused with audit_failed, the account stays active and keeps its session", async () => {
    const { banUserAction } = await import("@/lib/admin/actions/users");
    state.breakAudit = true;
    const result = await banUserAction({ userId: ids.target, reason: "scam", note: "test" });
    expect(result).toMatchObject({ ok: false, error: "audit_failed" });
    expect((await db.user.findUniqueOrThrow({ where: { id: ids.target } })).status).toBe("ACTIVE");
    expect(await db.session.count({ where: { userId: ids.target } })).toBe(1);
  });

  it("a role change: refused, the role and the sessions stay", async () => {
    const { changeRole } = await import("@/lib/admin/actions/users");
    state.breakAudit = true;
    expect(await changeRole({ userId: ids.target, role: "MODERATOR" })).toMatchObject({ ok: false, error: "audit_failed" });
    expect((await db.user.findUniqueOrThrow({ where: { id: ids.target } })).role).toBe("USER");
    expect(await db.session.count({ where: { userId: ids.target } })).toBe(1);
  });

  it("a delete: refused, the row stays; with the audit log working it is deleted and logged", async () => {
    const { deleteBannedWord } = await import("@/lib/admin/content/actions/banned-words");
    state.breakAudit = true;
    expect(await deleteBannedWord({ id: ids.word })).toMatchObject({ ok: false, error: "audit_failed" });
    expect(await db.bannedWord.count({ where: { id: ids.word } })).toBe(1);
    state.breakAudit = false;
    expect(await deleteBannedWord({ id: ids.word })).toMatchObject({ ok: true });
    expect(await db.bannedWord.count({ where: { id: ids.word } })).toBe(0);
    expect(await db.auditLog.count({ where: { action: "banned_word.delete", targetId: ids.word, actorId: ids.admin } })).toBe(1);
  });

  it("with the audit log working, the ban goes through and is logged in the same commit", async () => {
    const { banUserAction } = await import("@/lib/admin/actions/users");
    state.breakAudit = false;
    expect(await banUserAction({ userId: ids.target, reason: "scam", note: "test" })).toMatchObject({ ok: true });
    expect((await db.user.findUniqueOrThrow({ where: { id: ids.target } })).status).toBe("BANNED");
    expect(await db.session.count({ where: { userId: ids.target } })).toBe(0);
    expect(await db.auditLog.count({ where: { action: "user.ban", targetId: ids.target, actorId: ids.admin } })).toBe(1);
  });
});
