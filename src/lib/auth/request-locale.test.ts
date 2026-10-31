import { describe, expect, it } from "vitest";
import { localeFromRequest } from "./request-locale";

function ctx(cookie: string | null, acceptLanguage?: string) {
  return {
    getCookie: (key: string) => (key === "NEXT_LOCALE" ? cookie : null),
    headers: new Headers(acceptLanguage ? { "accept-language": acceptLanguage } : {}),
  };
}

describe("localeFromRequest", () => {
  it("prefers a valid NEXT_LOCALE cookie", () => {
    expect(localeFromRequest(ctx("ka", "he-IL,he;q=0.9"))).toBe("ka");
  });

  it("falls back to the best supported Accept-Language", () => {
    expect(localeFromRequest(ctx(null, "fr-FR,fr;q=0.9,ru;q=0.8,en;q=0.5"))).toBe("ru");
    expect(localeFromRequest(ctx("xx", "he-IL"))).toBe("he");
    expect(localeFromRequest(ctx(null, "en;q=0.2,ar;q=0.9"))).toBe("ar");
  });

  it("returns null when nothing matches", () => {
    expect(localeFromRequest(ctx(null, "fr,de"))).toBeNull();
    expect(localeFromRequest(ctx(null))).toBeNull();
    expect(localeFromRequest(null)).toBeNull();
  });
});
