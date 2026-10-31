import { describe, expect, it } from "vitest";
import { DEFAULT_AFTER_LOGIN_PATH, safeNextPath, withNext } from "./next-path";

describe("safeNextPath", () => {
  it("keeps relative same-site paths with query and hash", () => {
    expect(safeNextPath("/listing/12-flat?photo=3#map")).toBe("/listing/12-flat?photo=3#map");
    expect(safeNextPath("/account/favorites")).toBe("/account/favorites");
    expect(safeNextPath("/")).toBe("/");
  });

  it("strips a locale prefix (navigation adds the current one)", () => {
    expect(safeNextPath("/he/account")).toBe("/account");
    expect(safeNextPath("/ka/search?city=batumi")).toBe("/search?city=batumi");
    expect(safeNextPath("/en")).toBe("/");
    // Only real locales are stripped.
    expect(safeNextPath("/help/faq")).toBe("/help/faq");
  });

  it("rejects absolute and protocol-relative URLs", () => {
    expect(safeNextPath("https://evil.example/account")).toBe(DEFAULT_AFTER_LOGIN_PATH);
    expect(safeNextPath("//evil.example")).toBe(DEFAULT_AFTER_LOGIN_PATH);
    expect(safeNextPath("/\\evil.example")).toBe(DEFAULT_AFTER_LOGIN_PATH);
    expect(safeNextPath("\\\\evil.example")).toBe(DEFAULT_AFTER_LOGIN_PATH);
    expect(safeNextPath("javascript:alert(1)")).toBe(DEFAULT_AFTER_LOGIN_PATH);
    expect(safeNextPath("account")).toBe(DEFAULT_AFTER_LOGIN_PATH);
  });

  it("rejects control characters and backslashes anywhere", () => {
    expect(safeNextPath("/\t/evil.example")).toBe(DEFAULT_AFTER_LOGIN_PATH);
    expect(safeNextPath("/account\n")).toBe("/account"); // trailing whitespace is trimmed
    expect(safeNextPath("/acc\u0000ount")).toBe(DEFAULT_AFTER_LOGIN_PATH);
    expect(safeNextPath("/a\\b")).toBe(DEFAULT_AFTER_LOGIN_PATH);
  });

  it("keeps encoded slashes inside the path (same origin)", () => {
    expect(safeNextPath("/%2F%2Fevil.example")).toBe("/%2F%2Fevil.example");
  });

  it("refuses API routes and the auth pages themselves", () => {
    expect(safeNextPath("/api/auth/sign-out")).toBe(DEFAULT_AFTER_LOGIN_PATH);
    expect(safeNextPath("/he/login?next=/account")).toBe(DEFAULT_AFTER_LOGIN_PATH);
    expect(safeNextPath("/two-factor/setup")).toBe(DEFAULT_AFTER_LOGIN_PATH);
    expect(safeNextPath("/verify-phone")).toBe(DEFAULT_AFTER_LOGIN_PATH);
    expect(safeNextPath("/login-help")).toBe("/login-help");
  });

  it("handles missing, non-string, array and oversized values", () => {
    expect(safeNextPath(undefined)).toBe(DEFAULT_AFTER_LOGIN_PATH);
    expect(safeNextPath(null)).toBe(DEFAULT_AFTER_LOGIN_PATH);
    expect(safeNextPath(42)).toBe(DEFAULT_AFTER_LOGIN_PATH);
    expect(safeNextPath(["/account/listings", "/x"])).toBe("/account/listings");
    expect(safeNextPath(`/${"a".repeat(2000)}`)).toBe(DEFAULT_AFTER_LOGIN_PATH);
    expect(safeNextPath("", "/fallback")).toBe("/fallback");
  });
});

describe("withNext", () => {
  it("adds a safe next parameter", () => {
    expect(withNext("/login", "/he/post")).toEqual({ pathname: "/login", query: { next: "/post" } });
  });

  it("drops unsafe or empty next values", () => {
    expect(withNext("/login", "https://evil.example")).toEqual({ pathname: "/login" });
    expect(withNext("/login", undefined)).toEqual({ pathname: "/login" });
  });
});
