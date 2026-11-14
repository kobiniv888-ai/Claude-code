/**
 * SECURITY_REPORT 4.2.b: the owner's preview of a listing that is not public (a draft, in review,
 * hidden, paused) needs the full sign-in, like every other private page: a session whose 2-step
 * code was not entered yet gets the same 404 as a stranger (src/lib/listing-page/load.ts
 * toListingViewer → src/lib/listing-page/access.ts listingAccess).
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/auth/session", () => ({ hasStaffRights: (user: { twoFactorVerified: boolean; role: string }) => user.role !== "USER" && user.twoFactorVerified }));

const { toListingViewer } = await import("@/lib/listing-page/load");
const { listingAccess } = await import("@/lib/listing-page/access");

type Viewer = Parameters<typeof toListingViewer>[0];
const owner = (twoFactorVerified: boolean, role = "USER") => ({ id: "owner-1", role, twoFactorVerified }) as unknown as Viewer;

const hidden = {
  status: "IN_REVIEW" as const,
  ownerId: "owner-1",
  isDemo: false,
  deletedAt: null,
  expiresAt: null,
  owner: { status: "ACTIVE" as const, deletedAt: null },
};

describe("owner preview of a listing that is not public (4.2.b)", () => {
  it("the fully signed-in owner previews it", () => {
    expect(listingAccess(hidden, toListingViewer(owner(true)), { demoVisible: true })).toBe("preview");
  });

  it("the owner with the 2-step code still pending gets 'none' (404), like a stranger", () => {
    expect(toListingViewer(owner(false))).toBeNull();
    expect(listingAccess(hidden, toListingViewer(owner(false)), { demoVisible: true })).toBe("none");
    expect(listingAccess(hidden, toListingViewer(owner(false, "MODERATOR")), { demoVisible: true })).toBe("none");
    expect(listingAccess(hidden, toListingViewer(null), { demoVisible: true })).toBe("none");
  });

  it("a public listing stays public for everyone", () => {
    expect(listingAccess({ ...hidden, status: "LIVE" }, toListingViewer(owner(false)), { demoVisible: true })).toBe("public");
  });
});
