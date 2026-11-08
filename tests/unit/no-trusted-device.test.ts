/**
 * Founder's answer (d), 8 November 2026: no "trusted device" and no "skip the 2-step code on this
 * device" for staff — anywhere. Remembered devices (DeviceLink, kept a year) only mean "don't send
 * a new-device alert again" (and risk links between accounts). The ONLY 2-step skip that exists is
 * the demo-only development shortcut (canSkipStaffTwoFactor), and this file keeps it that way:
 *
 * - Better Auth's own twoFactor plugin (with its trustDevice cookie) is not used, and no code reads
 *   a "trust this device" / "remember me" flag for the 2-step login.
 * - A session's 2-step state comes only from the session row (twoFactorVerifiedAt) and, for staff,
 *   the Strict staff cookie of THIS session and the 12-hour idle marker — never from a device.
 * - The development shortcut needs a demo account AND next dev AND SITE_ENV=development AND
 *   DEV_SKIP_STAFF_2FA=true; staging and production refuse to start with that flag.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { canSkipStaffTwoFactor, staffAccess } from "@/lib/auth/staff-access";
import { startupProblems } from "@/lib/startup-check";

const ROOT = path.resolve(__dirname, "../..");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return name === "generated" ? [] : sourceFiles(full);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [full] : [];
  });
}

// (Comments may point at this test by name.)
const files = sourceFiles(path.join(ROOT, "src")).map((file) => ({
  file: path.relative(ROOT, file),
  text: readFileSync(file, "utf8").replaceAll("no-trusted-device.test", ""),
}));

describe("no trusted-device path for the 2-step login", () => {
  it("Better Auth's twoFactor plugin (and its trustDevice cookie) is not used", () => {
    for (const { file, text } of files) {
      expect(text, file).not.toMatch(/better-auth\/plugins\/two-factor|better-auth\/plugins["'][^;]*twoFactor|\btwoFactor\s*\(/);
      expect(text, file).not.toMatch(/trustDevice|trust_device|trusted[_-]?device|rememberDevice|remember_device|skip2fa|skipTwoFactorFor/i);
    }
  });

  it("the session's 2-step state never reads a device", () => {
    const decides = ["src/lib/auth/session.ts", "src/lib/auth/two-factor-gate.ts", "src/lib/auth/staff-access.ts", "src/lib/auth/staff-session.ts", "src/lib/auth/actions.ts"];
    for (const file of decides) {
      const text = readFileSync(path.join(ROOT, file), "utf8");
      expect(text, file).not.toMatch(/deviceLink|getDeviceHash|getDeviceId|bayit_did/);
    }
    const session = readFileSync(path.join(ROOT, "src/lib/auth/session.ts"), "utf8");
    expect(session).toMatch(/twoFactorVerified = !user\.twoFactorEnabled \|\| row\.twoFactorVerifiedAt !== null/);
  });

  it("DeviceLink is used only for new-device alerts and risk links, never by the 2-step login", () => {
    const users = files.filter(({ text }) => /\bdeviceLink\b/.test(text)).map(({ file }) => file);
    for (const file of users) expect(file).not.toMatch(/two-factor|staff-session|staff-access|session\.ts$|auth\/actions\.ts$/);
  });

  it("a real staff account never skips the 2-step code, in any environment", () => {
    const envs = [
      { NODE_ENV: "development", SITE_ENV: "development", DEV_SKIP_STAFF_2FA: "true" },
      { NODE_ENV: "production", SITE_ENV: "development", DEV_SKIP_STAFF_2FA: "true" },
      { NODE_ENV: "production", SITE_ENV: "staging", DEV_SKIP_STAFF_2FA: "true" },
      { NODE_ENV: "production", SITE_ENV: "production", DEV_SKIP_STAFF_2FA: "true" },
    ];
    for (const env of envs) {
      expect(canSkipStaffTwoFactor(env, { isDemo: false }), JSON.stringify(env)).toBe(false);
      expect(
        staffAccess(env, ["localhost"], { isStaff: true, isDemo: false, twoFactorEnabled: false, twoFactorVerified: false, strictCookie: false }),
      ).toBe("needs_setup");
      expect(staffAccess(env, ["localhost"], { isStaff: true, isDemo: false, twoFactorEnabled: true, twoFactorVerified: false, strictCookie: true })).toBe(
        "needs_code",
      );
    }
  });

  it("the demo shortcut is development-only, and the real site cannot even start with its flag", () => {
    expect(canSkipStaffTwoFactor({ NODE_ENV: "development", SITE_ENV: "development", DEV_SKIP_STAFF_2FA: "true" }, { isDemo: true })).toBe(true);
    expect(canSkipStaffTwoFactor({ NODE_ENV: "production", SITE_ENV: "development", DEV_SKIP_STAFF_2FA: "true" }, { isDemo: true })).toBe(false);
    expect(canSkipStaffTwoFactor({ NODE_ENV: "development", SITE_ENV: "staging", DEV_SKIP_STAFF_2FA: "true" }, { isDemo: true })).toBe(false);
    expect(canSkipStaffTwoFactor({ NODE_ENV: "development", SITE_ENV: "development" }, { isDemo: true })).toBe(false);
    const prod = startupProblems({ SITE_ENV: "production", DEV_SKIP_STAFF_2FA: "true" }).join("\n");
    expect(prod).toMatch(/DEV_SKIP_STAFF_2FA is on/);
    const staging = startupProblems({ SITE_ENV: "staging", DEV_SKIP_STAFF_2FA: "true" }).join("\n");
    expect(staging).toMatch(/DEV_SKIP_STAFF_2FA is on/);
  });

  it("no 2-step login for hosts can be skipped either (no host-side remember-this-device exists)", () => {
    const gate = readFileSync(path.join(ROOT, "src/lib/auth/two-factor-gate.ts"), "utf8");
    expect(gate).not.toMatch(/remember|trust|skip/i);
  });
});
