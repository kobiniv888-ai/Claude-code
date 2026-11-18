/**
 * /.well-known/security.txt (RFC 9116; SECURITY_REPORT 18.1): built from settings, never committed.
 * Contact from SECURITY_CONTACT_EMAIL, Expires always less than a year ahead and worked out again on
 * every request, Preferred-Languages he, en, Canonical, and Policy pointing at the security page.
 */
import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildSecurityTxt, securityContactEmail, securityTxtExpires, SECURITY_TXT_EXPIRES_DAYS } from "./security-txt";

const NOW = new Date("2026-11-09T15:30:00Z");

describe("securityContactEmail", () => {
  it("takes one address; anything else counts as not set", () => {
    expect(securityContactEmail({ SECURITY_CONTACT_EMAIL: " security@bayit.example " })).toBe("security@bayit.example");
    for (const bad of [undefined, "", "not-an-address", "a@b", "a@b.example, c@d.example", "mailto:a@b.example", "a@b.example\nContact: x"]) {
      expect(securityContactEmail({ SECURITY_CONTACT_EMAIL: bad })).toBeNull();
    }
  });
});

describe("buildSecurityTxt", () => {
  const text = buildSecurityTxt({ contact: "security@bayit.example", siteUrl: "https://bayit.example/", now: NOW });
  const fields = text
    .split("\n")
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => [line.slice(0, line.indexOf(":")), line.slice(line.indexOf(":") + 2)] as const);
  const all = (name: string) => fields.filter(([key]) => key === name).map(([, value]) => value);

  it("has the RFC 9116 fields", () => {
    expect(all("Contact")).toEqual(["mailto:security@bayit.example"]);
    expect(all("Preferred-Languages")).toEqual(["he, en"]);
    expect(all("Canonical")).toEqual(["https://bayit.example/.well-known/security.txt"]);
    expect(all("Policy")).toEqual(["https://bayit.example/he/security", "https://bayit.example/en/security"]);
    expect(all("Expires")).toHaveLength(1);
    expect(text.endsWith("\n")).toBe(true);
  });

  it("Expires is an RFC 3339 time less than a year ahead, the same all day, moving with the days", () => {
    const [expires] = all("Expires");
    expect(expires).toMatch(/^\d{4}-\d{2}-\d{2}T00:00:00Z$/);
    const ahead = Date.parse(expires!) - NOW.getTime();
    expect(ahead).toBeGreaterThan(300 * 86_400_000);
    expect(ahead).toBeLessThan(365 * 86_400_000);
    expect(securityTxtExpires(new Date("2026-11-09T00:00:01Z")).getTime()).toBe(securityTxtExpires(new Date("2026-11-09T23:59:59Z")).getTime());
    const nextDay = securityTxtExpires(new Date("2026-11-10T08:00:00Z")).getTime() - securityTxtExpires(NOW).getTime();
    expect(nextDay).toBe(86_400_000);
    expect(SECURITY_TXT_EXPIRES_DAYS).toBeLessThan(365);
  });
});

describe("the route", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("answers the file as plain text", async () => {
    vi.stubEnv("SECURITY_CONTACT_EMAIL", "security@bayit.example");
    vi.stubEnv("SITE_URL", "https://bayit.example");
    const { GET } = await import("@/app/.well-known/security.txt/route");
    const response = GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    const body = await response.text();
    expect(body).toContain("Contact: mailto:security@bayit.example");
    expect(body).toContain("Policy: https://bayit.example/he/security");
  });

  it("without a contact address: 404 (a file without Contact is not valid)", async () => {
    vi.stubEnv("SECURITY_CONTACT_EMAIL", "");
    const { GET } = await import("@/app/.well-known/security.txt/route");
    expect(GET().status).toBe(404);
  });

  it("no security address is committed anywhere in the repository's settings files", () => {
    const example = fs.readFileSync(path.join(process.cwd(), ".env.example"), "utf8");
    const line = example.split("\n").find((l) => l.startsWith("SECURITY_CONTACT_EMAIL="));
    expect(line).toBe('SECURITY_CONTACT_EMAIL=""');
  });
});
