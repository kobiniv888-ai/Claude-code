/**
 * The "ביקרנו במקום" admin actions (round 3, brief 8.3): only an ADMIN sets or clears the badge,
 * demo listings are refused, the date can't be in the future, every change is audited, and the
 * internal note is written to the staff-only column and the audit entry only.
 * The staff session, the database and the audit log are replaced; the rules are the real ones.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

type Staff = { id: string; role: "ADMIN" | "MODERATOR" | "SUPPORT" };
type ListingRow = {
  id: string;
  publicId: number;
  isDemo: boolean;
  deletedAt: Date | null;
  status: string;
  countryCode: string;
  visitedAt: Date | null;
  visitedNote: string | null;
  visitedById: string | null;
  owner: { isDemo: boolean };
  cityId: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  photos: { id: string; createdAt: Date }[];
};

const state = vi.hoisted(() => ({
  staff: null as Staff | null,
  listing: null as ListingRow | null,
  updates: [] as { where: unknown; data: Record<string, unknown> }[],
  audits: [] as { action: string; targetId?: string | null; details?: Record<string, unknown> | null }[],
  /** "listing.visited_set" audit rows the snapshot is read back from. */
  setEntries: [] as { targetId: string; details: unknown }[],
}));

vi.mock("server-only", () => ({}));
// The fresh authenticator code of destructive staff actions (3.6.c) is granted here; its rule is
// tested in tests/unit/endpoints/staff-fresh-proof-db.test.ts and endpoint-registry.test.ts.
vi.mock("@/lib/admin/server/staff-proof", () => ({ requireFreshStaffProof: async () => {}, spendStaffProof: async () => {} }));
vi.mock("next-intl/server", () => ({ getTranslations: async () => (key: string) => key }));
vi.mock("@/lib/translate", () => ({ translateForLocale: async (text: string) => ({ text }) }));
vi.mock("@/lib/monitoring", () => ({ reportError: async () => {} }));
vi.mock("@/lib/rate-limit", () => ({ assertRateLimit: async () => {} }));
vi.mock("@/lib/crypto", () => ({ hmacHash: (value: string) => `h:${value}` }));
vi.mock("@/lib/auth/session", async () => {
  const { AuthRequiredError, ForbiddenError } = await import("@/lib/errors");
  const { can } = await import("@/lib/auth/permissions");
  return {
    requireStaffForAction: async (permission: Parameters<typeof can>[1]) => {
      if (!state.staff) throw new AuthRequiredError();
      if (!can(state.staff.role, permission)) throw new ForbiddenError();
      return state.staff;
    },
  };
});
vi.mock("@/lib/audit", () => ({
  audit: async (entry: (typeof state.audits)[number]) => {
    state.audits.push(entry);
  },
  // Clearing the badge writes its row in the change's transaction (Q13).
  auditOrThrow: async (entry: (typeof state.audits)[number]) => {
    state.audits.push(entry);
  },
}));
vi.mock("@/lib/db", () => {
  const db = {
    auditLog: { findMany: async () => state.setEntries },
    listing: {
      findUnique: async () => (state.listing ? structuredClone(state.listing) : null),
      update: async (args: { where: unknown; data: Record<string, unknown> }) => {
        state.updates.push(args);
        return {};
      },
    },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(db),
  };
  return { db };
});

const { setVisitedAction, clearVisitedAction } = await import("./actions");

function realListing(over: Partial<ListingRow> = {}): ListingRow {
  return {
    id: "lst_1",
    publicId: 1234,
    isDemo: false,
    deletedAt: null,
    status: "LIVE",
    countryCode: "GE",
    visitedAt: null,
    visitedNote: null,
    visitedById: null,
    owner: { isDemo: false },
    cityId: "city_1",
    address: "Test street 1",
    lat: 41.7151,
    lng: 44.8271,
    photos: [
      { id: "p1", createdAt: new Date("2026-10-01T00:00:00Z") },
      { id: "p2", createdAt: new Date("2026-10-02T00:00:00Z") },
    ],
    ...over,
  };
}

const yesterday = () => new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
const input = (over: Record<string, unknown> = {}) => ({ listingId: "lst_1", visitedOn: yesterday(), note: "Dana visited with the host", ...over });

beforeEach(() => {
  state.staff = { id: "admin_1", role: "ADMIN" };
  state.listing = realListing();
  state.updates = [];
  state.audits = [];
  state.setEntries = [];
});

describe("setVisitedAction", () => {
  it("refuses everyone but an ADMIN, before touching anything", async () => {
    for (const role of ["MODERATOR", "SUPPORT"] as const) {
      state.staff = { id: "staff_1", role };
      const result = await setVisitedAction(input());
      expect(result).toEqual({ ok: false, error: "forbidden" });
    }
    state.staff = null;
    expect(await setVisitedAction(input())).toMatchObject({ ok: false, error: "auth_required" });
    expect(state.updates).toEqual([]);
    expect(state.audits).toEqual([]);
  });

  it("refuses demo listings and listings of demo accounts", async () => {
    state.listing = realListing({ isDemo: true });
    expect(await setVisitedAction(input())).toEqual({ ok: false, error: "visited_demo" });
    state.listing = realListing({ owner: { isDemo: true } });
    expect(await setVisitedAction(input())).toEqual({ ok: false, error: "visited_demo" });
    expect(state.updates).toEqual([]);
    expect(state.audits).toEqual([]);
  });

  it("refuses a deleted or missing listing", async () => {
    state.listing = realListing({ deletedAt: new Date() });
    expect(await setVisitedAction(input())).toEqual({ ok: false, error: "listing_not_found" });
    state.listing = null;
    expect(await setVisitedAction(input())).toEqual({ ok: false, error: "listing_not_found" });
    expect(state.updates).toEqual([]);
  });

  it("refuses a future date, a date far back and a missing note", async () => {
    const tomorrow = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
    expect(await setVisitedAction(input({ visitedOn: tomorrow }))).toEqual({ ok: false, error: "visit_date_future" });
    expect(await setVisitedAction(input({ visitedOn: "2016-01-01" }))).toEqual({ ok: false, error: "visit_date_too_old" });
    expect(await setVisitedAction(input({ note: "" }))).toMatchObject({ ok: false, error: "invalid_input" });
    expect(state.updates).toEqual([]);
  });

  it("saves the day, the note and who entered it, and audits it with a snapshot of the place", async () => {
    const day = yesterday();
    expect(await setVisitedAction(input({ visitedOn: day }))).toEqual({ ok: true, data: { visitedOn: day } });
    expect(state.updates).toHaveLength(1);
    expect(state.updates[0].data).toEqual({ visitedAt: new Date(`${day}T00:00:00.000Z`), visitedNote: "Dana visited with the host", visitedById: "admin_1" });
    expect(state.audits).toHaveLength(1);
    const entry = state.audits[0];
    expect(entry).toMatchObject({ action: "listing.visited_set", targetId: "lst_1" });
    expect(entry.details).toMatchObject({ publicId: 1234, visitedOn: day, note: "Dana visited with the host", previous: null });
    const snapshot = entry.details?.snapshot as { location: string; photoIds: string[] };
    expect(snapshot.photoIds).toEqual(["p1", "p2"]);
    // A keyed hash of the place, never the address itself.
    expect(snapshot.location).not.toContain("Test street");
  });

  it("an edit keeps the previous visit in the audit entry", async () => {
    state.listing = realListing({ visitedAt: new Date("2026-09-01T00:00:00Z"), visitedNote: "Old note", visitedById: "admin_0" });
    await setVisitedAction(input());
    expect(state.audits[0].details?.previous).toEqual({ visitedOn: "2026-09-01", note: "Old note", enteredById: "admin_0" });
  });
});

describe("editing a visit (same date)", () => {
  const visitSnapshot = { location: "loc-at-visit", photoIds: ["p0"] };

  it("copies the snapshot of the visit instead of taking a new one (the change warning stays)", async () => {
    const day = "2026-09-01";
    state.listing = realListing({ visitedAt: new Date(`${day}T00:00:00Z`), visitedNote: "Old note", visitedById: "admin_0" });
    state.setEntries = [{ targetId: "lst_1", details: { snapshot: visitSnapshot } }];
    expect(await setVisitedAction(input({ visitedOn: day, note: "Fixed the typo" }))).toEqual({ ok: true, data: { visitedOn: day } });
    expect(state.audits[0].details).toMatchObject({ snapshot: visitSnapshot, edit: true });
  });

  it("an old visit (over two years) can still be edited", async () => {
    const day = "2024-06-01";
    state.listing = realListing({ visitedAt: new Date(`${day}T00:00:00Z`), visitedNote: "Old", visitedById: "admin_0" });
    state.setEntries = [{ targetId: "lst_1", details: { snapshot: visitSnapshot } }];
    expect(await setVisitedAction(input({ visitedOn: day }))).toEqual({ ok: true, data: { visitedOn: day } });
    // A new date that old is still refused.
    state.listing = realListing({ visitedAt: new Date("2026-09-01T00:00:00Z") });
    expect(await setVisitedAction(input({ visitedOn: day }))).toEqual({ ok: false, error: "visit_date_too_old" });
  });

  it("a new visit date takes a fresh snapshot", async () => {
    state.listing = realListing({ visitedAt: new Date("2026-09-01T00:00:00Z") });
    state.setEntries = [{ targetId: "lst_1", details: { snapshot: visitSnapshot } }];
    await setVisitedAction(input());
    const snapshot = state.audits[0].details?.snapshot as { photoIds: string[] };
    expect(snapshot.photoIds).toEqual(["p1", "p2"]);
    expect(state.audits[0].details?.edit).toBeUndefined();
  });
});

describe("clearVisitedAction", () => {
  it("refuses everyone but an ADMIN", async () => {
    state.staff = { id: "mod_1", role: "MODERATOR" };
    state.listing = realListing({ visitedAt: new Date("2026-10-01T00:00:00Z") });
    expect(await clearVisitedAction({ listingId: "lst_1" })).toEqual({ ok: false, error: "forbidden" });
    expect(state.updates).toEqual([]);
  });

  it("clears the day, the note and who entered it, and audits the previous values", async () => {
    state.listing = realListing({ visitedAt: new Date("2026-10-01T00:00:00Z"), visitedNote: "Dana", visitedById: "admin_1" });
    expect(await clearVisitedAction({ listingId: "lst_1", note: "The host moved" })).toEqual({ ok: true, data: { cleared: true } });
    expect(state.updates[0].data).toEqual({ visitedAt: null, visitedNote: null, visitedById: null });
    expect(state.audits[0]).toMatchObject({
      action: "listing.visited_clear",
      targetId: "lst_1",
      details: { publicId: 1234, note: "The host moved", previous: { visitedOn: "2026-10-01", note: "Dana", enteredById: "admin_1" } },
    });
  });

  it("does nothing on a listing without the badge", async () => {
    expect(await clearVisitedAction({ listingId: "lst_1" })).toEqual({ ok: true, data: { cleared: false } });
    expect(state.updates).toEqual([]);
    expect(state.audits).toEqual([]);
  });
});
