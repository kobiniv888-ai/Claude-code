/**
 * FE-2 / FE-9: db:encrypt-fields never seals real data with a codespace key; the server refuses a
 * codespace key as FIELD_ENCRYPTION_KEY_PREVIOUS. Fake keys only.
 */
import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildFieldKeyring } from "./field-crypto-core";
import { databaseHost, encryptFieldsPreflight, expectedKeyId } from "./field-crypto-preflight";
import { newDevKey } from "./dev-keys";
import { startupProblems } from "./startup-check";

const realKey = () => randomBytes(32).toString("base64");
const devKey = () => newDevKey(randomBytes(24));
const REMOTE = "postgresql://bayit_migrate:pw@ep-fake-123.eu-central-1.aws.neon.tech/neondb?sslmode=require";
const LOCAL = "postgresql://postgres:postgres@localhost:5432/bayit";

describe("encryptFieldsPreflight", () => {
  it("production with the codespace's marked key: refused", () => {
    const result = encryptFieldsPreflight({ SITE_ENV: "production", DATABASE_URL: REMOTE, FIELD_ENCRYPTION_KEY: devKey() });
    expect(result.problems.join(" ")).toMatch(/FIELD_ENCRYPTION_KEY is a codespace development key/);
  });

  it("production with a real, unmarked key: no problem; prints the host and key id, never the password", () => {
    const key = realKey();
    const result = encryptFieldsPreflight({ SITE_ENV: "production", DATABASE_URL: REMOTE, FIELD_ENCRYPTION_KEY: key });
    expect(result.problems).toEqual([]);
    expect(result.host).toBe("ep-fake-123.eu-central-1.aws.neon.tech");
    expect(result.keyId).toBe(buildFieldKeyring({ FIELD_ENCRYPTION_KEY: key }, { development: false }).current.id);
    expect(JSON.stringify(result)).not.toContain("pw");
  });

  it("production without a key, or a marked previous key: refused", () => {
    expect(encryptFieldsPreflight({ SITE_ENV: "production", DATABASE_URL: REMOTE }).problems.join(" ")).toMatch(/FIELD_ENCRYPTION_KEY is not set/);
    const prev = encryptFieldsPreflight({ SITE_ENV: "production", DATABASE_URL: REMOTE, FIELD_ENCRYPTION_KEY: realKey(), FIELD_ENCRYPTION_KEY_PREVIOUS: devKey() });
    expect(prev.problems.join(" ")).toMatch(/FIELD_ENCRYPTION_KEY_PREVIOUS holds a codespace development key/);
  });

  it("a remote database refuses a missing or marked key even when SITE_ENV says development or is missing", () => {
    expect(encryptFieldsPreflight({ SITE_ENV: "development", DATABASE_URL: REMOTE, FIELD_ENCRYPTION_KEY: devKey() }).problems).not.toEqual([]);
    expect(encryptFieldsPreflight({ SITE_ENV: "development", DATABASE_URL: REMOTE }).problems).not.toEqual([]);
    expect(encryptFieldsPreflight({ DATABASE_URL: REMOTE, FIELD_ENCRYPTION_KEY: realKey() }).problems.join(" ")).toMatch(/SITE_ENV is not set/);
    expect(encryptFieldsPreflight({ SITE_ENV: "prod", DATABASE_URL: LOCAL, FIELD_ENCRYPTION_KEY: realKey() }).problems).not.toEqual([]);
  });

  it("the codespace's own database with its own key: fine", () => {
    expect(encryptFieldsPreflight({ SITE_ENV: "development", DATABASE_URL: LOCAL, FIELD_ENCRYPTION_KEY: devKey() }).problems).toEqual([]);
    expect(encryptFieldsPreflight({ SITE_ENV: "development", DATABASE_URL: LOCAL, BETTER_AUTH_SECRET: "bayit-dev-x".padEnd(40, "y") }).problems).toEqual([]);
  });

  it("--expect-key-id: refuses another key, accepts the right one", () => {
    const key = realKey();
    const id = buildFieldKeyring({ FIELD_ENCRYPTION_KEY: key }, { development: false }).current.id;
    const env = { SITE_ENV: "production", DATABASE_URL: REMOTE, FIELD_ENCRYPTION_KEY: key };
    expect(encryptFieldsPreflight(env, { expectKeyId: id }).problems).toEqual([]);
    expect(encryptFieldsPreflight(env, { expectKeyId: "00000000" }).problems.join(" ")).toMatch(/not the expected 00000000/);
    expect(encryptFieldsPreflight(env, { expectKeyId: "nothex" }).problems.join(" ")).toMatch(/8 hex characters/);
    expect(expectedKeyId(["--verify", "--expect-key-id", "ABCD1234"])).toBe("abcd1234");
    expect(expectedKeyId(["--expect-key-id=abcd1234"])).toBe("abcd1234");
    expect(expectedKeyId(["--verify"])).toBeNull();
  });

  it("databaseHost never returns credentials", () => {
    expect(databaseHost(REMOTE)).toBe("ep-fake-123.eu-central-1.aws.neon.tech");
    expect(databaseHost(LOCAL)).toBe("localhost:5432");
    expect(databaseHost("not a url")).toBe("");
  });
});

describe("the server's start (FE-9)", () => {
  it("refuses a codespace key as FIELD_ENCRYPTION_KEY_PREVIOUS on staging and production, not in development", () => {
    const base = { FIELD_ENCRYPTION_KEY: realKey(), FIELD_ENCRYPTION_KEY_PREVIOUS: devKey() };
    for (const site of ["staging", "production"]) {
      expect(startupProblems({ ...base, SITE_ENV: site }).join(" ")).toMatch(/FIELD_ENCRYPTION_KEY_PREVIOUS holds a codespace development key/);
    }
    expect(startupProblems({ ...base, SITE_ENV: "development" }).join(" ")).not.toMatch(/FIELD_ENCRYPTION_KEY_PREVIOUS holds/);
  });
});
