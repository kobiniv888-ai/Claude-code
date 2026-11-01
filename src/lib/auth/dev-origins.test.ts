import { describe, expect, it } from "vitest";
import { extraAllowedHosts, extraTrustedOrigins } from "./dev-origins";

const codespace = {
  CODESPACES: "true",
  GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN: "app.github.dev",
};

describe("extraTrustedOrigins", () => {
  it("trusts localhost and the forwarded Codespaces addresses in development", () => {
    const origins = extraTrustedOrigins({ NODE_ENV: "development", ...codespace });
    expect(origins).toEqual(
      expect.arrayContaining([
        "http://localhost:3000",
        "https://localhost:3000",
        "https://*.app.github.dev",
      ]),
    );
  });

  it("keeps trusting the Codespace for `npm start` inside it", () => {
    const origins = extraTrustedOrigins({ NODE_ENV: "production", ...codespace });
    expect(origins).toContain("https://localhost:3000");
    expect(origins).toContain("https://*.app.github.dev");
  });

  it("adds nothing in a real production deployment", () => {
    expect(extraTrustedOrigins({ NODE_ENV: "production" })).toEqual([]);
    // The forwarding domain alone (without CODESPACES=true) is not enough.
    expect(
      extraTrustedOrigins({ NODE_ENV: "production", GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN: "app.github.dev" }),
    ).toEqual([]);
  });

  it("adds EXTRA_ALLOWED_ORIGINS as origins (bare hosts over https and http)", () => {
    const origins = extraTrustedOrigins({
      NODE_ENV: "production",
      EXTRA_ALLOWED_ORIGINS: " my-tunnel.example.com , https://*.ngrok.app/ ",
    });
    expect(origins).toEqual(["https://my-tunnel.example.com", "http://my-tunnel.example.com", "https://*.ngrok.app"]);
  });

  it("includes $PORT next to 3000", () => {
    expect(extraTrustedOrigins({ NODE_ENV: "development", PORT: "3903" })).toContain("http://localhost:3903");
  });
});

describe("extraAllowedHosts (next.config.ts)", () => {
  it("lists hosts, not origins", () => {
    expect(extraAllowedHosts({ ...codespace, EXTRA_ALLOWED_ORIGINS: "https://a.example.com:8443/x,b.example.com" })).toEqual([
      "*.app.github.dev",
      "localhost:3000",
      "a.example.com",
      "b.example.com",
    ]);
    expect(extraAllowedHosts({})).toEqual([]);
  });
});
