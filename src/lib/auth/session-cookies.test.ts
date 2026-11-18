import { describe, expect, it } from "vitest";
import { AUTH_COOKIE_KEYS, authCookieOptions, cookieName, secureCookiesFor, sessionCookieName, staffCookieName } from "./session-cookies";

/** SECURITY_REPORT 3.5.a: "__Host-" cookie names wherever the cookies are Secure. */
describe("login cookie names", () => {
  it("uses __Host-bayit.* on https and in production builds", () => {
    expect(secureCookiesFor({ NODE_ENV: "production", BETTER_AUTH_URL: "http://localhost:4722" })).toBe(true);
    expect(secureCookiesFor({ NODE_ENV: "development", BETTER_AUTH_URL: "https://name-3000.app.github.dev" })).toBe(true);
    expect(secureCookiesFor({ NODE_ENV: "development", BETTER_AUTH_URL: "http://localhost:3000" })).toBe(false);
    expect(secureCookiesFor({ NODE_ENV: "development", NEXT_PUBLIC_SITE_URL: "HTTPS://bayit.example" })).toBe(true);
    expect(sessionCookieName(true)).toBe("__Host-bayit.session_token");
    expect(sessionCookieName(false)).toBe("bayit.session_token");
    expect(staffCookieName(true)).toBe("__Host-bayit.staff");
    expect(cookieName("state", true)).toBe("__Host-bayit.state");
  });

  it("names every login-library cookie, with Secure on and no Domain, and never the library's __Secure- prefix", () => {
    const secure = authCookieOptions(true);
    expect(secure.useSecureCookies).toBe(false);
    expect(secure.defaultCookieAttributes).toEqual({ secure: true, path: "/" });
    expect("crossSubDomainCookies" in secure).toBe(false);
    for (const key of AUTH_COOKIE_KEYS) {
      expect(secure.cookies[key].name).toBe(`__Host-bayit.${key}`);
      expect(secure.cookies[key]).not.toHaveProperty("attributes.domain");
    }
    const plain = authCookieOptions(false);
    expect(plain.defaultCookieAttributes).toBeUndefined();
    expect(plain.cookies.session_token.name).toBe("bayit.session_token");
  });
});
