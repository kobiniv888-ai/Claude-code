import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * removeDemoData (src/lib/demo.ts) with a stand-in database: the private files that only the
 * deleted rows pointed to (a real guest's screenshot on a report about a demo listing, a ticket
 * attachment) are deleted from storage after the commit, and only keys in their uploader's own
 * folder. (The real function deletes every demo row, so it never runs against the shared database.)
 */

const state = vi.hoisted(() => ({ deleted: [] as string[], order: [] as string[] }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/settings", () => ({ clearSettingsCache: () => undefined }));
vi.mock("@/lib/storage", () => ({
  deletePrivate: async (key: string) => {
    state.order.push(`delete:${key}`);
    state.deleted.push(key);
  },
}));
vi.mock("@/lib/db", () => {
  const count = (n: number) => async () => ({ count: n });
  const tx = {
    listing: { findMany: async () => [{ id: "demo-listing" }], deleteMany: count(1) },
    scamAlert: { findMany: async () => [], deleteMany: count(0) },
    report: {
      findMany: async () => [
        {
          reporterId: "real-guest",
          attachments: [
            { key: "private/report/real-guest/shot1.jpg", mime: "image/jpeg", bytes: 52_000, name: "a.png" },
            // Not in the reporter's own folder: never deleted from here.
            { key: "private/report/someone-else/shot2.jpg", mime: "image/jpeg", bytes: 52_000, name: "b.png" },
          ],
        },
        { reporterId: null, attachments: [{ key: "private/report/gone/shot3.jpg", mime: "image/jpeg", bytes: 1, name: "" }] },
      ],
    },
    ticketMessage: {
      findMany: async () => [
        { authorId: "real-guest", attachments: [{ key: "private/ticket/real-guest/receipt.pdf" }, { key: "public/x.jpg" }] },
        { authorId: "staff-1", attachments: null },
      ],
    },
    ticket: { deleteMany: count(2) },
    jewishPlace: { deleteMany: count(3) },
    user: { deleteMany: count(4) },
    siteSetting: { findUnique: async () => null, update: async () => undefined },
  };
  return {
    db: {
      ...tx,
      $transaction: async (fn: (client: typeof tx) => Promise<unknown>) => {
        const result = await fn(tx);
        state.order.push("commit");
        return result;
      },
    },
  };
});

const { removeDemoData } = await import("@/lib/demo");

beforeEach(() => {
  state.deleted.length = 0;
  state.order.length = 0;
});

describe("removing demo data", () => {
  it("deletes the private files only the removed rows pointed to, after the commit", async () => {
    const counts = await removeDemoData();
    expect(counts).toEqual({ listings: 1, users: 4, places: 3, alerts: 0 });
    expect(state.deleted.sort()).toEqual(["private/report/real-guest/shot1.jpg", "private/ticket/real-guest/receipt.pdf"]);
    expect(state.order[0]).toBe("commit");
  });
});
