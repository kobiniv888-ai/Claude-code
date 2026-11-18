import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
process.env.HASH_SALT = "test-salt-unsubscribe";

const { unsubscribePath, unsubscribeToken, verifyUnsubscribeToken } = await import("./unsubscribe-token");

describe("signed unsubscribe links", () => {
  it("round-trips the account and the email kind", () => {
    const token = unsubscribeToken("cmh1abc2def", "weekly_stats");
    expect(token).toMatch(/^1\.weekly_stats\.cmh1abc2def\.[0-9a-f]{32}$/);
    expect(verifyUnsubscribeToken(token)).toEqual({ userId: "cmh1abc2def", kind: "weekly_stats" });
    expect(unsubscribePath("cmh1abc2def", "weekly_stats")).toBe(`/unsubscribe?t=${encodeURIComponent(token)}`);
  });

  it("refuses a token for another account, a changed signature or a made-up kind", () => {
    const token = unsubscribeToken("user-a", "weekly_stats");
    const sig = token.split(".")[3];
    expect(verifyUnsubscribeToken(`1.weekly_stats.user-b.${sig}`)).toBeNull();
    expect(verifyUnsubscribeToken(`${token.slice(0, -1)}${token.endsWith("0") ? "1" : "0"}`)).toBeNull();
    expect(verifyUnsubscribeToken(`1.price_alerts.user-a.${sig}`)).toBeNull();
    expect(verifyUnsubscribeToken(`2.weekly_stats.user-a.${sig}`)).toBeNull();
  });

  it("refuses junk", () => {
    for (const junk of [undefined, null, 42, "", "1.weekly_stats", "1.weekly_stats.a.b.c", "x".repeat(500), "1.weekly_stats.a b.0123456789abcdef0123456789abcdef"]) {
      expect(verifyUnsubscribeToken(junk), String(junk)).toBeNull();
    }
  });

  it("depends on the site's secret", async () => {
    const token = unsubscribeToken("user-a", "weekly_stats");
    vi.resetModules();
    process.env.HASH_SALT = "another-salt";
    const other = await import("./unsubscribe-token");
    expect(other.verifyUnsubscribeToken(token)).toBeNull();
    process.env.HASH_SALT = "test-salt-unsubscribe";
  });
});
