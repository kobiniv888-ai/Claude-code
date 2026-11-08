import { describe, expect, it } from "vitest";
import {
  STAFF_IDLE_LIMIT_MS,
  STAFF_MARKER_REFRESH_MS,
  isCrossSiteRequest,
  isStaffSessionIdle,
  nextStaffMarkerExpiry,
  shouldRefreshStaffMarker,
  staffActiveKey,
} from "./staff-session-rules";

/** SECURITY_REPORT 3.5.c (D9 a): 12 idle hours for staff sessions; 3.5.a: the Strict cookie. */
describe("staff idle limit", () => {
  const now = new Date("2026-11-08T12:00:00Z");

  it("is 12 hours, kept in a Verification marker per session", () => {
    expect(STAFF_IDLE_LIMIT_MS).toBe(12 * 3600 * 1000);
    expect(staffActiveKey("s1")).toBe("staff-active:s1");
    expect(nextStaffMarkerExpiry(now).toISOString()).toBe("2026-11-09T00:00:00.000Z");
  });

  it("counts a missing or run-out marker as idle (fail closed)", () => {
    expect(isStaffSessionIdle(null, now)).toBe(true);
    expect(isStaffSessionIdle(undefined, now)).toBe(true);
    expect(isStaffSessionIdle(new Date(now.getTime() - 1), now)).toBe(true);
    expect(isStaffSessionIdle(now, now)).toBe(true);
    expect(isStaffSessionIdle(new Date(now.getTime() + 1000), now)).toBe(false);
  });

  it("moves the marker at most every 5 minutes of use", () => {
    const fresh = nextStaffMarkerExpiry(now);
    expect(shouldRefreshStaffMarker(fresh, now)).toBe(false);
    expect(shouldRefreshStaffMarker(fresh, new Date(now.getTime() + STAFF_MARKER_REFRESH_MS - 1000))).toBe(false);
    expect(shouldRefreshStaffMarker(fresh, new Date(now.getTime() + STAFF_MARKER_REFRESH_MS + 1000))).toBe(true);
  });

  it("tells a request started by another site (the Strict cookie is held back there)", () => {
    expect(isCrossSiteRequest("cross-site")).toBe(true);
    expect(isCrossSiteRequest(" Cross-Site ")).toBe(true);
    for (const value of ["same-origin", "same-site", "none", null, undefined, ""]) expect(isCrossSiteRequest(value)).toBe(false);
  });
});
