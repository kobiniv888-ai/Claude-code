"use server";

/**
 * Server actions for saved lists (round 3, brief 7.2). Every action checks the session (except
 * the public card lookup for the device copy), validates its input with zod, is rate-limited and
 * only touches the signed-in user's own lists (./server.ts takes the user's id).
 *
 * A signed-out visitor gets "auth_required" from the account actions: the heart and the sheet
 * then use the device copy (./device.ts) instead.
 */
import { getLocale, getTranslations } from "next-intl/server";
import { z } from "zod";
import { siteConfig } from "@/config/site";
import { isAppLocale } from "@/i18n/locale";
import { ok, fail, runAction, type ActionResult } from "@/lib/action";
import { getCurrentUser, requireUserForAction } from "@/lib/auth/session";
import { getDisplayCurrency, getRates } from "@/lib/currency";
import { getListingCards } from "@/lib/listing/queries";
import type { ListingCardData } from "@/lib/listing/types";
import { assertRateLimit, assertRateLimitByIp } from "@/lib/rate-limit";
import { absoluteUrl } from "@/lib/site-url";
import { DEVICE_MAX_ITEMS, DEVICE_MAX_LISTS, SHARED_LIST_MAX_PLACES, sanitizeDeviceLists } from "./core";
import {
  copySharedList,
  createList,
  createListAndSave,
  deleteList,
  getAccountLists,
  listOfListing,
  mergeDeviceLists,
  renameList,
  saveToList,
  setListSharing,
  type ListSummary,
} from "./server";

const id = z.string().trim().min(1).max(64);
const nameInput = z.string().max(400);
const tokenInput = z.string().regex(/^[A-Za-z0-9_-]{32,64}$/);

async function currentLocale() {
  const locale = await getLocale();
  return isAppLocale(locale) ? locale : siteConfig.i18n.primaryLocale;
}

export type SaveTargets = {
  lists: ListSummary[];
  /** The list this place is in now (null = not saved). */
  currentListId: string | null;
  /** Where the heart saves. */
  targetId: string;
};

/** The sheet's lists for one place ("auth_required" when signed out: the sheet uses the device). */
export async function getSaveTargetsAction(listingId: string): Promise<ActionResult<SaveTargets>> {
  return runAction<SaveTargets>(async () => {
    const user = await requireUserForAction();
    const input = id.safeParse(listingId);
    if (!input.success) return fail("invalid_input");
    await assertRateLimit(`lists-read:${user.id}`, { limit: 120, windowSeconds: 60 });
    const { lists, targetId, rows } = await getAccountLists(user.id);
    return ok({ lists, targetId, currentListId: await listOfListing(user.id, input.data, rows) });
  });
}

/** My lists (the saved page's "move to" sheet). */
export async function getMyListsAction(): Promise<ActionResult<{ lists: ListSummary[]; targetId: string }>> {
  return runAction<{ lists: ListSummary[]; targetId: string }>(async () => {
    const user = await requireUserForAction();
    await assertRateLimit(`lists-read:${user.id}`, { limit: 120, windowSeconds: 60 });
    const { lists, targetId } = await getAccountLists(user.id);
    return ok({ lists, targetId });
  });
}

const saveSchema = z.object({ listingId: id, listId: id.nullable() });

/**
 * Saves a place into a list (null = the list the heart saves to), or moves it there when it is
 * already in another list: one list per place.
 */
export async function saveToListAction(input: { listingId: string; listId: string | null }): Promise<
  ActionResult<{ isFavorite: true; list: ListSummary; moved: boolean; created: boolean }>
> {
  return runAction<{ isFavorite: true; list: ListSummary; moved: boolean; created: boolean }>(async () => {
    const user = await requireUserForAction();
    const parsed = saveSchema.safeParse(input);
    if (!parsed.success) return fail("invalid_input");
    await assertRateLimit(`favorite:${user.id}`, { limit: 60, windowSeconds: 60 });
    const result = await saveToList(user, parsed.data.listingId, parsed.data.listId);
    return ok({ isFavorite: true as const, ...result });
  });
}

const createSchema = z.object({ name: nameInput, listingId: id.nullable().optional() });

/** A new list; with `listingId`, the place is saved (or moved) into it right away. */
export async function createListAction(input: { name: string; listingId?: string | null }): Promise<
  ActionResult<{ list: ListSummary; moved: boolean; created: boolean }>
> {
  return runAction<{ list: ListSummary; moved: boolean; created: boolean }>(async () => {
    const user = await requireUserForAction();
    const parsed = createSchema.safeParse(input);
    if (!parsed.success) return fail("invalid_input");
    await assertRateLimit(`lists-create:${user.id}`, { limit: 20, windowSeconds: 600 });
    if (!parsed.data.listingId) return ok({ list: await createList(user.id, parsed.data.name), moved: false, created: false });
    // Both limits before any write, and the list and the save in one transaction: a save that
    // fails leaves no empty list behind (lists-alerts-11).
    await assertRateLimit(`favorite:${user.id}`, { limit: 60, windowSeconds: 60 });
    return ok(await createListAndSave(user, parsed.data.name, parsed.data.listingId));
  });
}

export async function renameListAction(input: { listId: string; name: string }): Promise<ActionResult<{ list: ListSummary }>> {
  return runAction<{ list: ListSummary }>(async () => {
    const user = await requireUserForAction();
    const parsed = z.object({ listId: id, name: nameInput }).safeParse(input);
    if (!parsed.success) return fail("invalid_input");
    await assertRateLimit(`lists-edit:${user.id}`, { limit: 30, windowSeconds: 60 });
    return ok({ list: await renameList(user.id, parsed.data.listId, parsed.data.name) });
  });
}

/** Deletes a named list; its places move to the default list. */
export async function deleteListAction(input: { listId: string }): Promise<ActionResult<{ movedPlaces: number; defaultListId: string }>> {
  return runAction<{ movedPlaces: number; defaultListId: string }>(async () => {
    const user = await requireUserForAction();
    const parsed = z.object({ listId: id }).safeParse(input);
    if (!parsed.success) return fail("invalid_input");
    await assertRateLimit(`lists-edit:${user.id}`, { limit: 30, windowSeconds: 60 });
    return ok(await deleteList(user.id, parsed.data.listId));
  });
}

/** The link to a shared list, in the owner's language, on the site's permanent address. */
async function shareUrl(token: string): Promise<string> {
  return absoluteUrl(`/${await currentLocale()}/lists/${token}`);
}

/** Sharing on (returns the link; a list that was not shared gets a new one) or off (null). */
export async function setListSharingAction(input: { listId: string; shared: boolean }): Promise<ActionResult<{ url: string | null }>> {
  return runAction<{ url: string | null }>(async () => {
    const user = await requireUserForAction();
    const parsed = z.object({ listId: id, shared: z.boolean() }).safeParse(input);
    if (!parsed.success) return fail("invalid_input");
    await assertRateLimit(`lists-share:${user.id}`, { limit: 20, windowSeconds: 3600 });
    await assertRateLimitByIp("lists-share", { limit: 60, windowSeconds: 3600 });
    const { token } = await setListSharing(user.id, parsed.data.listId, parsed.data.shared);
    return ok({ url: token ? await shareUrl(token) : null });
  });
}

/** Copies a shared list into the signed-in viewer's account as a new list. */
export async function copySharedListAction(input: { token: string }): Promise<ActionResult<{ listId: string; added: number; alreadySaved: number }>> {
  return runAction<{ listId: string; added: number; alreadySaved: number }>(async () => {
    const user = await requireUserForAction();
    const parsed = z.object({ token: tokenInput }).safeParse(input);
    if (!parsed.success) return fail("not_found");
    await assertRateLimit(`lists-copy:${user.id}`, { limit: 10, windowSeconds: 3600 });
    await assertRateLimitByIp("lists-copy", { limit: 30, windowSeconds: 3600 });
    const t = await getTranslations({ locale: await currentLocale(), namespace: "lists" });
    return ok(await copySharedList(user, parsed.data.token, t("copyOfDefaultName")));
  });
}

const deviceSchema = z.object({
  lists: z
    .array(z.object({ key: z.string().max(48), name: nameInput, usedAt: z.number().nullable(), createdAt: z.number() }))
    .max(DEVICE_MAX_LISTS * 2),
  items: z.array(z.object({ listingId: z.string().max(64), listKey: z.string().max(48), savedAt: z.number() })).max(DEVICE_MAX_ITEMS * 2),
  defaultUsedAt: z.number().nullable(),
});

/**
 * At sign-in: the lists this device kept while signed out go into the account (no duplicates,
 * the account wins on conflicts). The browser empties its copy after an "ok".
 */
export async function mergeDeviceListsAction(payload: unknown): Promise<
  ActionResult<{ added: number; kept: number; unavailable: number; listsCreated: number }>
> {
  return runAction<{ added: number; kept: number; unavailable: number; listsCreated: number }>(async () => {
    const user = await requireUserForAction();
    const parsed = deviceSchema.safeParse(payload);
    if (!parsed.success) return fail("invalid_input");
    await assertRateLimit(`lists-merge:${user.id}`, { limit: 10, windowSeconds: 600 });
    return ok(await mergeDeviceLists(user, sanitizeDeviceLists(parsed.data)));
  });
}

/**
 * Cards for the places a signed-out visitor saved on this device (the /saved page). Public data
 * only: listings that are no longer public are left out. Rate-limited by IP.
 */
export async function getDeviceCardsAction(listingIds: string[]): Promise<ActionResult<ListingCardData[]>> {
  return runAction<ListingCardData[]>(async () => {
    const input = z.array(id).max(SHARED_LIST_MAX_PLACES).safeParse(listingIds);
    if (!input.success) return fail("invalid_input");
    if (input.data.length === 0) return ok([]);
    await assertRateLimitByIp("lists-device-cards", { limit: 60, windowSeconds: 60 });
    const [session, locale, rates] = await Promise.all([getCurrentUser(), currentLocale(), getRates()]);
    // A session whose 2-step code is not entered yet counts as signed out (SECURITY_REPORT 4.2.a).
    const user = session?.twoFactorVerified ? session : null;
    const currency = await getDisplayCurrency(user?.currency);
    return ok(await getListingCards(input.data, { locale, currency, rates, userId: user?.id ?? null }));
  });
}
