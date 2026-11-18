import { describe, expect, it } from "vitest";
import { absoluteUrl, isPermanentHost, isPermanentSiteUrl, siteUrl, siteUrlProblem, siteUrlWarning } from "./site-url";

const CODESPACE = "https://didactic-disco-abc123-3000.app.github.dev";

describe("siteUrl", () => {
  it("prefers SITE_URL, then NEXT_PUBLIC_SITE_URL, then localhost", () => {
    expect(siteUrl({ SITE_URL: "https://bayit.ge/", NEXT_PUBLIC_SITE_URL: CODESPACE })).toBe("https://bayit.ge");
    expect(siteUrl({ NEXT_PUBLIC_SITE_URL: `${CODESPACE}/` })).toBe(CODESPACE);
    expect(siteUrl({})).toBe("http://localhost:3000");
  });
  it("ignores values that are not http(s) URLs", () => {
    expect(siteUrl({ SITE_URL: "bayit.ge", NEXT_PUBLIC_SITE_URL: "https://bayit.ge" })).toBe("https://bayit.ge");
    expect(siteUrl({ SITE_URL: "javascript:alert(1)" })).toBe("http://localhost:3000");
    expect(siteUrl({ SITE_URL: "  " })).toBe("http://localhost:3000");
  });
  it("keeps a configured path prefix", () => {
    expect(siteUrl({ SITE_URL: "https://example.org/bayit/" })).toBe("https://example.org/bayit");
  });
});

describe("absoluteUrl", () => {
  it("prefixes paths with the site address", () => {
    const env = { SITE_URL: "https://bayit.ge" };
    expect(absoluteUrl("/api/ical/abc.ics", env)).toBe("https://bayit.ge/api/ical/abc.ics");
    expect(absoluteUrl("he/listing/12", env)).toBe("https://bayit.ge/he/listing/12");
    expect(absoluteUrl("https://cdn.example.com/a.jpg", env)).toBe("https://cdn.example.com/a.jpg");
  });
});

describe("isPermanentSiteUrl", () => {
  it("accepts https on a real domain", () => {
    expect(isPermanentSiteUrl("https://bayit.ge")).toBe(true);
    expect(isPermanentSiteUrl("https://www.bayit.co.il/he")).toBe(true);
  });
  it("refuses local, IP, preview, tunnel and plain-http addresses", () => {
    for (const url of [
      "http://localhost:3000",
      "https://localhost",
      "https://127.0.0.1:3000",
      "https://10.0.0.5",
      "https://[::1]:3000",
      CODESPACE,
      "https://bayit-git-main-me.vercel.app",
      "https://abc.ngrok-free.app",
      "https://random-words.trycloudflare.com",
      "https://bayit.example",
      "https://bayit.test",
      "http://bayit.ge",
      "not a url",
    ]) {
      expect(isPermanentSiteUrl(url), url).toBe(false);
    }
  });
  it("checks hosts the same way", () => {
    expect(isPermanentHost("bayit.ge:443")).toBe(true);
    expect(isPermanentHost("app.github.dev")).toBe(false);
    expect(isPermanentHost("vercel.app")).toBe(false);
    expect(isPermanentHost("intranet")).toBe(false);
  });
});

describe("siteUrlProblem / siteUrlWarning (production guard)", () => {
  it("names what is wrong", () => {
    expect(siteUrlProblem({})).toBe("missing");
    expect(siteUrlProblem({ SITE_URL: "ftp://bayit.ge" })).toBe("invalid");
    expect(siteUrlProblem({ NEXT_PUBLIC_SITE_URL: "http://localhost:3000" })).toBe("local");
    expect(siteUrlProblem({ SITE_URL: "http://bayit.ge" })).toBe("not_https");
    expect(siteUrlProblem({ NEXT_PUBLIC_SITE_URL: CODESPACE })).toBe("temporary");
    expect(siteUrlProblem({ SITE_URL: "https://bayit.ge", NEXT_PUBLIC_SITE_URL: CODESPACE })).toBeNull();
  });
  it("is loud in production when SITE_URL is missing or localhost", () => {
    expect(siteUrlWarning({ NODE_ENV: "production" })).toMatchObject({ level: "error", text: expect.stringContaining("SITE_URL is not set") });
    expect(siteUrlWarning({ NODE_ENV: "production", SITE_URL: "http://localhost:3000" })?.level).toBe("error");
    // Even in test mode: a missing address is never fine.
    expect(siteUrlWarning({ NODE_ENV: "production", AUTH_TEST_MODE: "true" })?.level).toBe("error");
  });
  it("is a short note for a production check on a test address, silent when permanent or in development", () => {
    expect(siteUrlWarning({ NODE_ENV: "production", AUTH_TEST_MODE: "true", NEXT_PUBLIC_SITE_URL: CODESPACE })?.level).toBe("info");
    expect(siteUrlWarning({ NODE_ENV: "production", SITE_URL: "https://bayit.ge" })).toBeNull();
    expect(siteUrlWarning({ NODE_ENV: "development" })).toBeNull();
  });
});

describe("every link that leaves the site is built from SITE_URL (brief 2.1)", () => {
  it("no code builds absolute links from siteConfig.url (the running address)", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const src = path.resolve(__dirname, "..");
    // siteConfig.url itself, and the login origin (BETTER_AUTH_URL stays the running address).
    const allowed = new Set(["config/site.ts", "lib/auth/server.ts"]);
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name !== "generated" && entry.name !== "node_modules") walk(full);
        } else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
          const rel = path.relative(src, full).split(path.sep).join("/");
          if (!allowed.has(rel) && fs.readFileSync(full, "utf8").includes("siteConfig.url")) offenders.push(rel);
        }
      }
    };
    walk(src);
    expect(offenders, "use siteUrl() / absoluteUrl() from @/lib/site-url").toEqual([]);
  });
});
