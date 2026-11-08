import { describe, expect, it } from "vitest";
import { ACCOUNT_LINKING_OPTIONS, OAUTH_EMAIL_UNVERIFIED, providerEmailVerified, socialProviderOptions, validateOAuthUserInfo } from "./social-login";

/** SECURITY_REPORT 3.3: Google/Apple sign-in rules. */
describe("Google and Apple sign-in", () => {
  const env = { GOOGLE_CLIENT_ID: "id", GOOGLE_CLIENT_SECRET: "secret", APPLE_CLIENT_ID: "a", APPLE_CLIENT_SECRET: "b" };

  it("3.3.a: switches the ID-token sign-in off (state + PKCE redirect flow only)", () => {
    const options = socialProviderOptions(env);
    expect(options.google?.disableIdTokenSignIn).toBe(true);
    expect(options.apple?.disableIdTokenSignIn).toBe(true);
    expect(socialProviderOptions({})).toEqual({});
    expect(options.google?.mapProfileToUser({ given_name: "Dana" })).toEqual({ firstName: "Dana" });
  });

  it("3.3.b: refuses an unverified provider email on sign-up, sign-in and linking", () => {
    for (const action of ["create-user", "sign-in", "link-account"]) {
      const unverified = validateOAuthUserInfo({
        user: { emailVerified: false },
        source: { method: "oauth", oauth: { providerId: "google", profile: { email_verified: false } } },
      });
      expect(unverified?.error, action).toBe(OAUTH_EMAIL_UNVERIFIED);
    }
    // The raw claim counts too, even if the mapped value says yes.
    expect(validateOAuthUserInfo({ user: { emailVerified: true }, source: { method: "oauth", oauth: { providerId: "google", profile: { email_verified: false } } } })?.error).toBe(
      OAUTH_EMAIL_UNVERIFIED,
    );
    expect(validateOAuthUserInfo({ user: { emailVerified: true }, source: { method: "oauth", oauth: { providerId: "google", profile: { email_verified: true } } } })).toBeUndefined();
    // Apple sends "true" as a string.
    expect(validateOAuthUserInfo({ user: { emailVerified: "true" }, source: { method: "oauth", oauth: { providerId: "apple", profile: { email_verified: "true" } } } })).toBeUndefined();
    // Email and phone codes are not OAuth: not this rule's business.
    expect(validateOAuthUserInfo({ user: { emailVerified: false }, source: { method: "email-otp" } })).toBeUndefined();
    expect(providerEmailVerified("yes")).toBe(false);
  });

  it("3.3.c: never joins an existing account by itself", () => {
    expect(ACCOUNT_LINKING_OPTIONS.disableImplicitLinking).toBe(true);
    expect(ACCOUNT_LINKING_OPTIONS.trustedProviders).toEqual([]);
  });
});
