/**
 * ops-ret-2: the 3-month guest-contact erase also clears a phone still in the legacy plain column
 * (Booking.guestPhone, before scripts/encrypt-fields.ts moved it). The local database already has
 * the CHECK guard that refuses such a value, so this checks the query the job sends instead.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const sent = vi.hoisted(() => ({ args: null as unknown }));
vi.mock("@/lib/db", () => ({
  db: {
    booking: {
      updateMany: async (args: unknown) => {
        sent.args = args;
        return { count: 1 };
      },
    },
  },
}));

const { eraseOldGuestContacts } = await import("@/lib/admin/maintenance/retention");

describe("eraseOldGuestContacts and the legacy plain phone", () => {
  it("finds rows that hold only a legacy phone, and clears it", async () => {
    await eraseOldGuestContacts(new Date("2026-11-09T03:00:00Z"));
    const args = sent.args as { where: { AND: unknown[] }; data: Record<string, unknown> };
    expect(args.data).toMatchObject({ legacyGuestPhone: null, guestPhoneEnc: null, guestPhoneLookup: null });
    const holds = args.where.AND[2] as { OR: Record<string, unknown>[] };
    expect(holds.OR).toContainEqual({ legacyGuestPhone: { not: null } });
  });
});
