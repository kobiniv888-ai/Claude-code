/**
 * auditFileView (src/lib/admin/server/file-views.ts) against the local database (DATABASE_URL in
 * .env): the same staff member opening the same file again within FILE_VIEW_DEDUPE_MINUTES is one
 * audit entry, a later opening is a new one, and a failing audit lookup never throws (the file
 * must still reach staff). Used by the verification document and report screenshot routes.
 * Rows use a fake address (@example.com) and are removed afterwards.
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { db } = await import("@/lib/db");
const { auditFileView, FILE_VIEW_DEDUPE_MINUTES } = await import("@/lib/admin/server/file-views");

const prefix = `fva${randomUUID().replace(/-/g, "").slice(0, 10)}`;
const staffId = `${prefix}-staff`;
const MINUTE = 60_000;

const view = (targetId: string, index: number, now: Date) =>
  auditFileView({ staffId, action: "report.attachment_view", targetType: "Report", targetId, index, now });
const rows = (targetId: string) => db.auditLog.count({ where: { actorId: staffId, action: "report.attachment_view", targetId } });

beforeAll(async () => {
  await db.user.create({ data: { id: staffId, name: "File view admin", email: `${staffId}@example.com`, role: "ADMIN" } });
});

afterAll(async () => {
  await db.auditLog.deleteMany({ where: { actorId: staffId } });
  await db.user.deleteMany({ where: { id: staffId } });
});

describe("auditFileView", () => {
  it("writes one entry per staff member and file every 10 minutes", async () => {
    expect(FILE_VIEW_DEDUPE_MINUTES).toBe(10);
    const target = `${prefix}-r1`;
    const start = new Date();
    await view(target, 0, start);
    await view(target, 0, new Date(start.getTime() + 5 * MINUTE));
    expect(await rows(target)).toBe(1);
    // Another screenshot of the same report is its own entry.
    await view(target, 1, new Date(start.getTime() + 5 * MINUTE));
    expect(await rows(target)).toBe(2);
    // The first screenshot again, past the window: a new entry.
    await view(target, 0, new Date(start.getTime() + 11 * MINUTE));
    expect(await rows(target)).toBe(3);
  });

  it("never throws when the audit lookup fails", async () => {
    const target = `${prefix}-r2`;
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const lookup = vi.spyOn(db.auditLog, "findFirst").mockRejectedValueOnce(new Error("database down"));
    await expect(view(target, 0, new Date())).resolves.toBeUndefined();
    expect(logged).toHaveBeenCalled();
    lookup.mockRestore();
    logged.mockRestore();
  });
});
