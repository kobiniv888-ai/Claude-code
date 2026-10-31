import { describe, expect, it } from "vitest";
import { countAutoHideReports, isTrustedReporter, type ReportVote } from "./auto-hide";

const now = new Date("2026-10-31T12:00:00Z");
const DAY = 24 * 3600 * 1000;
const opts = { now, newAccountDays: 7 };

function vote(
  id: string | null,
  reporter: Partial<NonNullable<ReportVote["reporter"]>> | null = {},
): ReportVote {
  return {
    reporterId: id,
    reporter:
      reporter === null
        ? null
        : {
            createdAt: new Date(now.getTime() - 30 * DAY),
            phoneNumberVerified: false,
            status: "ACTIVE",
            deletedAt: null,
            devices: [`device-${id}`],
            ...reporter,
          },
  };
}

describe("isTrustedReporter", () => {
  it("accepts accounts older than newAccountDays or with a verified phone", () => {
    const base = vote("a").reporter!;
    expect(isTrustedReporter(base, now, 7)).toBe(true);
    expect(isTrustedReporter({ ...base, createdAt: new Date(now.getTime() - 2 * DAY) }, now, 7)).toBe(false);
    expect(isTrustedReporter({ ...base, createdAt: new Date(now.getTime() - 2 * DAY), phoneNumberVerified: true }, now, 7)).toBe(true);
    expect(isTrustedReporter({ ...base, createdAt: new Date(now.getTime() - 7 * DAY) }, now, 7)).toBe(true);
  });

  it("ignores suspended, banned and deleted accounts", () => {
    const base = { ...vote("a").reporter!, phoneNumberVerified: true };
    expect(isTrustedReporter({ ...base, status: "WARNED" }, now, 7)).toBe(true);
    expect(isTrustedReporter({ ...base, status: "SUSPENDED" }, now, 7)).toBe(false);
    expect(isTrustedReporter({ ...base, status: "BANNED" }, now, 7)).toBe(false);
    expect(isTrustedReporter({ ...base, deletedAt: now }, now, 7)).toBe(false);
  });
});

describe("countAutoHideReports", () => {
  it("counts one report per trusted account on its own device", () => {
    expect(countAutoHideReports([vote("a"), vote("b"), vote("c")], opts)).toBe(3);
  });

  it("does not count anonymous reports, new unverified accounts or the same account twice", () => {
    const fresh = { createdAt: new Date(now.getTime() - DAY) };
    const reports = [vote(null), vote("x", null), vote("a"), vote("a"), vote("new1", fresh), vote("new2", fresh)];
    expect(countAutoHideReports(reports, opts)).toBe(1);
    // A new account with a verified phone counts.
    expect(countAutoHideReports([...reports, vote("new3", { ...fresh, phoneNumberVerified: true })], opts)).toBe(2);
  });

  it("counts accounts that share a device once, and ignores accounts without a known device", () => {
    const shared = ["phone-1"];
    const reports = [
      vote("a", { devices: shared }),
      vote("b", { devices: ["laptop-b", "phone-1"] }),
      vote("c", { devices: shared }),
      vote("d", { devices: [] }),
      vote("e"),
    ];
    expect(countAutoHideReports(reports, opts)).toBe(2);
  });
});
