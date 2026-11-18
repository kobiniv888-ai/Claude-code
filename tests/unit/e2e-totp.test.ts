/**
 * The e2e staff login computes real authenticator codes (tests/e2e/helpers/totp.ts). These checks
 * hold it to the app's own code: a code it makes is one the server accepts (src/lib/auth/totp.ts),
 * a secret it stores is one the server can read (src/lib/crypto.ts), and it never picks a time
 * step the server would refuse (already used, or more than one step ahead).
 */
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { decryptSecret, encryptSecret, newTotpSecret, nextCodeStep, TOTP_PERIOD_MS, totpCodeAt } from "../e2e/helpers/totp";

vi.mock("server-only", () => ({}));

const KEY = randomBytes(32).toString("base64");
let previousKey: string | undefined;
beforeAll(() => {
  previousKey = process.env.APP_ENCRYPTION_KEY;
  process.env.APP_ENCRYPTION_KEY = KEY;
});
afterAll(() => {
  if (previousKey === undefined) delete process.env.APP_ENCRYPTION_KEY;
  else process.env.APP_ENCRYPTION_KEY = previousKey;
});

const step = (n: number) => n * TOTP_PERIOD_MS;
const NOW = Date.UTC(2026, 10, 3, 12, 0, 10); // 10 seconds into a step
const CURRENT = Math.floor(NOW / TOTP_PERIOD_MS);

describe("e2e authenticator codes", () => {
  it("makes the code the server accepts, for the step it names", async () => {
    const { matchingCounter } = await import("@/lib/auth/totp");
    const secret = newTotpSecret();
    for (const counter of [CURRENT - 1, CURRENT, CURRENT + 1]) {
      expect(matchingCounter(secret, totpCodeAt(secret, counter), NOW)).toBe(counter);
    }
    // Two steps away is too far for the server.
    expect(matchingCounter(secret, totpCodeAt(secret, CURRENT + 2), NOW)).toBeNull();
  });

  it("stores the secret the way the server reads it, and reads the server's", async () => {
    const { decryptString, encryptString } = await import("@/lib/crypto");
    const secret = newTotpSecret();
    expect(decryptString(encryptSecret(secret, { APP_ENCRYPTION_KEY: KEY }))).toBe(secret);
    expect(decryptSecret(encryptString(secret), { APP_ENCRYPTION_KEY: KEY })).toBe(secret);
    // With another key the server can't read it (a different .env): fail loudly, never silently.
    expect(() => decryptSecret(encryptString(secret), { APP_ENCRYPTION_KEY: randomBytes(32).toString("base64") })).toThrow();
  });
});

describe("nextCodeStep", () => {
  it("uses the current step when nothing was used yet", () => {
    expect(nextCodeStep(NOW, null)).toEqual({ counter: CURRENT, waitMs: 0 });
    expect(nextCodeStep(NOW, CURRENT - 3)).toEqual({ counter: CURRENT, waitMs: 0 });
  });

  it("never reuses a step the server already accepted", () => {
    expect(nextCodeStep(NOW, CURRENT)).toEqual({ counter: CURRENT + 1, waitMs: 0 });
  });

  it("waits when the next free step is more than one ahead", () => {
    // CURRENT + 1 is used: CURRENT + 2 is accepted once the clock reaches CURRENT + 1.
    expect(nextCodeStep(NOW, CURRENT + 1)).toEqual({ counter: CURRENT + 2, waitMs: step(CURRENT + 1) - NOW });
  });

  it("near the end of a step, sends the next one", () => {
    const late = step(CURRENT) + TOTP_PERIOD_MS - 1_000;
    expect(nextCodeStep(late, null)).toEqual({ counter: CURRENT + 1, waitMs: 0 });
  });
});
