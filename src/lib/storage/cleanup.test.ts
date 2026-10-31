/**
 * Storage cleanup (photos of deleted listings, unattached private uploads) against the local
 * database (DATABASE_URL in .env) and a temporary local storage folder. Creates its own user,
 * listings, ticket and verification request with a unique prefix and removes them afterwards.
 */
import "dotenv/config";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const root = fs.mkdtempSync(path.join(os.tmpdir(), "bayit-cleanup-"));
process.env.STORAGE_LOCAL_DIR = root;
process.env.STORAGE_DRIVER = "local";
process.env.APP_ENCRYPTION_KEY = randomBytes(32).toString("base64");

const { db } = await import("@/lib/db");
const storage = await import("./index");
const { listingPhotoVariantKeys, privateUploadPrefix } = await import("@/lib/media");
const cleanup = await import("./cleanup");

const prefix = `ct${randomUUID().replace(/-/g, "").slice(0, 10)}`;
const userId = `${prefix}user`;
const DAY = 24 * 3600 * 1000;
const now = new Date();
const ago = (ms: number) => new Date(now.getTime() - ms);
const exists = (visibility: "public" | "private", key: string) => fs.existsSync(path.join(root, visibility, key));

async function createListing(status: "DELETED" | "LIVE", deletedAt: Date | null, kosherCertPhotoKey: string | null = null) {
  return db.listing.create({
    data: {
      ownerId: userId,
      status,
      deletedAt,
      dealType: "MONTHLY_RENT",
      propertyType: "APARTMENT",
      pricePeriod: "MONTH",
      originalLocale: "en",
      title: "Cleanup test flat",
      description: "Test",
      price: 500,
      currency: "USD",
      kosherCertPhotoKey,
    },
  });
}

async function photoWithFiles(listingId: string) {
  const storageKey = `listings/${listingId}/${randomUUID()}`;
  for (const key of listingPhotoVariantKeys(storageKey)) {
    await storage.putPublic(key, Buffer.from("img"), key.endsWith(".jpg") ? "image/jpeg" : "image/webp");
  }
  return db.listingPhoto.create({ data: { listingId, storageKey, url: `/api/media/${storageKey}-lg.webp`, phash: "ffff0000ffff0000" } });
}

async function privateUpload(purpose: "ticket" | "verification", createdAt: Date) {
  const key = `${privateUploadPrefix(purpose, userId)}${randomUUID().replace(/-/g, "")}.jpg`;
  await db.privateUpload.create({ data: { key, userId, purpose, createdAt } });
  await storage.putPrivate(key, Buffer.from("secret"), "image/jpeg");
  return key;
}

beforeAll(async () => {
  await db.user.create({ data: { id: userId, name: "Cleanup test", email: `${userId}@example.com` } });
});

afterAll(async () => {
  await db.privateUpload.deleteMany({ where: { userId } });
  await db.ticket.deleteMany({ where: { userId } });
  await db.user.deleteMany({ where: { id: userId } });
  await db.$disconnect();
  fs.rmSync(root, { recursive: true, force: true });
});

describe("photos of deleted listings", () => {
  it("deletes the files after 30 days and keeps the row with its hash", async () => {
    const old = await createListing("DELETED", ago(31 * DAY));
    const recent = await createListing("DELETED", ago(5 * DAY));
    const live = await createListing("LIVE", null);
    const [oldPhoto, recentPhoto, livePhoto] = await Promise.all([photoWithFiles(old.id), photoWithFiles(recent.id), photoWithFiles(live.id)]);

    const result = await cleanup.deletePhotosOfDeletedListings(now);
    expect(result.failed).toBe(0);
    expect(result.photos).toBeGreaterThanOrEqual(1);

    for (const key of listingPhotoVariantKeys(oldPhoto.storageKey!)) expect(exists("public", key)).toBe(false);
    expect(await db.listingPhoto.findUniqueOrThrow({ where: { id: oldPhoto.id } })).toMatchObject({ storageKey: null, phash: "ffff0000ffff0000" });
    for (const photo of [recentPhoto, livePhoto]) {
      for (const key of listingPhotoVariantKeys(photo.storageKey!)) expect(exists("public", key)).toBe(true);
      expect((await db.listingPhoto.findUniqueOrThrow({ where: { id: photo.id } })).storageKey).toBe(photo.storageKey);
    }
    // Nothing left to do on the next run.
    expect((await cleanup.deletePhotosOfDeletedListings(now)).photos).toBe(0);
  });
});

describe("unattached private uploads", () => {
  it("deletes files never attached after 48 hours and keeps attached ones", async () => {
    const old = ago(3 * DAY);
    const [abandoned, onTicket, onRequest, onListing, fresh] = await Promise.all([
      privateUpload("verification", old),
      privateUpload("ticket", old),
      privateUpload("verification", old),
      privateUpload("verification", old),
      privateUpload("ticket", ago(3600 * 1000)),
    ]);
    await db.ticket.create({
      data: {
        userId,
        category: "LISTING_PROBLEM",
        subject: "Cleanup test",
        messages: { create: { authorId: userId, body: "See screenshot", attachments: [{ key: onTicket, mime: "image/jpeg", bytes: 6, name: "a.jpg" }] } },
      },
    });
    await db.verificationRequest.create({
      data: { userId, type: "ID", documents: [{ key: onRequest, kind: "ID_FRONT", mime: "image/jpeg", bytes: 6 }] },
    });
    await createListing("LIVE", null, onListing);

    const result = await cleanup.deleteUnattachedPrivateUploads(now);
    expect(result).toMatchObject({ deleted: 1, attached: 3, failed: 0 });
    expect(exists("private", abandoned)).toBe(false);
    for (const key of [onTicket, onRequest, onListing, fresh]) expect(exists("private", key)).toBe(true);
    // Checked rows are dropped; the recent upload waits for its 48 hours.
    expect((await db.privateUpload.findMany({ where: { userId }, select: { key: true } })).map((r) => r.key)).toEqual([fresh]);
  });
});
