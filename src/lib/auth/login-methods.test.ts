import { describe, expect, it } from "vitest";
import { loginMethodsStatus, loginMethodsWarning } from "./login-methods";
import { accountPhoneRow, isHostAccount, mayOfferPhoneCheck } from "./phone-check-policy";

describe("loginMethodsStatus / loginMethodsWarning", () => {
  it("production without Google keys and without Resend: nobody can log in", () => {
    const env = { NODE_ENV: "production" };
    expect(loginMethodsStatus(env)).toEqual({ google: false, emailCodes: false, noneInProduction: true });
    expect(loginMethodsWarning(env)).toContain("NO LOGIN METHOD");
  });

  it("either Resend or both Google keys is enough", () => {
    expect(loginMethodsStatus({ NODE_ENV: "production", RESEND_API_KEY: "re_123" }).noneInProduction).toBe(false);
    expect(
      loginMethodsStatus({ NODE_ENV: "production", GOOGLE_CLIENT_ID: "id", GOOGLE_CLIENT_SECRET: "secret" }).noneInProduction,
    ).toBe(false);
    expect(loginMethodsWarning({ NODE_ENV: "production", RESEND_API_KEY: "re_123" })).toBeNull();
  });

  it("half a Google setup or blank values do not count", () => {
    expect(loginMethodsStatus({ NODE_ENV: "production", GOOGLE_CLIENT_ID: "id" }).noneInProduction).toBe(true);
    expect(loginMethodsStatus({ NODE_ENV: "production", RESEND_API_KEY: "   " }).noneInProduction).toBe(true);
  });

  it("development never warns (codes show on screen there)", () => {
    expect(loginMethodsStatus({ NODE_ENV: "development" }).noneInProduction).toBe(false);
    expect(loginMethodsWarning({ NODE_ENV: "test" })).toBeNull();
  });
});

describe("the paid SMS phone check is offered only where the founder allowed it", () => {
  it("booking review and the post form: always", () => {
    expect(mayOfferPhoneCheck("booking", { isHost: false })).toBe(true);
    expect(mayOfferPhoneCheck("post", { isHost: false })).toBe(true);
  });

  it("account pages: hosts only", () => {
    expect(mayOfferPhoneCheck("account", { isHost: true })).toBe(true);
    expect(mayOfferPhoneCheck("account", { isHost: false })).toBe(false);
  });

  it("the account phone row: verified stays (read-only), a guest gets no row, a host gets the offer", () => {
    expect(accountPhoneRow({ phoneVerified: true, isHost: false })).toBe("verified");
    expect(accountPhoneRow({ phoneVerified: true, isHost: true })).toBe("verified");
    expect(accountPhoneRow({ phoneVerified: false, isHost: false })).toBeNull();
    expect(accountPhoneRow({ phoneVerified: false, isHost: true })).toBe("offer");
  });

  it("a host is anyone with a listing, drafts included", () => {
    expect(isHostAccount(0)).toBe(false);
    expect(isHostAccount(1)).toBe(true);
    expect(isHostAccount(Number.NaN)).toBe(false);
  });
});

describe("the account overview's verification card (verificationProgress)", () => {
  it("a guest without a verified phone gets no phone row; a host and a verified phone do", async () => {
    const { verificationProgress } = await import("@/lib/account/verification");
    const base = { idVerified: false, idLatest: null, hasListings: false, ownerVerifiedListings: 0, ownershipLatest: null };
    expect(verificationProgress({ ...base, phoneVerified: false, isHost: false })).toMatchObject({ phone: null, total: 1 });
    expect(verificationProgress({ ...base, phoneVerified: false, isHost: true })).toMatchObject({ phone: "notStarted", total: 2 });
    expect(verificationProgress({ ...base, phoneVerified: true, isHost: false })).toMatchObject({ phone: "verified", done: 1, total: 2 });
  });
});
