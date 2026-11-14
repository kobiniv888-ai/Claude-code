import { describe, expect, it, vi } from "vitest";

/**
 * Admin → Bookings search by name or email: the guest and host are matched with relation filters,
 * so every matching user counts (no capped pre-fetch of user ids) and no user query runs first.
 */

const touched: string[] = [];
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({
  db: new Proxy(
    {},
    {
      get(_target, model) {
        touched.push(String(model));
        throw new Error(`no database call expected (${String(model)})`);
      },
    },
  ),
}));

const { bookingSearchWhere } = await import("./server/bookings");

describe("booking search where", () => {
  it("matches guests and hosts by relation, without looking users up first", async () => {
    const where = await bookingSearchWhere({ q: "Cohen", from: null, to: null }, { role: "MODERATOR" });
    const or = (where.AND as { OR?: unknown[] }[])[0].OR ?? [];
    const users = { OR: expect.arrayContaining([{ name: { contains: "Cohen", mode: "insensitive" } }]) };
    // A MODERATOR's guest-side match leaves out bookings with a turned-away report: its guest is
    // the reporter, who is ADMIN-only (Q12, q12-reporter-1).
    const hidden = { reports: { none: { kind: "TURNED_AWAY" } } };
    expect(or).toEqual(expect.arrayContaining([{ guest: users, ...hidden }, { host: users }]));
    expect(JSON.stringify(or)).not.toContain('"in"');
    expect(touched).toEqual([]);
  });

  it("an ADMIN's guest-side match keeps the bookings with a turned-away report", async () => {
    const where = await bookingSearchWhere({ q: "Cohen", from: null, to: null }, { role: "ADMIN" });
    const or = (where.AND as { OR?: unknown[] }[])[0].OR ?? [];
    expect(JSON.stringify(or)).not.toContain("TURNED_AWAY");
    expect(or).toEqual(expect.arrayContaining([{ guest: expect.objectContaining({ OR: expect.any(Array) }) }]));
  });

  it("searches by phone number for an ADMIN only (founder's decision Q12)", async () => {
    const asAdmin = JSON.stringify(await bookingSearchWhere({ q: "+995 599 00 00 01", from: null, to: null }, { role: "ADMIN" }));
    expect(asAdmin).toContain("guestPhone");
    expect(asAdmin).toContain("phoneNumber");
    for (const role of ["MODERATOR", "SUPPORT"]) {
      const where = JSON.stringify(await bookingSearchWhere({ q: "+995 599 00 00 01", from: null, to: null }, { role }));
      expect(where, role).not.toContain("guestPhone");
      expect(where, role).not.toContain("phoneNumber");
    }
    expect(touched).toEqual([]);
  });
});
