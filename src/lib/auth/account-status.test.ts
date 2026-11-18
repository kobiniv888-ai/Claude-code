import { describe, expect, it } from "vitest";
import { accountBlock, isAccountBlocked } from "./account-status";

const now = new Date("2026-10-31T12:00:00Z");

describe("accountBlock", () => {
  it("lets active and warned accounts in", () => {
    expect(accountBlock({ status: "ACTIVE" }, now)).toBeNull();
    expect(accountBlock({ status: "WARNED" }, now)).toBeNull();
  });

  it("blocks banned and deleted accounts", () => {
    expect(accountBlock({ status: "BANNED" }, now)).toBe("banned");
    expect(accountBlock({ status: "DELETED" }, now)).toBe("deleted");
  });

  it("blocks suspended accounts until the suspension ends", () => {
    expect(accountBlock({ status: "SUSPENDED", suspendedUntil: null }, now)).toBe("suspended");
    expect(accountBlock({ status: "SUSPENDED", suspendedUntil: new Date("2026-11-01T00:00:00Z") }, now)).toBe(
      "suspended",
    );
    expect(accountBlock({ status: "SUSPENDED", suspendedUntil: "2026-10-30T00:00:00Z" }, now)).toBeNull();
    expect(accountBlock({ status: "SUSPENDED", suspendedUntil: "not a date" }, now)).toBe("suspended");
  });

  it("isAccountBlocked mirrors accountBlock", () => {
    expect(isAccountBlocked({ status: "BANNED" }, now)).toBe(true);
    expect(isAccountBlocked({ status: "ACTIVE" }, now)).toBe(false);
  });
});

describe("sessionCreateBlock (the session.create.before hook, SECURITY_REPORT 3.4.c)", async () => {
  const { sessionCreateBlock } = await import("./account-status");
  const demo = { status: "ACTIVE", suspendedUntil: null, isDemo: true };
  const real = { status: "ACTIVE", suspendedUntil: null, isDemo: false };

  it("a demo account gets no session on the real site, nor when SITE_ENV is missing or wrong (fail closed)", () => {
    expect(sessionCreateBlock(demo, { SITE_ENV: "production" })).toBe("demo_disabled");
    expect(sessionCreateBlock(demo, {})).toBe("demo_disabled");
    expect(sessionCreateBlock(demo, { SITE_ENV: "prod" })).toBe("demo_disabled");
  });

  it("demo accounts may sign in on development and staging sites", () => {
    expect(sessionCreateBlock(demo, { SITE_ENV: "development" })).toBeNull();
    expect(sessionCreateBlock(demo, { SITE_ENV: "staging" })).toBeNull();
  });

  it("a real account signs in everywhere; blocked or missing accounts nowhere", () => {
    expect(sessionCreateBlock(real, { SITE_ENV: "production" })).toBeNull();
    expect(sessionCreateBlock({ ...real, status: "BANNED" }, { SITE_ENV: "development" })).toBe("banned");
    expect(sessionCreateBlock({ ...real, status: "DELETED" }, { SITE_ENV: "development" })).toBe("deleted");
    expect(sessionCreateBlock({ ...real, status: "SUSPENDED" }, { SITE_ENV: "production" })).toBe("suspended");
    expect(sessionCreateBlock(null, { SITE_ENV: "development" })).toBe("deleted");
  });
});
