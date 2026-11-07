/**
 * "Delete my account" (src/lib/account/delete-account.ts) against the local database (DATABASE_URL
 * in .env). The user row is only anonymized, so its onDelete: Cascade never fires: every personal
 * table must be emptied by hand. Round 3, phase 5 (privacy-3, privacy-7, lists-alerts-1): the
 * saved lists (names, share links), the saved searches (names, filters with dates) and the push
 * subscriptions (endpoint, keys, device hint) go too, and a shared list's link stops opening at
 * once. Rows use fake addresses (@example.com) and are removed afterwards.
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/listing/stats", () => ({ recordSave: vi.fn(async () => {}) }));

const { db } = await import("@/lib/db");
const { Prisma } = await import("@/generated/prisma/client");
const { deleteAccountData } = await import("@/lib/account/delete-account");
const lists = await import("@/lib/lists/server");

const prefix = `p5d${randomUUID().replace(/-/g, "").slice(0, 10)}`;
const userId = `${prefix}-user`;
const hostId = `${prefix}-host`;
let listingId = "";

beforeAll(async () => {
  await db.user.createMany({
    data: [
      { id: userId, name: "Delete Me", email: `${userId}@example.com` },
      { id: hostId, name: "Host", email: `${hostId}@example.com` },
    ],
  });
  const listing = await db.listing.create({
    data: {
      ownerId: hostId,
      status: "LIVE",
      dealType: "SHORT_STAY",
      title: `${prefix} flat`,
      currency: "GEL",
      price: new Prisma.Decimal(120),
      pricePeriod: "NIGHT",
      publishedAt: new Date(),
      isDemo: false,
    },
  });
  listingId = listing.id;
});

afterAll(async () => {
  await db.favorite.deleteMany({ where: { userId } });
  await db.savedSearch.deleteMany({ where: { userId } });
  await db.savedList.deleteMany({ where: { userId } });
  await db.pushSubscription.deleteMany({ where: { userId } });
  await db.listing.deleteMany({ where: { ownerId: hostId } });
  await db.user.deleteMany({ where: { id: { in: [userId, hostId] } } });
});

describe("deleting an account", () => {
  it("removes the saved lists (and their share link), the saved searches and the push subscriptions", async () => {
    const user = { id: userId, isStaff: false };
    const named = await lists.createList(userId, "Batumi with Dana, August");
    await lists.saveToList(user, listingId, named.id);
    const { token } = await lists.setListSharing(userId, named.id, true);
    expect(token).toBeTruthy();
    expect(await lists.getSharedList(token!)).not.toBeNull();
    await db.savedSearch.create({
      data: { userId, name: "Batumi Aug", filters: { v: 1, query: "city=batumi&checkIn=2027-08-01&checkOut=2027-08-08" } },
    });
    await db.pushSubscription.create({
      data: { userId, endpoint: `https://fcm.googleapis.com/fcm/send/${prefix}`, p256dh: "key", auth: "auth", userAgent: "iPhone · Safari" },
    });
    expect(await db.savedList.count({ where: { userId } })).toBe(2); // the default list + the named one

    await deleteAccountData(userId);

    expect(await db.savedList.count({ where: { userId } })).toBe(0);
    expect(await db.savedSearch.count({ where: { userId } })).toBe(0);
    expect(await db.pushSubscription.count({ where: { userId } })).toBe(0);
    expect(await db.favorite.count({ where: { userId } })).toBe(0);
    expect(await lists.getSharedList(token!)).toBeNull();
    const row = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { status: true, deletedAt: true } });
    expect(row.status).toBe("DELETED");
    expect(row.deletedAt).not.toBeNull();
  });
});
