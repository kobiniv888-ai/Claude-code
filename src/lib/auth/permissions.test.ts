import { describe, expect, it } from "vitest";
import { PERMISSIONS, can, isStaffRole, permissionsFor } from "./permissions";

describe("permissions", () => {
  it("gives ADMIN every permission", () => {
    for (const permission of PERMISSIONS) expect(can("ADMIN", permission)).toBe(true);
  });

  it("gives regular users and unknown roles nothing", () => {
    for (const permission of PERMISSIONS) {
      expect(can("USER", permission)).toBe(false);
      expect(can("OWNER", permission)).toBe(false);
      expect(can(null, permission)).toBe(false);
      expect(can(undefined, permission)).toBe(false);
    }
  });

  it("matches the MODERATOR column of the conventions table", () => {
    expect(permissionsFor("MODERATOR").sort()).toEqual(
      ["moderation", "reports", "reports.view", "users.view", "users.manage", "verifications"].sort(),
    );
  });

  it("lets SUPPORT view reports but not handle them", () => {
    expect(can("SUPPORT", "reports.view")).toBe(true);
    expect(can("SUPPORT", "reports")).toBe(false);
    expect(can("SUPPORT", "users.view")).toBe(true);
    expect(can("SUPPORT", "users.manage")).toBe(false);
    expect(can("SUPPORT", "tickets")).toBe(true);
    expect(can("SUPPORT", "moderation")).toBe(false);
  });

  it("limits EDITOR to content", () => {
    expect(permissionsFor("EDITOR")).toEqual(["content"]);
  });

  it("keeps settings, roles and the audit log for ADMIN only", () => {
    for (const role of ["MODERATOR", "SUPPORT", "EDITOR"] as const) {
      expect(can(role, "settings")).toBe(false);
      expect(can(role, "roles")).toBe(false);
      expect(can(role, "audit")).toBe(false);
    }
  });

  it("recognizes staff roles", () => {
    expect(isStaffRole("ADMIN")).toBe(true);
    expect(isStaffRole("MODERATOR")).toBe(true);
    expect(isStaffRole("SUPPORT")).toBe(true);
    expect(isStaffRole("EDITOR")).toBe(true);
    expect(isStaffRole("USER")).toBe(false);
    expect(isStaffRole("admin")).toBe(false);
    expect(isStaffRole(undefined)).toBe(false);
  });
});
