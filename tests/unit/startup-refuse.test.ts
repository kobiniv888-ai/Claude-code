import { spawnSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { REFUSE_CASES, fakeProductionEnv } from "../startup/fake-env";

/**
 * Fail closed at start-up (founder's decision 1; SECURITY_REPORT 2.2.j, 3.4.b, 20.8), tested on the
 * server's REAL start-up hook in its own process: src/instrumentation.ts register() (which runs
 * src/instrumentation-node.ts registerNode() on Node.js) — what Next.js calls before `next start`
 * serves anything. Bad settings must end the
 * process with exit code 1 and a list of what to fix; complete settings must let it start.
 *
 * The child gets ONLY the environment written here (no .env file is read by the hook), so each
 * case breaks exactly one thing in an otherwise complete set of fake production settings
 * (tests/startup/fake-env.ts). The same cases against a built server: tests/startup/next-start-probes.ts.
 */

const ROOT = path.resolve(__dirname, "../..");
const TSX = path.join(ROOT, "node_modules/.bin/tsx");

function start(env: Record<string, string | undefined>) {
  const result = spawnSync(TSX, ["--require", "./scripts/server-script.cjs", "tests/startup/register-runner.ts"], {
    cwd: ROOT,
    // PATH and HOME only from this process: nothing else leaks in (no SITE_ENV from vitest's config).
    // NEXT_RUNTIME=nodejs as Next.js sets it: the runner calls src/instrumentation.ts register().
    env: Object.fromEntries(
      Object.entries({ PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", NODE_ENV: "production", NEXT_RUNTIME: "nodejs", ...env }).filter(
        (entry): entry is [string, string] => entry[1] !== undefined,
      ),
    ) as NodeJS.ProcessEnv,
    encoding: "utf8",
    timeout: 60_000,
  });
  return { code: result.status, out: `${result.stdout}\n${result.stderr}` };
}

describe("the server refuses to start with missing or unsafe settings", () => {
  it("starts with complete fake production settings (the baseline every case breaks)", () => {
    const { code, out } = start(fakeProductionEnv());
    expect(out).toContain("STARTED");
    expect(out).not.toContain("will not start");
    expect(code).toBe(0);
  }, 60_000);

  it("refuses with no SITE_ENV at all", () => {
    const env = fakeProductionEnv();
    delete (env as Record<string, string | undefined>).SITE_ENV;
    const { code, out } = start(env);
    expect(code).toBe(1);
    expect(out).toMatch(/SITE_ENV is not set/);
    expect(out).not.toContain("STARTED");
  }, 60_000);

  for (const testCase of REFUSE_CASES) {
    it(`refuses: ${testCase.name}`, () => {
      const { code, out } = start({ ...fakeProductionEnv(), ...testCase.change });
      expect(code).toBe(1);
      expect(out).toContain("Bayit will not start");
      expect(out).toMatch(testCase.expect);
      expect(out).not.toContain("STARTED");
    }, 60_000);
  }

  it("refuses test mode on production even when the other settings are fine", () => {
    const production = start({ ...fakeProductionEnv(), AUTH_TEST_MODE: "true" });
    expect(production.code).toBe(1);
    // Staging with test mode starts when its own database can be checked:
    // tests/unit/startup/site-marker.test.ts (a throwaway database).
  }, 60_000);

  it("refuses a production build labelled development on a public address (2.2.j)", () => {
    const { code, out } = start({ ...fakeProductionEnv(), SITE_ENV: "development" });
    expect(code).toBe(1);
    expect(out).toMatch(/is a public address, but SITE_ENV=development/);
    expect(out).not.toContain("STARTED");
  }, 60_000);

  it("refuses staging when its database cannot be checked for the real site's marker (fail closed, 12.1.b)", () => {
    const { code, out } = start({ ...fakeProductionEnv(), SITE_ENV: "staging", AUTH_TEST_MODE: "true" });
    expect(code).toBe(1);
    expect(out).toMatch(/could not be checked for the real site's marker/);
    expect(out).not.toContain("STARTED");
  }, 60_000);

  it("the check runs only in the Node.js runtime (NEXT_RUNTIME guard of src/instrumentation.ts)", () => {
    // The Edge runtime has no process.exit: register() skips the Node.js half there.
    const { code, out } = start({ ...fakeProductionEnv(), SITE_ENV: "", NEXT_RUNTIME: undefined });
    expect(out).toContain("STARTED");
    expect(code).toBe(0);
  }, 60_000);
});
