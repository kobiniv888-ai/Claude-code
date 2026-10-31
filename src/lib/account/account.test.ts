import { describe, expect, it } from "vitest";
import { accountNavItems, activeAccountNav, isFullWidthAccountPage } from "./nav";
import {
  canRenewLive,
  countsByFilter,
  daysUntil,
  isExpiringSoon,
  ownerActionsFor,
  parseListingFilter,
  statusesForFilter,
} from "./listing-status";
import {
  confirmationMatches,
  contactEmailSchema,
  deletedEmailFor,
  NOTIFICATION_DEFAULTS,
  ownAvatarKey,
  parseNotificationPrefs,
  profileSchema,
  remainingSignInMethods,
} from "./settings-schema";
import {
  badgeState,
  idVerificationSchema,
  isValidCadastralCode,
  latestRequest,
  normalizeCadastral,
  ownershipVerificationSchema,
  verificationProgress,
  type RequestSummary,
} from "./verification";

const now = new Date("2026-10-31T12:00:00Z");
const inDays = (d: number) => new Date(now.getTime() + d * 86_400_000);
const flags = { chat: false, savedSearchAlerts: false, reviews: false };

describe("account nav", () => {
  it("hides Phase 2 sections until their flag is on", () => {
    const keys = accountNavItems(flags).map((i) => i.key);
    expect(keys).toEqual(["overview", "listings", "favorites", "compare", "tickets", "verification", "settings"]);
    const withChat = accountNavItems({ ...flags, chat: true, reviews: true }).map((i) => i.key);
    expect(withChat).toContain("messages");
    expect(withChat).toContain("reviews");
    expect(withChat).not.toContain("savedSearches");
  });

  it("finds the active section by the longest prefix", () => {
    const items = accountNavItems(flags);
    expect(activeAccountNav("/account", items)).toBe("overview");
    expect(activeAccountNav("/account/", items)).toBe("overview");
    expect(activeAccountNav("/account/listings/abc/stats", items)).toBe("listings");
    expect(activeAccountNav("/account/tickets/12?x=1", items)).toBe("tickets");
    expect(activeAccountNav("/accounting", items)).toBeNull();
  });

  it("lets the listing editor use the full width", () => {
    expect(isFullWidthAccountPage("/account/listings/abc/edit")).toBe(true);
    expect(isFullWidthAccountPage("/account/listings/abc/stats")).toBe(false);
  });
});

describe("my listings rules", () => {
  it("parses filter tabs safely", () => {
    expect(parseListingFilter("live")).toBe("live");
    expect(parseListingFilter(["drafts"])).toBe("drafts");
    expect(parseListingFilter("DELETED")).toBe("all");
    expect(statusesForFilter("closed")).toEqual(["RENTED", "SOLD"]);
    expect(statusesForFilter("all")).not.toContain("DELETED");
  });

  it("counts per tab", () => {
    const counts = countsByFilter({ LIVE: 2, SOLD: 1, RENTED: 1, HIDDEN: 1, DELETED: 5 });
    expect(counts).toMatchObject({ all: 5, live: 2, closed: 2, other: 1, drafts: 0 });
  });

  it("counts days and expiring listings", () => {
    expect(daysUntil(inDays(2.2), now)).toBe(3);
    expect(daysUntil(inDays(-1), now)).toBe(0);
    expect(daysUntil(null, now)).toBeNull();
    expect(isExpiringSoon({ status: "LIVE", expiresAt: inDays(5) }, now)).toBe(true);
    expect(isExpiringSoon({ status: "LIVE", expiresAt: inDays(9) }, now)).toBe(false);
    expect(isExpiringSoon({ status: "EXPIRED", expiresAt: inDays(1) }, now)).toBe(false);
    expect(isExpiringSoon({ status: "LIVE", expiresAt: inDays(-1) }, now)).toBe(false);
  });

  it("offers only the actions the lifecycle allows", () => {
    const base = { dealType: "SHORT_STAY" as const, publishedAt: inDays(-10), expiresAt: inDays(30) };
    expect(ownerActionsFor({ ...base, status: "DRAFT", publishedAt: null }, { now })).toEqual(["continue", "delete"]);
    expect(ownerActionsFor({ ...base, status: "LIVE" }, { now })).toEqual(["edit", "view", "stats", "pause", "markRented", "delete"]);
    expect(ownerActionsFor({ ...base, status: "LIVE", expiresAt: inDays(2) }, { now })).toContain("renew");
    expect(ownerActionsFor({ ...base, status: "LIVE" }, { now, bumpEnabled: true })).toContain("bump");
    expect(ownerActionsFor({ ...base, status: "PAUSED" }, { now })).toEqual(["edit", "stats", "unpause", "markRented", "delete"]);
    expect(ownerActionsFor({ ...base, status: "EXPIRED", dealType: "SALE" }, { now })).toEqual(["edit", "stats", "renew", "markSold", "delete"]);
    expect(ownerActionsFor({ ...base, status: "RENTED" }, { now })).toEqual(["edit", "stats", "renew", "delete"]);
    expect(ownerActionsFor({ ...base, status: "IN_REVIEW" }, { now })).toEqual(["edit", "stats", "delete"]);
    expect(ownerActionsFor({ ...base, status: "DELETED" }, { now })).toEqual([]);
  });

  it("renews a live listing only in its last days", () => {
    expect(canRenewLive(inDays(10), now)).toBe(false);
    expect(canRenewLive(inDays(1), now)).toBe(true);
    expect(canRenewLive(null, now)).toBe(false);
  });
});

describe("verification rules", () => {
  const file = { key: "private/verification/u1/abc.jpg", mime: "image/jpeg" as const, bytes: 1000 };

  it("needs a photo selfie, an optional back side", () => {
    expect(idVerificationSchema.safeParse({ front: file, selfie: file }).success).toBe(true);
    expect(idVerificationSchema.safeParse({ front: file, selfie: { ...file, mime: "application/pdf" } }).success).toBe(false);
    expect(idVerificationSchema.safeParse({ front: file }).success).toBe(false);
  });

  it("normalizes and checks cadastral codes", () => {
    expect(normalizeCadastral(" 01.10-14 003/012 ")).toBe("01.10.14.003.012");
    expect(isValidCadastralCode("01.10.14.003.012")).toBe(true);
    expect(isValidCadastralCode("05.24.04.012")).toBe(true);
    expect(isValidCadastralCode("hello")).toBe(false);
    const parsed = ownershipVerificationSchema.safeParse({ listingId: "l1", extract: file, cadastralCode: "01-10-14-003-012" });
    expect(parsed.success && parsed.data.cadastralCode).toBe("01.10.14.003.012");
  });

  it("computes badge states and progress", () => {
    const req = (type: RequestSummary["type"], status: RequestSummary["status"], day: number, listingId: string | null = null): RequestSummary => ({
      id: `${type}${day}`,
      type,
      status,
      listingId,
      createdAt: inDays(day),
      reviewedAt: null,
      decisionReason: null,
    });
    const requests = [req("ID", "REJECTED", -5), req("ID", "PENDING", -1), req("OWNERSHIP", "REJECTED", -2, "l1")];
    expect(latestRequest(requests, "ID")?.status).toBe("PENDING");
    expect(latestRequest(requests, "OWNERSHIP", "l2")).toBeNull();
    expect(badgeState(false, { status: "NEEDS_MORE_INFO" })).toBe("actionNeeded");
    expect(badgeState(true, null)).toBe("verified");
    const progress = verificationProgress({
      phoneVerified: true,
      idVerified: false,
      idLatest: { status: "PENDING" },
      hasListings: false,
      ownerVerifiedListings: 0,
      ownershipLatest: null,
    });
    expect(progress).toEqual({ phone: "verified", id: "pending", owner: null, done: 1, total: 2 });
  });
});

describe("settings rules", () => {
  it("requires a business name for business accounts", () => {
    const base = { name: "Dana", spokenLanguages: ["he", "he", "en"], keepsShabbat: true, accountType: "PRIVATE" as const };
    const parsed = profileSchema.safeParse(base);
    expect(parsed.success && parsed.data.spokenLanguages).toEqual(["he", "en"]);
    expect(profileSchema.safeParse({ ...base, accountType: "BUSINESS" }).success).toBe(false);
    expect(profileSchema.safeParse({ ...base, accountType: "BUSINESS", businessName: "Hotel" }).success).toBe(true);
    expect(profileSchema.safeParse({ ...base, name: " " }).success).toBe(false);
  });

  it("accepts an empty or valid contact email", () => {
    expect(contactEmailSchema.parse({ contactEmail: "" }).contactEmail).toBeNull();
    expect(contactEmailSchema.parse({ contactEmail: " Dana@Example.com " }).contactEmail).toBe("dana@example.com");
    expect(contactEmailSchema.safeParse({ contactEmail: "nope" }).success).toBe(false);
  });

  it("reads notification preferences with defaults", () => {
    expect(parseNotificationPrefs(null)).toEqual(NOTIFICATION_DEFAULTS);
    expect(parseNotificationPrefs({ email: { listing: false, marketing: true } }).email).toEqual({
      listing: false,
      tickets: true,
      messages: true,
      marketing: true,
    });
    expect(parseNotificationPrefs([1, 2]).email.marketing).toBe(false);
  });

  it("matches typed confirmations loosely", () => {
    expect(confirmationMatches("  delete ", ["DELETE"])).toBe(true);
    expect(confirmationMatches("מחק", ["מחק", "DELETE"])).toBe(true);
    expect(confirmationMatches("", ["DELETE"])).toBe(false);
    expect(confirmationMatches("del", ["DELETE"])).toBe(false);
  });

  it("finds only the user's own avatar key", () => {
    expect(ownAvatarKey("/api/media/avatars/u1-abc_d.webp", "u1")).toBe("avatars/u1-abc_d.webp");
    expect(ownAvatarKey("https://cdn.example.com/avatars/u1-x.webp?v=2", "u1")).toBe("avatars/u1-x.webp");
    expect(ownAvatarKey("/api/media/avatars/u2-abc.webp", "u1")).toBeNull();
    expect(ownAvatarKey("https://lh3.googleusercontent.com/a/photo", "u1")).toBeNull();
    expect(deletedEmailFor("u1")).toBe("deleted-u1@deleted.bayit.invalid");
  });

  it("never removes the last way to sign in", () => {
    expect(remainingSignInMethods({ hasPhoneLogin: false, hasPasswordLogin: false, linked: ["google"] }, "google")).toBe(0);
    expect(remainingSignInMethods({ hasPhoneLogin: true, hasPasswordLogin: false, linked: ["google"] }, "google")).toBe(1);
    expect(remainingSignInMethods({ hasPhoneLogin: false, hasPasswordLogin: false, linked: ["google", "apple"] }, "apple")).toBe(1);
  });
});
