/**
 * SECURITY_REPORT 4.8.a/b, 12.6.a, 4.2.a: every endpoint has a permission rule, the code carries
 * it, and it holds when the endpoint is called directly.
 *
 * 1. Walks src/ for every server action ("use server" module exports) and every route handler
 *    (route.ts HTTP methods) and compares them with tests/unit/endpoints/registry.ts: a new
 *    endpoint without a rule fails here, and so does a rule for an endpoint that is gone.
 * 2. Reads each endpoint's source (its body and the module's own functions it calls) and checks
 *    the guard its rule asks for (see registry.ts).
 * 3. Calls every staff endpoint for real as each staff role, as a regular account, signed out and
 *    with the 2-step code still pending; and every signed-in endpoint signed out and 2-step
 *    pending. A role without the permission is refused ("forbidden") before the database is
 *    touched; signed out and 2-step pending get "auth_required". The real session and staff
 *    rules run (src/lib/auth/session.ts, staff-access.ts); only the Better Auth cookie check, the
 *    request headers, the rate-limit store and the database are replaced.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { can, STAFF_ROLES } from "@/lib/auth/permissions";
import { FRESH_PROOF_STAFF_ACTIONS, ROUTE_HANDLERS, SERVER_ACTIONS, SESSION_HELPERS_WITHOUT_2FA, UNGUARDED_LAYOUTS, type Access } from "./registry";

const REPO = path.resolve(__dirname, "../../..");
const SRC = path.join(REPO, "src");
const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"] as const;

// ─── Static: discovery and guards ─────────────────────────────

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry !== "generated") sourceFiles(full, out);
    } else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

const rel = (file: string) => path.relative(REPO, file).split(path.sep).join("/");
const isUseServer = (text: string) => /^\s*(?:\/\/[^\n]*\n\s*|\/\*[\s\S]*?\*\/\s*)*["']use server["']/.test(text);

type Endpoint = { file: string; name: string; node: ts.Node | null; sf: ts.SourceFile; text: string };

function parse(file: string) {
  const text = readFileSync(file, "utf8");
  return { text, sf: ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true) };
}

function isExported(node: ts.Node): boolean {
  return (ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) ?? false;
}

/** The module's exports: functions, consts (and `export const { GET, POST } = …`). */
function exportsOf(file: string): Endpoint[] {
  const { text, sf } = parse(file);
  const found: Endpoint[] = [];
  for (const st of sf.statements) {
    if (ts.isExportAssignment(st) && !st.isExportEquals) found.push({ file, name: "default", node: st.expression, sf, text });
    if (!isExported(st)) continue;
    const isDefault = (ts.canHaveModifiers(st) ? ts.getModifiers(st) : undefined)?.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword) ?? false;
    if (ts.isFunctionDeclaration(st) && isDefault) found.push({ file, name: "default", node: st, sf, text });
    else if (ts.isFunctionDeclaration(st) && st.name) found.push({ file, name: st.name.text, node: st, sf, text });
    if (ts.isVariableStatement(st)) {
      for (const decl of st.declarationList.declarations) {
        if (ts.isIdentifier(decl.name)) found.push({ file, name: decl.name.text, node: decl.initializer ?? null, sf, text });
        else if (ts.isObjectBindingPattern(decl.name)) {
          for (const el of decl.name.elements) if (ts.isIdentifier(el.name)) found.push({ file, name: el.name.text, node: decl.initializer ?? null, sf, text });
        }
      }
    }
  }
  return found;
}

/**
 * Every call made by the endpoint, following the module's own functions (one module deep), and
 * the source text of what it reaches (the endpoint and those functions, not the whole file: one
 * 2-step check elsewhere in the module does not clear this endpoint).
 */
function reach(endpoint: Endpoint): { calls: string[]; text: string } {
  const locals = new Map<string, ts.Node>();
  for (const st of endpoint.sf.statements) {
    if (ts.isFunctionDeclaration(st) && st.name) locals.set(st.name.text, st);
    if (ts.isVariableStatement(st)) for (const d of st.declarationList.declarations) if (ts.isIdentifier(d.name) && d.initializer) locals.set(d.name.text, d.initializer);
  }
  const seen = new Set<ts.Node>();
  const calls: string[] = [];
  const texts: string[] = [];
  const visit = (node: ts.Node | null | undefined) => {
    if (!node || seen.has(node)) return;
    seen.add(node);
    texts.push(node.getText(endpoint.sf));
    const walk = (n: ts.Node) => {
      if (ts.isCallExpression(n)) {
        const first = n.arguments[0];
        const callee = n.expression.getText(endpoint.sf);
        calls.push(first && ts.isStringLiteralLike(first) ? `${callee}("${first.text}")` : callee);
        if (ts.isIdentifier(n.expression) && locals.has(n.expression.text)) visit(locals.get(n.expression.text));
      }
      ts.forEachChild(n, walk);
    };
    walk(node);
  };
  visit(endpoint.node);
  return { calls, text: texts.join("\n") };
}


const actionModules = sourceFiles(SRC).filter((file) => isUseServer(readFileSync(file, "utf8")));
const routeFiles = sourceFiles(path.join(SRC, "app")).filter((file) => /\/route\.tsx?$/.test(file));
/** Metadata routes answer GET requests too: share images, icons, sitemap, robots, manifest. */
const isMetadataRoute = (file: string) =>
  /\/(opengraph-image|twitter-image|icon|apple-icon)\.tsx?$/.test(file) || /^src\/app\/(sitemap|robots|manifest)\.ts$/.test(rel(file));
const metadataFiles = sourceFiles(path.join(SRC, "app")).filter(isMetadataRoute);
const actions = actionModules.flatMap(exportsOf);
const routes = [
  ...routeFiles.flatMap((file) => exportsOf(file).filter((e) => (HTTP_METHODS as readonly string[]).includes(e.name))),
  ...metadataFiles.flatMap((file) => exportsOf(file).filter((e) => e.name === "default")),
];

/**
 * Helpers in src/lib that read the session (they call getCurrentUser()), with whether they treat a
 * 2-step-pending session as signed out themselves. An endpoint calling one reads the session too.
 */
const SESSION_MODULE = "src/lib/auth/session.ts";
const RATE_LIMIT = /(^|\.)(assertRateLimit|assertRateLimitByIp|rateLimit|rateLimitByIp|assertTurnstile)\b/;
const sessionHelpers = new Map<string, { file: string; checksTwoFactor: boolean }[]>();
/** Helpers in src/lib that apply a rate limit themselves (e.g. sendSecurityCodeWithLimits): name → every same-named export does. */
const rateLimitHelpers = new Map<string, boolean>();
for (const file of sourceFiles(path.join(SRC, "lib"))) {
  if (actionModules.includes(file)) continue;
  for (const helper of exportsOf(file)) {
    const { calls, text } = reach(helper);
    if (rel(file) !== "src/lib/rate-limit.ts") {
      const limits = calls.some((c) => RATE_LIMIT.test(c));
      rateLimitHelpers.set(helper.name, (rateLimitHelpers.get(helper.name) ?? true) && limits);
    }
    if (rel(file) === SESSION_MODULE || !calls.some((c) => /(^|\.)getCurrentUser$/.test(c))) continue;
    const list = sessionHelpers.get(helper.name) ?? [];
    list.push({ file: rel(file), checksTwoFactor: /twoFactorVerified/.test(text) });
    sessionHelpers.set(helper.name, list);
  }
}

function ruleFor(endpoint: Endpoint, table: Record<string, Record<string, Access>>): Access | undefined {
  return table[rel(endpoint.file)]?.[endpoint.name];
}

const has = (calls: string[], pattern: RegExp) =>
  calls.some((c) => pattern.test(c) || (pattern === RATE_LIMIT && rateLimitHelpers.get(c.replace(/\(.*$/, "").replace(/^.*\./, "")) === true));

/** The guard problems of one endpoint (empty = fine). */
function guardProblems(endpoint: Endpoint, access: Access): string[] {
  const { calls, text } = reach(endpoint);
  const problems: string[] = [];
  const helpers = calls.flatMap((c) => sessionHelpers.get(c.replace(/^.*\./, "")) ?? []);
  const readsSessionItself = has(calls, /(^|\.)getCurrentUser$/) || has(calls, /getCurrentUser\(\)/);
  const usesSession = readsSessionItself || helpers.length > 0;
  // Its own code, or every helper it uses, counts a 2-step-pending session as signed out.
  const checksTwoFactor = /twoFactorVerified/.test(text) || (!readsSessionItself && helpers.length > 0 && helpers.every((h) => h.checksTwoFactor));
  switch (access.kind) {
    case "staff": {
      const p = access.permission.replace(/\./g, "\\.");
      if (!has(calls, new RegExp(`^(runStaffAction|runContentAction|requireStaffForAction|requireStaff)(<[^>]*>)?\\("${p}"\\)$`))) {
        problems.push(`needs runStaffAction / runContentAction / requireStaffForAction("${access.permission}")`);
      }
      if (access.adminOnly && !has(calls, /^can[A-Z]\w*$/)) problems.push("adminOnly: needs its ADMIN check (canRevealReporter, canSetVisited…)");
      break;
    }
    case "user":
      if (!has(calls, /^(requireUserForAction|requireUser)$/) && !(usesSession && checksTwoFactor)) {
        problems.push("needs requireUserForAction() (or getCurrentUser() with a twoFactorVerified check)");
      }
      break;
    case "pending2fa":
      if (!usesSession) problems.push("reads the session with getCurrentUser()");
      if (!access.noRateLimit && !has(calls, RATE_LIMIT)) problems.push("needs a rate limit");
      break;
    case "public":
      if (!access.noRateLimit && !has(calls, RATE_LIMIT)) problems.push("is open to everyone: needs a rate limit (or noRateLimit with a reason)");
      if (usesSession && !checksTwoFactor) problems.push("reads the session: a 2-step-pending session must count as signed out (twoFactorVerified)");
      break;
    case "token":
      if (!has(calls, RATE_LIMIT) && !/rateLimit/.test(text)) problems.push("a token endpoint needs a rate limit");
      break;
    case "cron":
      if (!has(calls, /^isAuthorizedCron$/)) problems.push("needs isAuthorizedCron(request)");
      break;
    case "webhook":
      if (!has(calls, /^verify\w*(Signature|Secret)$/)) problems.push("needs the provider's signature check");
      break;
    case "dev":
      if (!has(calls, /^codeDisplayForHeaders$/)) problems.push("needs the test-mode host check (codeDisplayForHeaders)");
      break;
    case "auth":
      if (!/toNextJsHandler\(auth\)/.test(text)) problems.push("only Better Auth's own handler");
      break;
  }
  // Route handlers: getCurrentUser() alone lets a 2-step-pending session through (4.2.a).
  if (rel(endpoint.file).startsWith("src/app/") && usesSession && !checksTwoFactor && access.kind !== "pending2fa") {
    problems.push("route handler reads getCurrentUser() without a twoFactorVerified check");
  }
  return problems;
}

describe("the endpoint registry covers every endpoint (4.8.b)", () => {
  it("finds the server actions and route handlers", () => {
    expect(actionModules.length).toBeGreaterThan(40);
    expect(actions.length).toBeGreaterThan(150);
    expect(routes.length).toBeGreaterThan(30);
  });

  it("every server action has a rule, and every rule names an existing action", () => {
    const missing = actions.filter((e) => !ruleFor(e, SERVER_ACTIONS)).map((e) => `${rel(e.file)}#${e.name}`);
    expect(missing, "add these to tests/unit/endpoints/registry.ts SERVER_ACTIONS").toEqual([]);
    const existing = new Set(actions.map((e) => `${rel(e.file)}#${e.name}`));
    const stale = Object.entries(SERVER_ACTIONS).flatMap(([file, names]) => Object.keys(names).map((name) => `${file}#${name}`)).filter((key) => !existing.has(key));
    expect(stale, "remove these from the registry (or fix the name)").toEqual([]);
  });

  it("every route handler has a rule, and every rule names an existing handler", () => {
    const missing = routes.filter((e) => !ruleFor(e, ROUTE_HANDLERS)).map((e) => `${rel(e.file)}#${e.name}`);
    expect(missing, "add these to tests/unit/endpoints/registry.ts ROUTE_HANDLERS").toEqual([]);
    const existing = new Set(routes.map((e) => `${rel(e.file)}#${e.name}`));
    const stale = Object.entries(ROUTE_HANDLERS).flatMap(([file, names]) => Object.keys(names).map((name) => `${file}#${name}`)).filter((key) => !existing.has(key));
    expect(stale).toEqual([]);
  });

  it("finds the metadata routes (share images, sitemap, robots, manifest) as GET endpoints", () => {
    const found = routes.filter((e) => e.name === "default").map((e) => rel(e.file));
    expect(found).toEqual(expect.arrayContaining(["src/app/sitemap.ts", "src/app/robots.ts", "src/app/manifest.ts", "src/app/[locale]/(site)/lists/[token]/opengraph-image.tsx"]));
    expect(found.length).toBe(metadataFiles.length);
  });

  it("session helpers in src/lib count a 2-step-pending session as signed out (getSearchContext, getCardContext…)", () => {
    expect([...sessionHelpers.keys()]).toEqual(expect.arrayContaining(["getSearchContext", "getCardContext", "resolveListing"]));
    const problems = [...sessionHelpers.entries()].flatMap(([name, list]) =>
      list.filter((h) => !h.checksTwoFactor && !(`${h.file}#${name}` in SESSION_HELPERS_WITHOUT_2FA)).map((h) => `${h.file}#${name}`),
    );
    expect(problems, "check twoFactorVerified (or list it in SESSION_HELPERS_WITHOUT_2FA with why)").toEqual([]);
    for (const key of Object.keys(SESSION_HELPERS_WITHOUT_2FA)) {
      const [file, name] = key.split("#") as [string, string];
      expect(sessionHelpers.get(name)?.some((h) => h.file === file), `${key} is not a session helper any more`).toBe(true);
    }
  });

  it("every page under /account, /post and /admin calls requireUser / requireStaff itself; layouts too, unless listed", () => {
    const roots = ["src/app/[locale]/(site)/account", "src/app/[locale]/(site)/post", "src/app/[locale]/admin"].map((r) => path.join(REPO, r));
    const files = roots.flatMap((root) => sourceFiles(root)).filter((file) => /\/(page|layout)\.tsx$/.test(file));
    expect(files.length).toBeGreaterThan(60);
    const guard = /\b(requireUser|requireStaff)\(/;
    const problems = files.flatMap((file) => {
      const key = rel(file);
      if (guard.test(readFileSync(file, "utf8"))) return [];
      if (key.endsWith("/layout.tsx") && key in UNGUARDED_LAYOUTS) return [];
      return [key];
    });
    expect(problems, "call requireUser() / requireStaff() in the page (a layout's check does not stop the page from rendering)").toEqual([]);
    for (const key of Object.keys(UNGUARDED_LAYOUTS)) {
      const text = readFileSync(path.join(REPO, key), "utf8");
      // Listed layouts stay thin: no data, no session.
      expect(/@\/lib\/(db|auth|admin|account|booking)\b|getCurrentUser|await /.test(text), `${key} reads data now: give it a guard`).toBe(false);
    }
  });

  it("server action modules export only functions (no value export becomes an endpoint by accident)", () => {
    const notFunctions = actions.filter((e) => e.node && !ts.isFunctionDeclaration(e.node) && !ts.isArrowFunction(e.node) && !ts.isFunctionExpression(e.node));
    expect(notFunctions.map((e) => `${rel(e.file)}#${e.name}`)).toEqual([]);
  });
});

describe("the code carries the guard its rule asks for (4.8.b, 4.2.a)", () => {
  it("server actions", () => {
    const problems = actions.flatMap((e) => {
      const access = ruleFor(e, SERVER_ACTIONS);
      return access ? guardProblems(e, access).map((p) => `${rel(e.file)}#${e.name}: ${p}`) : [];
    });
    expect(problems).toEqual([]);
  });

  it("route handlers", () => {
    const problems = routes.flatMap((e) => {
      const access = ruleFor(e, ROUTE_HANDLERS);
      return access ? guardProblems(e, access).map((p) => `${rel(e.file)}#${e.name}: ${p}`) : [];
    });
    expect(problems).toEqual([]);
  });

  it("destructive staff actions ask for a fresh authenticator code (3.6.c): the listed ones carry freshProof, and only they", () => {
    const byKey = new Map(actions.map((e) => [`${rel(e.file)}#${e.name}`, e]));
    const problems: string[] = [];
    for (const [key, mode] of Object.entries(FRESH_PROOF_STAFF_ACTIONS)) {
      const endpoint = byKey.get(key);
      if (!endpoint?.node) {
        problems.push(`${key}: no such action`);
        continue;
      }
      if (!new RegExp(`freshProof:\\s*"${mode}"`).test(endpoint.node.getText(endpoint.sf))) problems.push(`${key}: needs { freshProof: "${mode}" }`);
    }
    for (const [key, endpoint] of byKey) {
      if (endpoint.node && /freshProof:/.test(endpoint.node.getText(endpoint.sf)) && !(key in FRESH_PROOF_STAFF_ACTIONS)) problems.push(`${key}: list it in FRESH_PROOF_STAFF_ACTIONS`);
    }
    expect(problems).toEqual([]);
    expect(Object.keys(FRESH_PROOF_STAFF_ACTIONS).length).toBeGreaterThanOrEqual(20);
  });

  it("the guard check itself catches a missing guard", () => {
    const fake = (body: string, file = "src/lib/x/actions.ts"): Endpoint => {
      const text = `"use server";\nexport async function x(input: unknown) {\n${body}\n}\n`;
      const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
      return { file: path.join(REPO, file), name: "x", node: sf.statements[1]!, sf, text };
    };
    expect(guardProblems(fake("return db.user.findMany();"), { kind: "user" })).not.toEqual([]);
    expect(guardProblems(fake("const u = await requireUserForAction(); return u;"), { kind: "user" })).toEqual([]);
    expect(guardProblems(fake('return runStaffAction("content", "x", async () => ok());'), { kind: "staff", permission: "moderation" })).not.toEqual([]);
    expect(guardProblems(fake('return runStaffAction("moderation", "x", async () => ok());'), { kind: "staff", permission: "moderation" })).toEqual([]);
    expect(guardProblems(fake("return search(input);"), { kind: "public", why: "test" })).not.toEqual([]);
    expect(guardProblems(fake('const u = await getCurrentUser(); await assertRateLimitByIp("x", L); return u?.id;'), { kind: "public", why: "test" })).not.toEqual([]);
    expect(guardProblems(fake("const u = await getCurrentUser(); return u?.id;", "src/app/api/x/route.ts"), { kind: "user" })).not.toEqual([]);
    // A 2-step check elsewhere in the module does not clear this endpoint (only what it reaches counts).
    const sharedModule = (file: string): Endpoint => {
      const text = `export async function GET() {\n  const u = await getCurrentUser();\n  return Response.json({ id: u?.id });\n}\nexport function other(u: { twoFactorVerified: boolean }) {\n  return u.twoFactorVerified;\n}\n`;
      const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
      return { file: path.join(REPO, file), name: "GET", node: sf.statements[0]!, sf, text };
    };
    expect(guardProblems(sharedModule("src/app/api/x/route.ts"), { kind: "public", why: "test", noRateLimit: "test" })).not.toEqual([]);
    // A helper that reads the session counts as reading it.
    expect(guardProblems(fake("return getSearchContext(input);"), { kind: "public", why: "test", noRateLimit: "test" })).toEqual([]);
    expect(guardProblems(fake("return redirectSignedOutFromSaved(input);", "src/app/api/x/route.ts"), { kind: "public", why: "test", noRateLimit: "test" })).not.toEqual([]);
  });
});

// ─── Dynamic: the rules hold when called directly ─────────────

type FakeUser = Record<string, unknown> & { id: string; role: string; isDemo: boolean; twoFactorEnabled: boolean };

const state = vi.hoisted(() => ({
  user: null as FakeUser | null,
  twoFactorVerifiedAt: null as Date | null,
  host: "bayit.example",
  dbTouched: [] as string[],
}));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ host: state.host, origin: `https://${state.host}`, "x-forwarded-for": "203.0.113.7" }),
  cookies: async () => ({ get: () => undefined, getAll: () => [], set: () => {}, delete: () => {}, has: () => false }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {}, unstable_cache: (fn: unknown) => fn, updateTag: () => {} }));
vi.mock("next/server", async (importOriginal) => {
  const real = await importOriginal<typeof import("next/server")>();
  return { ...real, after: () => {} };
});
vi.mock("next-intl/server", () => ({
  getLocale: async () => "he",
  getTranslations: async () => Object.assign((key: string) => key, { has: () => false, rich: (key: string) => key }),
  setRequestLocale: () => {},
}));
vi.mock("@/i18n/navigation", () => ({
  redirect: () => {
    throw new Error("redirect");
  },
  getPathname: () => "/",
  Link: () => null,
}));
vi.mock("@/lib/monitoring", () => ({ reportError: async () => {} }));
vi.mock("@/lib/auth/staff-session", () => ({ checkStaffSessionIdle: async () => "active", hasStaffCookie: async () => true }));
vi.mock("@/lib/auth/server", () => ({
  auth: { api: { getSession: async () => (state.user ? { session: { id: "session-1", userId: state.user.id }, user: { id: state.user.id } } : null) } },
}));
vi.mock("@/lib/turnstile", () => ({ assertTurnstile: async () => undefined, verifyTurnstile: async () => ({ ok: true }) }));
vi.mock("@/lib/rate-limit", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/rate-limit")>();
  const pass = async () => ({ ok: true, remaining: 100, resetAt: new Date(Date.now() + 60_000) });
  return { ...real, rateLimit: pass, rateLimitByIp: pass, assertRateLimit: pass, assertRateLimitByIp: pass, resetRateLimit: async () => {} };
});
vi.mock("@/lib/db", () => {
  const model = (name: string) =>
    new Proxy(
      {},
      {
        get(_target, method) {
          if (name === "session" && method === "findUnique") {
            return async () => (state.user ? { twoFactorVerifiedAt: state.twoFactorVerifiedAt, user: state.user } : null);
          }
          return () => {
            state.dbTouched.push(`${name}.${String(method)}`);
            throw new Error(`database touched: ${name}.${String(method)}`);
          };
        },
      },
    );
  const db = new Proxy({}, { get: (_target, key) => (key === "then" ? undefined : model(String(key))) });
  return { db };
});

const REAL_PROD = {
  NODE_ENV: "production",
  SITE_ENV: "production",
  DEV_SKIP_STAFF_2FA: "false",
  NEXT_PUBLIC_SITE_URL: "https://bayit.example",
  BETTER_AUTH_URL: "https://bayit.example",
};

function account(over: Partial<FakeUser> = {}): FakeUser {
  return {
    id: "user-1",
    name: "Test",
    firstName: "Test",
    email: "user-1@example.com",
    image: null,
    phoneNumber: "+995500000001",
    phoneNumberVerified: true,
    role: "USER",
    isDemo: false,
    status: "ACTIVE",
    suspendedUntil: null,
    accountType: "INDIVIDUAL",
    businessName: null,
    locale: "he",
    currency: null,
    timezone: "Asia/Tbilisi",
    keepsShabbat: false,
    showHebrewDates: false,
    twoFactorEnabled: true,
    idVerifiedAt: null,
    ...over,
  };
}

type Call = { key: string; access: Access; run: () => Promise<unknown> };

function staffAndUserActions(): Call[] {
  return actions.flatMap((e) => {
    const access = ruleFor(e, SERVER_ACTIONS);
    if (!access || (access.kind !== "staff" && access.kind !== "user")) return [];
    const key = `${rel(e.file)}#${e.name}`;
    return [
      {
        key,
        access,
        run: async () => {
          const mod = (await import(e.file)) as Record<string, (input: unknown) => Promise<unknown>>;
          const input = /photo|avatar|upload/i.test(e.name) ? new FormData() : {};
          return mod[e.name]!(input);
        },
      },
    ];
  });
}

const calls = staffAndUserActions();

/** Runs one endpoint; a thrown error (e.g. the database proxy) counts as "got past the guard". */
async function outcome(call: Call): Promise<{ error: string | null; touched: string[] }> {
  state.dbTouched = [];
  try {
    const result = (await call.run()) as { ok?: boolean; error?: string } | undefined;
    return { error: result && result.ok === false ? (result.error ?? "error") : null, touched: [...state.dbTouched] };
  } catch (error) {
    return { error: `threw:${error instanceof Error ? error.message.slice(0, 60) : "error"}`, touched: [...state.dbTouched] };
  }
}

function actAs(user: FakeUser | null, twoFactorVerifiedAt: Date | null) {
  for (const [key, value] of Object.entries(REAL_PROD)) vi.stubEnv(key, value);
  state.user = user;
  state.twoFactorVerifiedAt = twoFactorVerifiedAt;
  state.host = "bayit.example";
}

describe("the rules hold when the endpoints are called directly (4.8.a, 12.6.a)", () => {
  beforeAll(async () => {
    for (const file of new Set(calls.map((c) => c.key.split("#")[0]!))) await import(path.join(REPO, file));
  }, 180_000);

  beforeEach(() => {
    vi.unstubAllEnvs();
    state.dbTouched = [];
  });
  afterAll(() => {
    vi.unstubAllEnvs();
  });

  it("covers the staff endpoints outside src/lib/admin too (the reviews panel)", () => {
    const staffKeys = calls.filter((c) => c.access.kind === "staff").map((c) => c.key);
    expect(staffKeys).toContain("src/lib/reviews/admin-actions.ts#hideReviewAction");
    expect(staffKeys.length).toBeGreaterThan(70);
    expect(calls.filter((c) => c.access.kind === "user").length).toBeGreaterThan(90);
  });

  it("signed out: every staff and signed-in endpoint answers auth_required before the database", async () => {
    actAs(null, null);
    const wrong: string[] = [];
    const validatedFirst: string[] = [];
    for (const call of calls) {
      const { error, touched } = await outcome(call);
      if (error === "invalid_input" && call.access.kind === "user") validatedFirst.push(call.key);
      if (!(error === "auth_required" || (error === "invalid_input" && call.access.kind === "user")) || touched.length) wrong.push(`${call.key} → ${error} ${touched.join(",")}`);
    }
    expect(wrong).toEqual([]);
    // A few validate their input before the session check (nothing is read): the static check
    // above proves their requireUserForAction; most must answer auth_required here.
    expect(validatedFirst.length).toBeLessThan(5);
  }, 120_000);

  it("2-step code not entered yet: every staff and signed-in endpoint answers auth_required before the database", async () => {
    actAs(account({ role: "ADMIN" }), null);
    const wrong: string[] = [];
    for (const call of calls) {
      const { error, touched } = await outcome(call);
      if (!(error === "auth_required" || (error === "invalid_input" && call.access.kind === "user")) || touched.length) wrong.push(`${call.key} → ${error} ${touched.join(",")}`);
    }
    expect(wrong).toEqual([]);
  }, 120_000);

  it("a regular account: every staff endpoint answers forbidden before the database", async () => {
    actAs(account({ role: "USER" }), new Date());
    const wrong: string[] = [];
    for (const call of calls.filter((c) => c.access.kind === "staff")) {
      const { error, touched } = await outcome(call);
      if (error !== "forbidden" || touched.length) wrong.push(`${call.key} → ${error} ${touched.join(",")}`);
    }
    expect(wrong).toEqual([]);
  }, 120_000);

  for (const role of STAFF_ROLES) {
    it(`${role}: refused exactly where the role lacks the permission (role table in src/lib/auth/permissions.ts)`, async () => {
      actAs(account({ id: `staff-${role}`, role }), new Date());
      const wrong: string[] = [];
      let allowed = 0;
      for (const call of calls.filter((c) => c.access.kind === "staff")) {
        const { permission, adminOnly } = call.access as { permission: Parameters<typeof can>[1]; adminOnly?: string };
        const { error, touched } = await outcome(call);
        if (can(role, permission) && (!adminOnly || role === "ADMIN")) {
          allowed += 1;
          if (error === "forbidden" || error === "auth_required") wrong.push(`${call.key} refused ${role} (${permission}) → ${error}`);
        } else if (error !== "forbidden" || (touched.length && !adminOnly)) {
          wrong.push(`${call.key} let ${role} through without ${permission} → ${error} ${touched.join(",")}`);
        }
      }
      expect(wrong).toEqual([]);
      if (role === "ADMIN") expect(allowed).toBe(calls.filter((c) => c.access.kind === "staff").length);
    }, 120_000);
  }

  it("an ADMIN with the 2-step code but no fresh authenticator proof: every destructive action answers fresh_proof_required before any write (3.6.c)", async () => {
    actAs(account({ id: "staff-admin-proof", role: "ADMIN" }), new Date());
    const wrong: string[] = [];
    const destructive = calls.filter((c) => c.key in FRESH_PROOF_STAFF_ACTIONS);
    expect(destructive.length).toBe(Object.keys(FRESH_PROOF_STAFF_ACTIONS).length);
    for (const call of destructive) {
      const { error, touched } = await outcome(call);
      // The only read allowed is the proof lookup itself (it fails here, so the proof is "none").
      if (error !== "fresh_proof_required" || touched.some((t) => t !== "verification.findFirst")) wrong.push(`${call.key} → ${error} ${touched.join(",")}`);
    }
    expect(wrong).toEqual([]);
  }, 60_000);

  it("every signed-in and staff route handler: signed out and 2-step pending get 401/403/404 before the database", async () => {
    const guarded = routes.filter((e) => {
      const kind = ruleFor(e, ROUTE_HANDLERS)?.kind;
      return kind === "user" || kind === "staff";
    });
    expect(guarded.length).toBeGreaterThanOrEqual(9);
    const anyParam = new Proxy({}, { get: (_t, key) => (key === "then" ? undefined : key === "all" || key === "key" ? ["x"] : "x") });
    const wrong: string[] = [];
    for (const endpoint of guarded) {
      const mod = (await import(endpoint.file)) as Record<string, (req: Request, ctx: unknown) => Promise<Response>>;
      for (const [who, user, verifiedAt] of [
        ["signed out", null, null],
        ["2-step pending", account({ role: "ADMIN" }), null],
      ] as const) {
        actAs(user, verifiedAt);
        state.dbTouched = [];
        const method = endpoint.name;
        const init = method === "GET" || method === "HEAD" ? { method } : { method, body: new FormData() };
        let status = 0;
        try {
          const { NextRequest } = await import("next/server");
          const res = await mod[method]!(new NextRequest(`https://bayit.example/api/x?q=Tbilisi&lat=41.7&lng=44.8&key=x`, init), { params: Promise.resolve(anyParam) });
          status = res.status;
        } catch (error) {
          status = 0;
          wrong.push(`${rel(endpoint.file)}#${method} ${who} threw ${String(error).slice(0, 80)}`);
          continue;
        }
        if (![401, 403, 404].includes(status) || state.dbTouched.length) wrong.push(`${rel(endpoint.file)}#${method} ${who} → ${status} ${state.dbTouched.join(",")}`);
      }
    }
    expect(wrong).toEqual([]);
  }, 60_000);

  it("staff file routes: refused for roles without the permission, signed out and 2-step pending", async () => {
    const documents = await import("@/app/api/admin/documents/[requestId]/[index]/route");
    const screenshots = await import("@/app/api/admin/reports/[reportId]/[index]/route");
    const open = async (which: "documents" | "screenshots") => {
      state.dbTouched = [];
      try {
        const res =
          which === "documents"
            ? await documents.GET(new Request("https://bayit.example/api/admin/documents/x/0"), { params: Promise.resolve({ requestId: "x", index: "0" }) })
            : await screenshots.GET(new Request("https://bayit.example/api/admin/reports/x/0"), { params: Promise.resolve({ reportId: "x", index: "0" }) });
        return { status: res.status, touched: [...state.dbTouched] };
      } catch {
        return { status: 0, touched: [...state.dbTouched] };
      }
    };
    for (const [which, permission] of [["documents", "verifications"], ["screenshots", "reports"]] as const) {
      actAs(null, null);
      expect(await open(which)).toEqual({ status: 401, touched: [] });
      actAs(account({ role: "ADMIN" }), null);
      expect(await open(which)).toEqual({ status: 401, touched: [] });
      for (const role of ["USER", ...STAFF_ROLES]) {
        actAs(account({ id: `staff-${role}`, role }), new Date());
        const result = await open(which);
        if (can(role, permission)) expect(result.touched.length, `${which} ${role}`).toBeGreaterThan(0);
        else expect(result, `${which} ${role}`).toEqual({ status: 404, touched: [] });
      }
    }
  }, 60_000);
});
