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
