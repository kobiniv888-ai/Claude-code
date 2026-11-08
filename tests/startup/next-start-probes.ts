/**
 * Refuse-to-start probes against a BUILT server (founder's decision 1; SECURITY_REPORT 2.2.j,
 * 3.4.b, 20.8). The unit test tests/unit/startup-refuse.test.ts runs the same start-up hook on
 * every `npm run check`; this script proves it on the real `next start` of a production build:
 *
 *   NEXT_DIST_DIR=.next-4730 SITE_ENV=development npx next build      (any build of this commit)
 *   npx tsx tests/startup/next-start-probes.ts --dist .next-4730 --port 4730
 *
 * (a) SITE_ENV missing, (b) SITE_ENV=production with AUTH_TEST_MODE=true, (c) SITE_ENV=production
 * with a required secret missing: `next start` must EXIT with a non-zero code and never answer a
 * page. (d) SITE_ENV=production with complete FAKE settings (tests/startup/fake-env.ts) and the
 * local database (over TLS, through a non-local host name): it starts, and shows no demo listing,
 * no demo banner, no login code on screen, and refuses the demo phone login.
 *
 * The port must be free (stop any server on it first). Exit code 0 when every probe passes.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import pg from "pg";
import { REFUSE_CASES, fakeProductionEnv } from "./fake-env";

const ROOT = path.resolve(__dirname, "../..");
const arg = (name: string) => {
  const at = process.argv.indexOf(`--${name}`);
  return at > 0 ? process.argv[at + 1] : undefined;
};
const DIST = arg("dist") ?? process.env.NEXT_DIST_DIR;
const PORT = Number(arg("port") ?? process.env.PORT ?? 0);
if (!DIST || !PORT) {
  console.error("usage: npx tsx tests/startup/next-start-probes.ts --dist .next-<port> --port <port>");
  process.exit(2);
}
const BASE = `http://localhost:${PORT}`;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function localDatabaseUrl(): string {
  const line = readFileSync(path.join(ROOT, ".env"), "utf8")
    .split("\n")
    .find((l) => l.startsWith("DATABASE_URL="));
  if (!line) throw new Error("DATABASE_URL is not in .env");
  return line.slice("DATABASE_URL=".length).trim().replace(/^"|"$/g, "");
}

/** The public ids of the demo listings that are live (what a development site would show). */
async function demoPublicIds(): Promise<number[]> {
  const client = new pg.Client({ connectionString: localDatabaseUrl() });
  await client.connect();
  try {
    const { rows } = await client.query<{ publicId: number }>(`SELECT "publicId" FROM "Listing" WHERE "isDemo" AND status = 'LIVE'`);
    return rows.map((row) => row.publicId);
  } finally {
    await client.end();
  }
}

/** The local database (from .env) over TLS through a host name the start-up check does not call local. */
function localDatabaseOverTls(): string {
  const url = new URL(localDatabaseUrl());
  // "vm" resolves to 127.0.0.1 in this container (/etc/hosts); override with PROBE_DB_HOST.
  url.hostname = process.env.PROBE_DB_HOST ?? "vm";
  url.search = "";
  // TLS required (the check), without verifying the local self-signed certificate.
  return `${url.toString()}?sslmode=require&uselibpqcompat=true`;
}

function startServer(env: Record<string, string>): { child: ChildProcess; output: () => string; exited: Promise<number | null> } {
  let out = "";
  const child = spawn(path.join(ROOT, "node_modules/.bin/next"), ["start", "-p", String(PORT)], {
    cwd: ROOT,
    // Only what is written here (plus PATH/HOME): every setting the rules read is given explicitly,
    // so nothing from .env decides the outcome (Next fills only names that are not set at all).
    env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", NODE_ENV: "production", NEXT_DIST_DIR: DIST!, WARM_ON_START: "0", ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout?.on("data", (chunk) => (out += chunk));
  child.stderr?.on("data", (chunk) => (out += chunk));
  const exited = new Promise<number | null>((resolve) => child.on("exit", (code) => resolve(code)));
  return { child, output: () => out, exited };
}

async function answers(pathname: string, init?: RequestInit): Promise<Response | null> {
  try {
    return await fetch(`${BASE}${pathname}`, { redirect: "manual", signal: AbortSignal.timeout(60_000), ...init });
  } catch {
    return null;
  }
}

const results: { name: string; ok: boolean; detail: string }[] = [];
const record = (name: string, ok: boolean, detail: string) => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}: ${detail}`);
};

async function refuses(name: string, env: Record<string, string>, expect: RegExp) {
  const server = startServer(env);
  const code = await Promise.race([server.exited, sleep(90_000).then(() => "timeout" as const)]);
  if (code === "timeout") {
    const page = await answers("/he");
    server.child.kill("SIGTERM");
    await server.exited;
    record(name, false, `still running after 90 s (GET /he → ${page?.status ?? "no answer"})`);
    return;
  }
  const said = expect.test(server.output());
  record(name, code !== 0 && code !== null && said, `exit code ${code}${said ? ", named the problem" : ", WITHOUT the expected message"}`);
}

async function main() {
  // (a)–(c): one bad setting each in otherwise complete production settings.
  const missing = fakeProductionEnv();
  missing.SITE_ENV = "";
  await refuses("(a) SITE_ENV missing", missing, /SITE_ENV is not set/);
  for (const testCase of REFUSE_CASES.filter((c) => c.name !== "SITE_ENV missing")) {
    await refuses(`(${testCase.name.startsWith("test mode") ? "b" : "c"}) ${testCase.name}`, { ...fakeProductionEnv(), ...testCase.change }, testCase.expect);
  }

  // (d): complete fake production settings on the local database.
  const site = "https://bayit.example.com";
  const server = startServer(fakeProductionEnv({ databaseUrl: localDatabaseOverTls(), siteUrl: site }));
  try {
    let home: Response | null = null;
    for (let i = 0; i < 90 && !home; i += 1) {
      const exited = await Promise.race([server.exited.then(() => true), sleep(1000).then(() => false)]);
      if (exited) break;
      const res = await answers("/he");
      if (res?.status === 200) home = res;
    }
    record("(d) SITE_ENV=production with complete settings starts", home !== null, home ? "GET /he → 200" : `no 200 (output: ${server.output().slice(-400)})`);
    if (!home) return;
    const homeHtml = await home.text();
    // The demo banner ("Listings marked Demo are examples…") in Hebrew, and no demo listing anywhere.
    record("(d) no demo banner on /he", !homeHtml.includes("הן דוגמאות, לא נכסים אמיתיים"), "banner text absent");
    const search = await answers("/he/search?city=tbilisi");
    const searchHtml = (await search?.text()) ?? "";
    const demoIds = await demoPublicIds();
    const demoLinks = demoIds.filter((id) => new RegExp(`/he/listing/${id}(?![0-9])`).test(searchHtml));
    record("(d) no demo listings in search", search?.status === 200 && demoLinks.length === 0, `GET /he/search?city=tbilisi → ${search?.status}, links to the ${demoIds.length} demo listings: ${demoLinks.length}`);
    const listing = await answers(`/he/listing/${demoIds[0]}`);
    record("(d) a demo listing page is not found", demoIds.length > 0 && listing?.status === 404, `GET /he/listing/${demoIds[0]} (demo) → ${listing?.status}`);
    const otp = await answers("/api/dev/last-otp?phone=%2B995555000001");
    record("(d) no login codes on screen (/api/dev/last-otp)", otp?.status === 404, `→ ${otp?.status}`);
    const login = await answers("/en/login");
    const loginHtml = (await login?.text()) ?? "";
    // Rendered markup only (the translations shipped to the page also hold these words).
    const shown = />\s*(Log in with a phone code \(test mode\)|Test mode: login codes)/.test(loginHtml);
    record("(d) the login page offers no test-mode phone login", login?.status === 200 && !shown, `GET /en/login → ${login?.status}, test-mode button or note rendered: ${shown}`);
    const send = await answers("/api/auth/phone-number/send-otp", {
      method: "POST",
      headers: { origin: site, "content-type": "application/json" },
      body: JSON.stringify({ phoneNumber: "+995555000001" }),
    });
    record("(d) the demo admin's phone login is refused", !!send && send.status >= 400, `send-otp → ${send?.status}`);
  } finally {
    server.child.kill("SIGTERM");
    await Promise.race([server.exited, sleep(10_000)]);
    if (server.child.exitCode === null) server.child.kill("SIGKILL");
  }
}

main()
  .catch((error) => {
    console.error(error);
    results.push({ name: "probe script", ok: false, detail: String(error) });
  })
  .finally(() => {
    const failed = results.filter((r) => !r.ok);
    console.log(`\n${results.length - failed.length}/${results.length} probes passed.`);
    process.exit(failed.length ? 1 : 0);
  });
