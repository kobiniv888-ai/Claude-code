import { describe, expect, it } from "vitest";
import { CONTACT_CHANGED_NOTICE_DAYS, isUpcomingForNotice, showContactChangedNotice } from "./changed";

const now = new Date("2026-11-14T10:00:00Z");
const daysAgo = (days: number) => new Date(now.getTime() - days * 24 * 3600 * 1000);
const base = { status: "CONFIRMED", checkOut: "2026-11-20", today: "2026-11-14", now };

describe("showContactChangedNotice (SECURITY_REPORT 14.3.c)", () => {
  it("shows the notice right after the change and for 7 days", () => {
    expect(CONTACT_CHANGED_NOTICE_DAYS).toBe(7);
    expect(showContactChangedNotice({ ...base, contactChangedAt: daysAgo(0) })).toBe(true);
    expect(showContactChangedNotice({ ...base, contactChangedAt: daysAgo(6.9) })).toBe(true);
    expect(showContactChangedNotice({ ...base, contactChangedAt: daysAgo(7) })).toBe(true);
  });

  it("hides it after 7 days", () => {
    expect(showContactChangedNotice({ ...base, contactChangedAt: daysAgo(7.01) })).toBe(false);
  });

  it("hides it without a change, or with a change in the future (clock skew)", () => {
    expect(showContactChangedNotice({ ...base, contactChangedAt: null })).toBe(false);
    expect(showContactChangedNotice({ ...base, contactChangedAt: daysAgo(-1) })).toBe(false);
  });

  it("hides it on cancelled or past stays", () => {
    expect(showContactChangedNotice({ ...base, status: "CANCELLED", contactChangedAt: daysAgo(1) })).toBe(false);
    expect(showContactChangedNotice({ ...base, checkOut: "2026-11-13", contactChangedAt: daysAgo(1) })).toBe(false);
  });

  it("still shows it on the check-out day", () => {
    expect(showContactChangedNotice({ ...base, checkOut: "2026-11-14", contactChangedAt: daysAgo(1) })).toBe(true);
  });
});

describe("isUpcomingForNotice", () => {
  it("emails only guests with a stay still to come", () => {
    expect(isUpcomingForNotice({ status: "CONFIRMED", checkOut: "2026-11-20" }, "2026-11-14")).toBe(true);
    expect(isUpcomingForNotice({ status: "CONFIRMED", checkOut: "2026-11-14" }, "2026-11-14")).toBe(true);
    expect(isUpcomingForNotice({ status: "CONFIRMED", checkOut: "2026-11-10" }, "2026-11-14")).toBe(false);
    expect(isUpcomingForNotice({ status: "CANCELLED", checkOut: "2026-11-20" }, "2026-11-14")).toBe(false);
  });
});
