/**
 * The Terms + 18+ gate (S2 review LP-1) is on by construction: requireUserForAction checks it for
 * every signed-in action, and only the actions a person needs before or without accepting skip
 * it with `{ terms: false }`. This walk fails when a new call site skips the gate without being
 * added to TERMS_EXEMPT_ACTIONS (with its reason). The behaviour is tested against the database in
 * ./terms-gate-db.test.ts.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "../..");

/** file → why it may run without an acceptance of the Terms in force. */
export const TERMS_EXEMPT_ACTIONS: Record<string, string> = {
  "src/lib/legal/actions.ts": "the Terms box itself (status and accept)",
  "src/lib/auth/account-email-actions.ts": "the login's email step (before the Terms step)",
  "src/lib/auth/profile-actions.ts": "the login's first-name step",
  "src/lib/auth/actions.ts": "the 2-step setup and its codes (login steps, security)",
  "src/lib/auth/fresh-proof-actions.ts": "the fresh code that account deletion and security changes need",
  "src/lib/auth/phone-check-actions.ts": "the phone check of the login and booking steps",
  "src/lib/auth/logout-actions.ts": "signing out everywhere",
  "src/app/api/account/export/route.ts": "exporting one's data (GDPR, always allowed)",
  "src/lib/account/actions.ts": "deleting the account (deleteMyAccount only)",
  "src/app/api/ical/booking/[code]/route.ts": "reading one's own booking as a calendar file",
  "src/lib/auth/session.ts": "requireStaffForAction (staff have their own gate)",
};

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

describe("the Terms gate (LP-1)", () => {
  it("requireUserForAction checks the Terms unless told not to", () => {
    const source = readFileSync(path.join(ROOT, "src/lib/auth/session.ts"), "utf8");
    expect(source).toMatch(/if \(opts\.terms !== false\) await assertTermsAccepted\(user\);/);
  });

  it("only the listed actions skip it", () => {
    const skipping = walk(path.join(ROOT, "src"))
      .filter((file) => /requireUserForAction\(\{[^}]*terms:\s*false/.test(readFileSync(file, "utf8")))
      .map((file) => path.relative(ROOT, file).split(path.sep).join("/"))
      .sort();
    expect(skipping).toEqual(Object.keys(TERMS_EXEMPT_ACTIONS).sort());
  });

  it("account/actions.ts skips it only for deleting the account", () => {
    const source = readFileSync(path.join(ROOT, "src/lib/account/actions.ts"), "utf8");
    expect(source.match(/terms:\s*false/g)).toHaveLength(1);
    expect(source).toMatch(/export async function deleteMyAccount[\s\S]{0,120}requireUserForAction\(\{ terms: false \}\)/);
  });
});
