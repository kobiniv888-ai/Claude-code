import { describe, expect, it } from "vitest";
import { compareCadastralCodes, isRequestDocumentKey, normalizeCadastralCode, parseVerificationDocuments } from "./documents";
import { adminNavFor, groupAdminNav, isAdminNavActive, navBadge, ADMIN_NAV } from "./nav";
import { dateParam, enumParam, pageInfo, pageParam, pageWindow, param, withParams } from "./params";
import { riskLevel } from "./risk";
import { isEmptySearch, normalizePhoneCandidates, parseUserSearch } from "./search";

describe("admin navigation", () => {
  const keys = (role: string) => adminNavFor(role).map((i) => i.key);

  it("shows ADMIN every section", () => {
    expect(keys("ADMIN")).toEqual(ADMIN_NAV.map((i) => i.key));
  });

  it("filters sections by permission", () => {
    expect(keys("MODERATOR")).toEqual(["overview", "moderation", "reports", "users", "verifications"]);
    expect(keys("SUPPORT")).toEqual(["overview", "reports", "users", "tickets"]);
    expect(keys("EDITOR")).toEqual(["overview", "content"]);
    expect(keys("USER")).toEqual(["overview"]);
  });

  it("groups sections and drops empty groups", () => {
    expect(groupAdminNav(adminNavFor("EDITOR")).map((g) => g.group)).toEqual(["operations", "content"]);
    expect(groupAdminNav(adminNavFor("ADMIN")).map((g) => g.group)).toEqual(["operations", "content", "system"]);
  });

  it("matches the active section", () => {
    expect(isAdminNavActive("/admin", "/admin")).toBe(true);
    expect(isAdminNavActive("/admin/users", "/admin")).toBe(false);
    expect(isAdminNavActive("/admin/users/abc", "/admin/users")).toBe(true);
    expect(isAdminNavActive("/admin/users-x", "/admin/users")).toBe(false);
    expect(isAdminNavActive("/admin/moderation/", "/admin/moderation")).toBe(true);
  });

  it("computes badges", () => {
    const counts = { inReview: 4, openReports: 2, activeTickets: 7, urgentTickets: 1, pendingVerifications: 0 };
    const tickets = ADMIN_NAV.find((i) => i.key === "tickets")!;
    const moderation = ADMIN_NAV.find((i) => i.key === "moderation")!;
    const users = ADMIN_NAV.find((i) => i.key === "users")!;
    expect(navBadge(tickets, counts)).toEqual({ count: 7, urgent: true });
    expect(navBadge(moderation, counts)).toEqual({ count: 4, urgent: false });
    expect(navBadge(users, counts)).toEqual({ count: 0, urgent: false });
    expect(navBadge(tickets, null)).toEqual({ count: 0, urgent: false });
  });
});

describe("risk level", () => {
  it("maps scores to levels", () => {
    expect(riskLevel(null)).toBe("none");
    expect(riskLevel(0)).toBe("low");
    expect(riskLevel(29)).toBe("low");
    expect(riskLevel(30)).toBe("medium");
    expect(riskLevel(59)).toBe("medium");
    expect(riskLevel(60)).toBe("high");
    expect(riskLevel(100)).toBe("high");
  });

  it("follows the review threshold", () => {
    expect(riskLevel(20, 15)).toBe("medium");
    expect(riskLevel(65, 70)).toBe("low");
    expect(riskLevel(70, 70)).toBe("high");
  });
});

describe("query parameters", () => {
  const params = { status: "OPEN", page: "3", bad: ["x", "y"], from: "2026-10-01", junk: "2026-13-45" };

  it("reads single values and enums", () => {
    expect(param(params, "status")).toBe("OPEN");
    expect(param(params, "bad")).toBe("x");
    expect(param(params, "missing")).toBe("");
    expect(enumParam(params, "status", ["OPEN", "RESOLVED"] as const, "RESOLVED")).toBe("OPEN");
    expect(enumParam({ status: "NOPE" }, "status", ["OPEN", "RESOLVED"] as const, "RESOLVED")).toBe("RESOLVED");
    expect(enumParam({}, "status", ["OPEN"] as const)).toBeUndefined();
  });

  it("parses pages and dates safely", () => {
    expect(pageParam(params)).toBe(3);
    expect(pageParam({ page: "-2" })).toBe(1);
    expect(pageParam({ page: "1.5" })).toBe(1);
    expect(dateParam(params, "from")?.toISOString()).toBe("2026-10-01T00:00:00.000Z");
    expect(dateParam(params, "junk")).toBeNull();
  });

  it("clamps pagination", () => {
    expect(pageInfo(0, 5, 20)).toMatchObject({ page: 1, pageCount: 1, skip: 0, hasPrev: false, hasNext: false });
    expect(pageInfo(45, 2, 20)).toMatchObject({ page: 2, pageCount: 3, skip: 20, hasPrev: true, hasNext: true });
    expect(pageInfo(45, 9, 20)).toMatchObject({ page: 3, skip: 40, hasNext: false });
  });

  it("builds query strings and resets the page on filter changes", () => {
    expect(withParams({ status: "OPEN", page: "3" }, { page: 4 })).toBe("?status=OPEN&page=4");
    expect(withParams({ status: "OPEN", page: "3" }, { reason: "SPAM" })).toBe("?status=OPEN&reason=SPAM");
    expect(withParams({ status: "OPEN" }, { status: null })).toBe("");
    expect(withParams(new URLSearchParams("a=1&page=2"), { page: 1 })).toBe("?a=1");
  });

  it("windows page numbers", () => {
    expect(pageWindow(1, 1)).toEqual([1]);
    expect(pageWindow(1, 3)).toEqual([1, 2, 3]);
    expect(pageWindow(6, 12)).toEqual([1, "gap", 5, 6, 7, "gap", 12]);
    expect(pageWindow(3, 12)).toEqual([1, 2, 3, 4, "gap", 12]);
  });
});

describe("user search", () => {
  it("recognises listing IDs", () => {
    expect(parseUserSearch("#1234").listingPublicId).toBe(1234);
    expect(parseUserSearch("ID 77").listingPublicId).toBe(77);
    expect(parseUserSearch("listing:5").listingPublicId).toBe(5);
  });

  it("recognises emails", () => {
    const terms = parseUserSearch("Dana@Example.com");
    expect(terms.email).toBe("dana@example.com");
  });

  it("normalises Georgian and Israeli phone numbers", () => {
    expect(normalizePhoneCandidates("+995 555 12 34 56")).toEqual(["+995555123456"]);
    expect(normalizePhoneCandidates("00995555123456")).toEqual(["+995555123456"]);
    expect(normalizePhoneCandidates("555 12 34 56")).toContain("+995555123456");
    expect(normalizePhoneCandidates("052-123-4567")).toContain("+972521234567");
    expect(normalizePhoneCandidates("995555123456")).toContain("+995555123456");
    expect(normalizePhoneCandidates("abc")).toEqual([]);
  });

  it("keeps partial digits and short numbers as listing IDs", () => {
    const terms = parseUserSearch("1234");
    expect(terms.listingPublicId).toBe(1234);
    expect(terms.phoneDigits).toBeNull();
    expect(parseUserSearch("55512").phoneDigits).toBe("55512");
  });

  it("treats words as names and possible ids", () => {
    expect(parseUserSearch("Dana Levi")).toMatchObject({ text: "Dana Levi", userId: null });
    expect(parseUserSearch("EZT6dE9MFlhHiCrX4RNBumoueHFUF62M").userId).toBe("EZT6dE9MFlhHiCrX4RNBumoueHFUF62M");
    expect(isEmptySearch(parseUserSearch("   "))).toBe(true);
    expect(isEmptySearch(parseUserSearch("x"))).toBe(false);
  });
});

describe("verification documents", () => {
  it("parses the documents JSON defensively", () => {
    const docs = parseVerificationDocuments([
      { key: "private/verification/u1/a.jpg", kind: "ID_FRONT", mime: "image/jpeg", bytes: 100 },
      { key: "private/verification/u1/b.pdf", kind: "WHATEVER", mime: "application/pdf", bytes: "x", name: " napr.pdf " },
      { kind: "SELFIE" },
      null,
    ]);
    expect(docs).toHaveLength(2);
    expect(docs[1]).toMatchObject({ kind: "OTHER", bytes: 0, name: "napr.pdf" });
    expect(parseVerificationDocuments("nope")).toEqual([]);
  });

  it("accepts only the request owner's verification uploads", () => {
    expect(isRequestDocumentKey("private/verification/u1/abcDEF_12.jpg", "u1")).toBe(true);
    expect(isRequestDocumentKey("private/verification/u2/abcDEF_12.jpg", "u1")).toBe(false);
    expect(isRequestDocumentKey("private/ticket/u1/abc.jpg", "u1")).toBe(false);
    expect(isRequestDocumentKey("private/verification/u1/../x.jpg", "u1")).toBe(false);
  });

  it("compares cadastral codes", () => {
    expect(normalizeCadastralCode(" 01.10.13-010 022 ")).toBe("01.10.13.010022");
    expect(compareCadastralCodes("01.10.13.010.022", "01-10-13-010-022")).toBe("match");
    expect(compareCadastralCodes("01.10.13.010.022", "01.10.13.010.023")).toBe("mismatch");
    expect(compareCadastralCodes(null, "01.10")).toBe("missing");
  });
});
