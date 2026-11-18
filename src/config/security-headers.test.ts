/**
 * The headers next.config.ts sends on every response (SECURITY_REPORT 10.1.b, 10.3.a–d), checked
 * on the resolved config itself.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { SECURITY_HEADERS } from "./security-headers";

afterEach(() => {
  vi.unstubAllEnvs();
});

const header = (key: string) => SECURITY_HEADERS.find((h) => h.key === key)?.value;

describe("security headers", () => {
  it("has the checklist's values", () => {
    expect(header("Strict-Transport-Security")).toBe("max-age=63072000; includeSubDomains; preload");
    expect(header("X-Content-Type-Options")).toBe("nosniff");
    expect(header("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(header("X-Frame-Options")).toBe("DENY");
    const permissions = header("Permissions-Policy")!;
    for (const rule of ["camera=()", "microphone=()", "payment=()", "geolocation=(self)"]) expect(permissions).toContain(rule);
    // 10.3.d: same-origin, not same-origin-allow-popups.
    expect(header("Cross-Origin-Opener-Policy")).toBe("same-origin");
  });

  it("are sent on every path by the resolved next.config.ts", async () => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_MEDIA_BASE_URL", "");
    const config = (await import("../../next.config")).default;
    const rules = await config.headers!();
    const all = rules.find((rule) => rule.source === "/:path*");
    expect(all?.headers).toEqual([...SECURITY_HEADERS]);
  });
});
