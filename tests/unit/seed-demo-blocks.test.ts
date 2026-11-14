import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { blocksOutsideDatePrices, demoDatePricesFor } = await import("../../prisma/seed/listings/booking-settings");
type Seed = Parameters<typeof demoDatePricesFor>[0];

/** Demo data (round 3, phase 4 gate): a demo owner block never hides the demo holiday price. */
const day = (d: string) => new Date(`${d}T00:00:00.000Z`);
const block = (start: string, end: string) => ({ startDate: day(start), endDate: day(end) });

describe("blocksOutsideDatePrices", () => {
  const chanukah = [{ startDate: day("2026-12-04"), endDate: day("2026-12-13") }];

  it("drops an owner block that shares a night with the holiday price", () => {
    expect(blocksOutsideDatePrices([block("2026-12-06", "2026-12-13")], chanukah)).toEqual([]);
    expect(blocksOutsideDatePrices([block("2026-12-01", "2026-12-05")], chanukah)).toEqual([]);
    expect(blocksOutsideDatePrices([block("2026-12-12", "2026-12-15")], chanukah)).toEqual([]);
  });

  it("keeps blocks that only touch it (the end dates are exclusive) or lie elsewhere", () => {
    const kept = [block("2026-11-09", "2026-11-12"), block("2026-11-29", "2026-12-04"), block("2026-12-13", "2026-12-20")];
    expect(blocksOutsideDatePrices(kept, chanukah)).toEqual(kept);
  });

  it("keeps every block when the listing has no holiday price", () => {
    const blocks = [block("2026-12-06", "2026-12-13")];
    expect(blocksOutsideDatePrices(blocks, [])).toEqual(blocks);
  });
});

describe("demoDatePricesFor", () => {
  const n1 = { n: 1, fields: { dealType: "SHORT_STAY" } } as unknown as Seed;
  const iso = (d: Date) => d.toISOString().slice(0, 10);

  it("gives demo listing 1 this year's Chanukah when the codespace is seeded in November", () => {
    for (const seeded of ["2026-11-06", "2026-11-20", "2026-12-01"]) {
      const [price] = demoDatePricesFor(n1, new Date(`${seeded}T09:00:00Z`));
      expect(price, seeded).toBeDefined();
      expect([iso(price.startDate), iso(price.endDate)], seeded).toEqual(["2026-12-04", "2026-12-13"]);
      expect(price).toMatchObject({ price: 110, minNights: 3 });
      expect(price.label.he).toBe("חנוכה");
    }
  });

  it("moves to next year's Chanukah once this one has begun, and other listings get none", () => {
    const [later] = demoDatePricesFor(n1, new Date("2026-12-20T09:00:00Z"));
    expect(iso(later.startDate).slice(0, 4)).toBe("2027");
    expect(demoDatePricesFor({ ...n1, n: 2 } as Seed, new Date("2026-11-06T09:00:00Z"))).toEqual([]);
  });
});
