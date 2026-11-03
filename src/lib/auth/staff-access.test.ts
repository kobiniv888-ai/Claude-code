import { describe, expect, it } from "vitest";
import {
  canSkipStaffTwoFactor,
  configuredSiteHosts,
  demoStaffAllowed,
  isPermanentSiteAddress,
  staffAccess,
  type StaffAccessEnv,
  type StaffAccessUser,
} from "./staff-access";

const DEV_LOCAL: StaffAccessEnv = {
  NODE_ENV: "development",
  DEV_SKIP_STAFF_2FA: "true",
  NEXT_PUBLIC_SITE_URL: "http://localhost:3000",
  BETTER_AUTH_URL: "http://localhost:3000",
};
const PROD_CODESPACE: StaffAccessEnv = {
  NODE_ENV: "production",
  NEXT_PUBLIC_SITE_URL: "http://localhost:3000",
  BETTER_AUTH_URL: "http://localhost:3000",
};
const PROD_REAL: StaffAccessEnv = {
  NODE_ENV: "production",
  NEXT_PUBLIC_SITE_URL: "https://bayit.example",
  BETTER_AUTH_URL: "https://bayit.example",
};

const LOCAL = ["localhost:3000"];
const CODESPACE = ["localhost:3000", "name-3000.app.github.dev"];
const REAL = ["bayit.example"];

function staff(over: Partial<StaffAccessUser> = {}): StaffAccessUser {
  return { isStaff: true, isDemo: false, twoFactorEnabled: true, twoFactorVerified: true, ...over };
}

describe("permanent site address", () => {
  it("reads SITE_URL, NEXT_PUBLIC_SITE_URL and BETTER_AUTH_URL", () => {
    expect(configuredSiteHosts({ SITE_URL: "https://a.example/x", NEXT_PUBLIC_SITE_URL: "http://localhost:3000", BETTER_AUTH_URL: "nonsense" })).toEqual([
      "a.example",
      "localhost",
    ]);
  });

  it("is permanent when any configured address is not a test host", () => {
    expect(isPermanentSiteAddress(PROD_REAL)).toBe(true);
    expect(isPermanentSiteAddress({ ...PROD_CODESPACE, SITE_URL: "https://bayit.example" })).toBe(true);
    expect(isPermanentSiteAddress({ NODE_ENV: "development", BETTER_AUTH_URL: "https://bayit.example" })).toBe(true);
  });

  it("is not permanent on localhost or a Codespaces preview", () => {
    expect(isPermanentSiteAddress(PROD_CODESPACE)).toBe(false);
    expect(isPermanentSiteAddress({ NODE_ENV: "production", NEXT_PUBLIC_SITE_URL: "https://name-3000.app.github.dev" })).toBe(false);
    expect(isPermanentSiteAddress(DEV_LOCAL)).toBe(false);
  });

  it("treats production without any configured address as permanent (conservative)", () => {
    expect(isPermanentSiteAddress({ NODE_ENV: "production" })).toBe(true);
    expect(isPermanentSiteAddress({ NODE_ENV: "development" })).toBe(false);
  });
});

describe("demo staff accounts", () => {
  it("are allowed on localhost and Codespaces", () => {
    expect(demoStaffAllowed(DEV_LOCAL, LOCAL)).toBe(true);
    expect(demoStaffAllowed(PROD_CODESPACE, CODESPACE)).toBe(true);
  });

  it("are refused on the permanent address", () => {
    expect(demoStaffAllowed(PROD_REAL, REAL)).toBe(false);
    // Even when the request claims to be localhost.
    expect(demoStaffAllowed(PROD_REAL, LOCAL)).toBe(false);
    expect(demoStaffAllowed(PROD_REAL, null)).toBe(false);
  });

  it("are refused when the request comes from a real domain despite a test configuration", () => {
    expect(demoStaffAllowed(PROD_CODESPACE, ["bayit.example"])).toBe(false);
    expect(demoStaffAllowed(PROD_CODESPACE, ["localhost:3000", "bayit.example"])).toBe(false);
    expect(demoStaffAllowed(PROD_CODESPACE, [])).toBe(false);
  });
});

describe("the development 2-step login shortcut", () => {
  it("applies only to demo accounts, only in development, only when turned on", () => {
    expect(canSkipStaffTwoFactor(DEV_LOCAL, { isDemo: true })).toBe(true);
    expect(canSkipStaffTwoFactor(DEV_LOCAL, { isDemo: false })).toBe(false);
    expect(canSkipStaffTwoFactor({ ...DEV_LOCAL, DEV_SKIP_STAFF_2FA: "false" }, { isDemo: true })).toBe(false);
    expect(canSkipStaffTwoFactor({ ...DEV_LOCAL, NODE_ENV: "production" }, { isDemo: true })).toBe(false);
  });
});

describe("staffAccess", () => {
  it("refuses regular accounts", () => {
    expect(staffAccess(DEV_LOCAL, LOCAL, staff({ isStaff: false }))).toBe("not_staff");
    expect(staffAccess(PROD_REAL, REAL, staff({ isStaff: false }))).toBe("not_staff");
  });

  it("always asks a REAL staff account for 2-step login, also in development with the shortcut on", () => {
    expect(staffAccess(DEV_LOCAL, LOCAL, staff({ twoFactorEnabled: false, twoFactorVerified: true }))).toBe("needs_setup");
    expect(staffAccess(DEV_LOCAL, LOCAL, staff({ twoFactorVerified: false }))).toBe("needs_code");
    expect(staffAccess(PROD_REAL, REAL, staff({ twoFactorEnabled: false, twoFactorVerified: true }))).toBe("needs_setup");
    expect(staffAccess(PROD_REAL, REAL, staff({ twoFactorVerified: false }))).toBe("needs_code");
    expect(staffAccess(PROD_REAL, REAL, staff())).toBe("ok");
    expect(staffAccess(DEV_LOCAL, LOCAL, staff())).toBe("ok");
  });

  it("lets a demo staff account skip 2-step login only in development on localhost", () => {
    expect(staffAccess(DEV_LOCAL, LOCAL, staff({ isDemo: true, twoFactorEnabled: false }))).toBe("ok");
    // An enabled code must still be entered.
    expect(staffAccess(DEV_LOCAL, LOCAL, staff({ isDemo: true, twoFactorVerified: false }))).toBe("needs_code");
  });

  it("asks demo staff for 2-step login in production mode on the codespace", () => {
    expect(staffAccess(PROD_CODESPACE, CODESPACE, staff({ isDemo: true, twoFactorEnabled: false }))).toBe("needs_setup");
    expect(staffAccess(PROD_CODESPACE, CODESPACE, staff({ isDemo: true }))).toBe("ok");
  });

  it("never lets a demo staff account in on the permanent address, even with 2-step login", () => {
    expect(staffAccess(PROD_REAL, REAL, staff({ isDemo: true }))).toBe("demo_blocked");
    expect(staffAccess({ ...PROD_REAL, NODE_ENV: "development", DEV_SKIP_STAFF_2FA: "true" }, REAL, staff({ isDemo: true }))).toBe(
      "demo_blocked",
    );
  });
});
