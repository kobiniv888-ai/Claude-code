/**
 * The real site's database marker (SECURITY_REPORT 12.1.b, 3.4.a; founder's decision 1): a staging
 * or development server, build or seed never runs on the real site's database. Tested on the
 * server's real start-up hook in a child process (tests/startup/register-runner.ts) against a
 * THROWAWAY database made for this test (so the shared development database never carries the
 * marker), and on the rule itself. The database is dropped afterwards.
 */
import "dotenv/config";
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PRODUCTION_MARKER, SITE_ENV_MARKER_KEY, readSiteMarker, siteMarkerDecision, type MarkerStore } from "../../../src/lib/site-env-marker";
import { fakeProductionEnv } from "../../startup/fake-env";

const ROOT = path.resolve(__dirname, "../../..");
const TSX = path.join(ROOT, "node_modules/.bin/tsx");
const DB_NAME = `bayit_marker_test_${randomBytes(4).toString("hex")}`;

function adminUrl(): URL {
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error("DATABASE_URL is not set (.env)");
  return new URL(raw);
}

/** The throwaway database: for development the local address; for staging over TLS on a non-local name ("vm" → 127.0.0.1). */
function throwawayUrl(kind: "local" | "tls"): string {
  const url = adminUrl();
  url.pathname = `/${DB_NAME}`;
  url.search = "";
  if (kind === "local") return url.toString();
  url.hostname = process.env.PROBE_DB_HOST ?? "vm";
  return `${url.toString()}?sslmode=require&uselibpqcompat=true`;
}

async function sql(query: string, database?: string) {
  const url = adminUrl();
  if (database) url.pathname = `/${database}`;
  const client = new Client({ connectionString: url.toString() });
  await client.connect();
  try {
    return await client.query(query);
  } finally {
    await client.end();
  }
}

function start(env: Record<string, string>) {
  const result = spawnSync(TSX, ["--require", "./scripts/server-script.cjs", "tests/startup/register-runner.ts"], {
    cwd: ROOT,
    env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", NODE_ENV: "production", NEXT_RUNTIME: "nodejs", ...env },
    encoding: "utf8",
    timeout: 60_000,
  });
  return { code: result.status, out: `${result.stdout}\n${result.stderr}` };
}

const setMarker = (on: boolean) =>
  sql(
    on
      ? `INSERT INTO "SiteSetting" ("key", "value", "updatedAt") VALUES ('${SITE_ENV_MARKER_KEY}', '"${PRODUCTION_MARKER}"', now()) ON CONFLICT ("key") DO UPDATE SET "value" = EXCLUDED."value"`
      : `DELETE FROM "SiteSetting" WHERE "key" = '${SITE_ENV_MARKER_KEY}'`,
    DB_NAME,
  );

beforeAll(async () => {
  await sql(`CREATE DATABASE "${DB_NAME}"`);
  await sql(`CREATE TABLE "SiteSetting" ("key" text PRIMARY KEY, "value" jsonb NOT NULL, "updatedById" text, "updatedAt" timestamp(3) NOT NULL)`, DB_NAME);
}, 60_000);

afterAll(async () => {
  await sql(`DROP DATABASE IF EXISTS "${DB_NAME}" WITH (FORCE)`);
}, 60_000);

describe("the real site's database marker", () => {
  const staging = () => ({ ...fakeProductionEnv({ databaseUrl: throwawayUrl("tls") }), SITE_ENV: "staging", AUTH_TEST_MODE: "true" });
  const development = () => ({
    ...fakeProductionEnv({ databaseUrl: throwawayUrl("local"), siteUrl: "http://localhost:3000" }),
    SITE_ENV: "development",
    SITE_URL: "",
    AUTH_TEST_MODE: "true",
  });

  it("without the marker, staging (test mode on) and development start", async () => {
    await setMarker(false);
    const stagingRun = start(staging());
    expect(stagingRun.out).toContain("STARTED");
    expect(stagingRun.code).toBe(0);
    const devRun = start(development());
    expect(devRun.out).toContain("STARTED");
    expect(devRun.code).toBe(0);
  }, 120_000);

  it("on a database marked as the real site's, staging and development EXIT (code 1)", async () => {
    await setMarker(true);
    for (const env of [staging(), development()]) {
      const { code, out } = start(env);
      expect(code).toBe(1);
      expect(out).toMatch(/DATABASE_URL is the REAL site's database/);
      expect(out).not.toContain("STARTED");
    }
  }, 120_000);

  it("the real site writes the marker when it starts", async () => {
    await setMarker(false);
    const { code, out } = start(fakeProductionEnv({ databaseUrl: throwawayUrl("tls") }));
    expect(out).toContain("STARTED");
    expect(code).toBe(0);
    const rows = await sql(`SELECT "value" FROM "SiteSetting" WHERE "key" = '${SITE_ENV_MARKER_KEY}'`, DB_NAME);
    expect(rows.rows[0]?.value).toBe(PRODUCTION_MARKER);
    await setMarker(false);
  }, 120_000);

  it("the build and seed check refuses the marked database for any other SITE_ENV", async () => {
    await setMarker(true);
    const run = (siteEnv: string) =>
      spawnSync(TSX, ["--require", "./scripts/server-script.cjs", "scripts/check-site-marker.ts"], {
        cwd: ROOT,
        env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", NODE_ENV: "production", SITE_ENV: siteEnv, DATABASE_URL: throwawayUrl("local"), DOTENV_CONFIG_PATH: "/dev/null" },
        encoding: "utf8",
        timeout: 60_000,
      });
    expect(run("staging").status).toBe(1);
    expect(run("development").status).toBe(1);
    expect(run("production").status).toBe(0);
    await setMarker(false);
    expect(run("staging").status).toBe(0);
  }, 120_000);
});

describe("siteMarkerDecision (pure)", () => {
  const store = (value: unknown, error?: unknown): MarkerStore => ({
    siteSetting: {
      findUnique: async () => {
        if (error) throw error;
        return value === undefined ? null : { value };
      },
      upsert: async () => ({}),
    },
  });

  it("refuses staging and development on the marker; production always starts", async () => {
    const marked = await readSiteMarker(store("production"));
    expect(siteMarkerDecision("staging", marked).action).toBe("refuse");
    expect(siteMarkerDecision("development", marked).action).toBe("refuse");
    expect(siteMarkerDecision("production", marked).action).toBe("start");
    expect(siteMarkerDecision("staging", await readSiteMarker(store(undefined))).action).toBe("start");
  });

  it("a database that cannot be read: staging refuses, development warns (the build and seed refuse)", async () => {
    const broken = await readSiteMarker(store(null, new Error("connection refused")));
    expect(siteMarkerDecision("staging", broken).action).toBe("refuse");
    expect(siteMarkerDecision("development", broken).action).toBe("warn");
    expect(siteMarkerDecision("development", broken, { failClosed: true }).action).toBe("refuse");
    // A new, empty database (no table yet) carries no marker.
    const empty = await readSiteMarker(store(null, Object.assign(new Error("missing table"), { code: "P2021" })));
    expect(siteMarkerDecision("staging", empty).action).toBe("start");
  });
});
