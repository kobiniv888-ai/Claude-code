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
    const where = await bookingSearchWhere({ q: "Cohen", from: null, to: null });
    const or = (where.AND as { OR?: unknown[] }[])[0].OR ?? [];
    const users = { OR: expect.arrayContaining([{ name: { contains: "Cohen", mode: "insensitive" } }]) };
    expect(or).toEqual(expect.arrayContaining([{ guest: users }, { host: users }]));
    expect(JSON.stringify(or)).not.toContain('"in"');
    expect(touched).toEqual([]);
  });
});
