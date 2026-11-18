/**
 * GET /api/admin/reports/<reportId>/<index>: opening a report screenshot is audited through the
 * shared auditFileView (one rule and one dedupe window for every staff file view, never throws),
 * not a copy of its own.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  audits: [] as Record<string, unknown>[],
  staff: { id: "staff-1", role: "ADMIN" } as { id: string; role: "ADMIN" | "MODERATOR" },
  report: null as null | {
    kind?: "GENERAL" | "TURNED_AWAY";
    reporterId: string | null;
    targetUserId?: string | null;
    listing?: { ownerId: string } | null;
    attachments: unknown;
    attachmentsDeletedAt: Date | null;
  },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/session", () => ({ requireStaffForAction: async () => state.staff }));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: async () => ({ ok: true, remaining: 1, resetAt: new Date() }),
  rateLimitHeaders: () => ({}),
}));
vi.mock("@/lib/db", () => ({ db: { report: { findUnique: async () => state.report } } }));
vi.mock("@/lib/storage", () => ({ getPrivate: async () => ({ body: Buffer.from("jpeg-bytes"), contentType: "image/jpeg" }) }));
vi.mock("@/lib/admin/server/file-views", () => ({
  auditFileView: async (input: Record<string, unknown>) => void state.audits.push(input),
}));

const { GET } = await import("./route");

const KEY = "private/report/guest-1/abcdefghijklmnopqrstuvwx.jpg";

function open(reportId: string, index: string) {
  return GET(new Request(`http://localhost/api/admin/reports/${reportId}/${index}`), { params: Promise.resolve({ reportId, index }) });
}

describe("GET /api/admin/reports/[reportId]/[index]", () => {
  beforeEach(() => {
    state.audits.length = 0;
    state.staff = { id: "staff-1", role: "ADMIN" };
    state.report = { reporterId: "guest-1", attachments: [{ key: KEY, mime: "image/jpeg", bytes: 10, name: "a.jpg" }], attachmentsDeletedAt: null };
  });

  it("serves the screenshot and writes the view through auditFileView", async () => {
    const res = await open("report-1", "0");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/jpeg");
    expect(state.audits).toEqual([{ staffId: "staff-1", action: "report.attachment_view", targetType: "Report", targetId: "report-1", index: 0 }]);
  });

  it("audits nothing when there is no such screenshot", async () => {
    expect((await open("report-1", "3")).status).toBe(404);
    state.report = null;
    expect((await open("report-1", "0")).status).toBe(404);
    expect(state.audits).toEqual([]);
  });

  it("staff other than an ADMIN never open the screenshots of a report about them or sent by them (SECURITY_REPORT 4.3.d)", async () => {
    state.staff = { id: "mod-1", role: "MODERATOR" };
    for (const own of [{ targetUserId: "mod-1" }, { listing: { ownerId: "mod-1" } }, { reporterId: "mod-1" }]) {
      state.report = { reporterId: "guest-1", attachments: [{ key: KEY, mime: "image/jpeg", bytes: 10, name: "a.jpg" }], attachmentsDeletedAt: null, ...own };
      expect((await open("report-1", "0")).status, JSON.stringify(own)).toBe(404);
    }
    expect(state.audits).toEqual([]);
    // Someone else's report: served as usual.
    state.report = { reporterId: "guest-1", targetUserId: "host-1", attachments: [{ key: KEY, mime: "image/jpeg", bytes: 10, name: "a.jpg" }], attachmentsDeletedAt: null };
    expect((await open("report-1", "0")).status).toBe(200);
    // An ADMIN may (audited): the founder is the only admin and may be a host too.
    state.staff = { id: "host-1", role: "ADMIN" };
    expect((await open("report-1", "0")).status).toBe(200);
  });

  it("the screenshots of a turned-away report are its sender's evidence: ADMIN only (Q12, 4.3.d, 9.j)", async () => {
    const turnedAway = { kind: "TURNED_AWAY" as const, reporterId: "guest-1", targetUserId: "host-1", attachments: [{ key: KEY, mime: "image/jpeg", bytes: 10, name: "a.jpg" }], attachmentsDeletedAt: null };
    for (const role of ["MODERATOR", "SUPPORT"] as const) {
      state.staff = { id: "mod-1", role: role as "MODERATOR" };
      state.report = turnedAway;
      expect((await open("report-1", "0")).status, role).toBe(404);
    }
    expect(state.audits).toEqual([]);
    // A listing report's screenshots stay open to moderators.
    state.staff = { id: "mod-1", role: "MODERATOR" };
    state.report = { ...turnedAway, kind: "GENERAL" };
    expect((await open("report-1", "0")).status).toBe(200);
    state.staff = { id: "staff-1", role: "ADMIN" };
    state.report = turnedAway;
    expect((await open("report-1", "0")).status).toBe(200);
  });
});
