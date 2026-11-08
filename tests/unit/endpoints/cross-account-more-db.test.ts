/**
 * SECURITY_REPORT 4.8.a (registry-incomplete-1, part 4) against the local database: more
 * endpoints hold on the exact object. Another account cannot rename, delete or share someone's
 * saved list, rename, pause or delete someone's saved search, or read, change or delete another
 * host's listing through the post form. Every refusal is "not found" and nothing changes; the
 * owner then can (so the refusals are about the account, not a broken fixture).
 *
 * Creates its own users (fake @example.com addresses, +995 59… test numbers), lists, saved
 * searches and a draft listing, and removes them afterwards. The session is replaced; the real
 * actions run.
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ user: null as null | { id: string; twoFactorVerified: boolean } }));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ host: "localhost:3000" }), cookies: async () => ({ get: () => undefined }) }));
vi.mock("next/server", async (importOriginal) => ({ ...(await importOriginal<typeof import("next/server")>()), after: () => {} }));
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {}, updateTag: () => {}, unstable_cache: (fn: unknown) => fn }));
vi.mock("next-intl/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next-intl/server")>()),
  getLocale: async () => "he",
  getTranslations: async () => (key: string) => key,
}));
vi.mock("@/lib/request", () => ({ getIpHash: async () => "test-ip", getClientIp: async () => "203.0.113.9" }));
vi.mock("@/lib/security/events", () => ({ recordSecurityEvent: async () => true }));
vi.mock("@/lib/settings", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/settings")>()), assertNotShabbatMode: async () => undefined }));
vi.mock("@/lib/auth/session", async () => {
  const { AuthRequiredError } = await import("@/lib/errors");
  const current = () =>
    state.user
      ? { ...state.user, sessionId: `${state.user.id}-session`, role: "USER", isDemo: false, status: "ACTIVE", locale: "he", currency: null, keepsShabbat: false, phoneNumberVerified: true, businessName: null }
      : null;
  return {
    getCurrentUser: async () => current(),
    requireUserForAction: async () => {
      const user = current();
      if (!user || !user.twoFactorVerified) throw new AuthRequiredError();
      return user;
    },
  };
});

const { db } = await import("@/lib/db");
const lists = await import("@/lib/lists/actions");
const searches = await import("@/lib/saved-searches/actions");
const wizard = await import("@/lib/wizard/actions");

const prefix = `xam${randomUUID().replace(/-/g, "").slice(0, 10)}`;
const digits = String(Date.now() % 1_000_000).padStart(6, "0");
const ids = { owner: "", other: "", list: "", defaultList: "", search: "", listing: "" };
const users: string[] = [];
const as = (id: string | null, twoFactorVerified = true) => {
  state.user = id ? { id, twoFactorVerified } : null;
};

async function makeUser(name: string, last: string) {
  const id = `${prefix}-${name}`;
  await db.user.create({ data: { id, name, firstName: name, email: `${id}@example.com`, phoneNumber: `+99559${digits}${last}`, phoneNumberVerified: true, locale: "he" } });
  users.push(id);
  return id;
}

/** What the other account must not be able to change. */
async function snapshot() {
  const [list, search, listing] = await Promise.all([
    db.savedList.findUnique({ where: { id: ids.list }, select: { name: true, shareToken: true, sharedAt: true } }),
    db.savedSearch.findUnique({ where: { id: ids.search }, select: { name: true, active: true } }),
    db.listing.findUnique({ where: { id: ids.listing }, select: { title: true, status: true, wizardStep: true, updatedAt: true } }),
  ]);
  return { list, search, listing };
}

beforeAll(async () => {
  ids.owner = await makeUser("owner", "01");
  ids.other = await makeUser("other", "02");
  ids.defaultList = (await db.savedList.create({ data: { userId: ids.owner, name: "Saved", isDefault: true } })).id;
  ids.list = (await db.savedList.create({ data: { userId: ids.owner, name: `${prefix} Batumi` } })).id;
  ids.search = (await db.savedSearch.create({ data: { userId: ids.owner, name: `${prefix} search`, filters: { dealType: "SHORT_STAY" } } })).id;
  ids.listing = (await db.listing.create({ data: { ownerId: ids.owner, dealType: "SHORT_STAY", title: `${prefix} flat`, status: "DRAFT" } })).id;
});

afterAll(async () => {
  await db.listing.deleteMany({ where: { ownerId: { in: users } } });
  await db.savedSearch.deleteMany({ where: { userId: { in: users } } });
  await db.savedList.deleteMany({ where: { userId: { in: users } } });
  await db.auditLog.deleteMany({ where: { actorId: { in: users } } });
  await db.rateLimit.deleteMany({ where: { key: { contains: prefix } } });
  await db.user.deleteMany({ where: { id: { in: users } } });
});

describe("lists, saved searches and the post form hold on the exact object (4.8.a)", () => {
  it("another account: cannot rename, delete or share the list", async () => {
    const before = await snapshot();
    as(ids.other);
    expect(await lists.renameListAction({ listId: ids.list, name: "Mine now" })).toMatchObject({ ok: false, error: "not_found" });
    expect(await lists.setListSharingAction({ listId: ids.list, shared: true })).toMatchObject({ ok: false, error: "not_found" });
    expect(await lists.deleteListAction({ listId: ids.list })).toMatchObject({ ok: false, error: "not_found" });
    expect(await snapshot()).toEqual(before);
  });

  it("another account: cannot rename, pause or delete the saved search", async () => {
    const before = await snapshot();
    as(ids.other);
    expect(await searches.renameSavedSearchAction({ id: ids.search, name: "Mine now" })).toMatchObject({ ok: false, error: "not_found" });
    expect(await searches.setSavedSearchActiveAction({ id: ids.search, active: false })).toMatchObject({ ok: false, error: "not_found" });
    expect(await searches.deleteSavedSearchAction({ id: ids.search })).toMatchObject({ ok: false, error: "not_found" });
    expect(await snapshot()).toEqual(before);
  });

  it("another account: cannot read, change or delete the listing through the post form", async () => {
    const before = await snapshot();
    as(ids.other);
    expect(await wizard.loadWizardSnapshot(ids.listing)).toMatchObject({ ok: false, error: "not_found" });
    expect(await wizard.updateDraft(ids.listing, "text", { title: "Taken over" })).toMatchObject({ ok: false, error: "not_found" });
    // Remembering the step is scoped by owner in the query: it answers ok and changes nothing.
    await wizard.saveWizardStep(ids.listing, 3);
    expect(await wizard.deleteDraft(ids.listing)).toMatchObject({ ok: false, error: "not_found" });
    expect(await snapshot()).toEqual(before);
  });

  it("signed out or with the 2-step code pending: refused", async () => {
    for (const [id, verified] of [
      [null, true],
      [ids.owner, false],
    ] as const) {
      as(id, verified);
      expect(await lists.renameListAction({ listId: ids.list, name: "x" })).toMatchObject({ ok: false, error: "auth_required" });
      expect(await searches.deleteSavedSearchAction({ id: ids.search })).toMatchObject({ ok: false, error: "auth_required" });
      expect(await wizard.loadWizardSnapshot(ids.listing)).toMatchObject({ ok: false, error: "auth_required" });
    }
  });

  it("the owner can (the refusals above are about the account)", async () => {
    as(ids.owner);
    expect(await lists.renameListAction({ listId: ids.list, name: `${prefix} Tbilisi` })).toMatchObject({ ok: true });
    expect(await searches.setSavedSearchActiveAction({ id: ids.search, active: false })).toMatchObject({ ok: true });
    expect(await wizard.loadWizardSnapshot(ids.listing)).toMatchObject({ ok: true });
    expect(await wizard.updateDraft(ids.listing, "text", { title: `${prefix} renamed flat` })).toMatchObject({ ok: true });
  });
});
