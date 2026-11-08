import { describe, expect, it } from "vitest";
import { extraAllowedHosts, extraTrustedOrigins } from "./dev-origins";

const codespace = {
  SITE_ENV: "development",
  CODESPACES: "true",
  CODESPACE_NAME: "fluffy-train-4205",
  GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN: "app.github.dev",
};

describe("extraTrustedOrigins", () => {
  it("trusts localhost and THIS codespace's forwarded address in development", () => {
    const origins = extraTrustedOrigins({ NODE_ENV: "development", ...codespace });
    expect(origins).toEqual(
      expect.arrayContaining(["http://localhost:3000", "https://localhost:3000", "https://fluffy-train-4205-3000.app.github.dev"]),
    );
  });

  it("never trusts every codespace on GitHub (no *.app.github.dev wildcard, SECURITY_REPORT 2.2.i)", () => {
    const origins = extraTrustedOrigins({ NODE_ENV: "development", ...codespace });
    expect(origins.some((origin) => origin.includes("*"))).toBe(false);
    // Without the codespace's own name: no forwarded address at all.
    expect(extraTrustedOrigins({ NODE_ENV: "production", ...codespace, CODESPACE_NAME: "" }).some((o) => o.includes("app.github.dev"))).toBe(false);
  });

  it("keeps trusting the Codespace for `npm start` inside it", () => {
    const origins = extraTrustedOrigins({ NODE_ENV: "production", ...codespace });
    expect(origins).toContain("https://localhost:3000");
    expect(origins).toContain("https://fluffy-train-4205-3000.app.github.dev");
  });

  it("adds nothing on the real site (SITE_ENV=production, or SITE_ENV missing), even inside a codespace", () => {
    expect(extraTrustedOrigins({ NODE_ENV: "production", SITE_ENV: "production" })).toEqual([]);
    expect(extraTrustedOrigins({ NODE_ENV: "production", ...codespace, SITE_ENV: "production" })).toEqual([]);
    expect(extraTrustedOrigins({ NODE_ENV: "development", ...codespace, SITE_ENV: undefined })).toEqual([]);
    // The forwarding domain alone (without CODESPACES=true) is not enough.
    expect(
      extraTrustedOrigins({ NODE_ENV: "production", SITE_ENV: "development", GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN: "app.github.dev" }),
    ).toEqual([]);
  });

  it("adds EXTRA_ALLOWED_ORIGINS as origins (bare hosts over https and http)", () => {
    const origins = extraTrustedOrigins({
      NODE_ENV: "production",
      SITE_ENV: "staging",
      EXTRA_ALLOWED_ORIGINS: " my-tunnel.example.com , https://*.ngrok.app/ ",
    });
    expect(origins).toEqual(["https://my-tunnel.example.com", "http://my-tunnel.example.com", "https://*.ngrok.app"]);
  });

  it("includes $PORT next to 3000", () => {
    expect(extraTrustedOrigins({ NODE_ENV: "development", SITE_ENV: "development", PORT: "3903" })).toContain("http://localhost:3903");
    expect(extraTrustedOrigins({ NODE_ENV: "development", ...codespace, PORT: "3903" })).toContain("https://fluffy-train-4205-3903.app.github.dev");
  });
});

describe("extraAllowedHosts (next.config.ts)", () => {
  it("lists hosts, not origins: this codespace only", () => {
    expect(extraAllowedHosts({ ...codespace, EXTRA_ALLOWED_ORIGINS: "https://a.example.com:8443/x,b.example.com" })).toEqual([
      "fluffy-train-4205-3000.app.github.dev",
      "localhost:3000",
      "a.example.com",
      "b.example.com",
    ]);
    expect(extraAllowedHosts({})).toEqual([]);
  });

  it("no codespace hosts on the real site", () => {
    expect(extraAllowedHosts({ ...codespace, SITE_ENV: "production" })).toEqual([]);
  });
});
