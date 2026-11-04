/**
 * "Download my data" (src/lib/account/export.ts) against the local database (DATABASE_URL in
 * .env): a host's export carries their listing, including the public "ביקרנו במקום" date, but
 * never the staff-only visit note, the staff member who entered it, or the internal report
 * counter (brief 8.3: "the note and who entered it stay in the admin panel"). Rows use fake
 * addresses (@example.com) and are removed afterwards.
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { db } = await import("@/lib/db");
const { buildAccountExport, LISTING_EXPORT_COLUMNS } = await import("@/lib/account/export");

const prefix = `axp${randomUUID().replace(/-/g, "").slice(0, 10)}`;
const ownerId = `${prefix}-owner`;
const staffId = `${prefix}-staff`;
const NOTE = `internal-note-${prefix}`;

beforeAll(async () => {
  await db.user.createMany({
    data: [
      { id: ownerId, name: "Export Host", email: `${ownerId}@example.com` },
      { id: staffId, name: "Export Admin", email: `${staffId}@example.com`, role: "ADMIN" },
    ],
  });
  await db.listing.create({
    data: {
      ownerId,
      status: "LIVE",
      title: `${prefix} flat`,
      visitedAt: new Date("2026-11-03T00:00:00Z"),
      visitedNote: NOTE,
      visitedById: staffId,
      reportCount: 3,
      riskScore: 42,
      moderationNote: "Please add a photo of the kitchen.",
    },
  });
});

afterAll(async () => {
  await db.listing.deleteMany({ where: { ownerId } });
  await db.user.deleteMany({ where: { id: { in: [ownerId, staffId] } } });
});

describe("a host's data export", () => {
  it("never carries the staff-only visit note, who entered it, or internal counters", async () => {
    const result = await buildAccountExport(ownerId);
    expect(result.listings).toHaveLength(1);
    const [listing] = result.listings as unknown as Record<string, unknown>[];
    for (const key of ["visitedNote", "visitedById", "reportCount", "riskScore", "riskReasons", "reviewedById", "icalToken", "searchText"]) {
      expect(listing, key).not.toHaveProperty(key);
    }
    const json = JSON.stringify(result);
    expect(json).not.toContain(NOTE);
    expect(json).not.toContain(staffId);
    // The host's own data stays: the public badge date and the moderator's message to them.
    expect(listing.visitedAt).toEqual(new Date("2026-11-03T00:00:00Z"));
    expect(listing.moderationNote).toBe("Please add a photo of the kitchen.");
    expect(listing.title).toBe(`${prefix} flat`);
  });

  it("reads Listing through an allowlist that leaves the staff-only columns out", () => {
    const columns = LISTING_EXPORT_COLUMNS as Record<string, boolean>;
    expect(columns.visitedNote).toBe(false);
    expect(columns.visitedById).toBe(false);
    expect(columns.reportCount).toBe(false);
    expect(columns.visitedAt).toBe(true);
  });
});
