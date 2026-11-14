import "server-only";
/**
 * Saved lists on the server (round 3, brief 7.2; contract (2)): every database rule of the lists.
 * Callers (./actions.ts, src/lib/listing/favorites.ts, the pages) check the session, validate the
 * input and rate-limit first; the functions here take the user's id and only ever touch that
 * user's own lists and Favorites (or, for a shared list, read its public places).
 *
 * One list per place: Favorite is unique per (userId, listingId) and Favorite.listId says which
 * list; null = the default list. Changes to one user's lists run in a transaction holding that
 * user's advisory lock, so two taps at once can never make two default lists or lose a move.
 */
import { locales } from "@/config/site";
import type { Prisma } from "@/generated/prisma/client";
import { getMessages } from "@/i18n/messages";
import { db } from "@/lib/db";
import { AppError, NotFoundError } from "@/lib/errors";
import { recordSave } from "@/lib/listing/stats";
import { publicListingWhere } from "@/lib/listing/where";
import { photoUrl } from "@/lib/media";
import { randomToken } from "@/lib/crypto";
import { detectContactInfo, hasContactInfo } from "@/lib/risk/contact-info";
import { refusePaymentDetails } from "@/lib/risk/text-guard";
import { getSettings } from "@/lib/settings";
import { ALERT_PRICE_SELECT, headlineAlertPrice } from "./alert-price";
import {
  MAX_LISTS,
  SHARE_TOKEN_BYTES,
  SHARED_LIST_MAX_PLACES,
  deleteListPlan,
  isShareTokenFormat,
  isSharedListOpen,
  listNameKey,
  nextShareState,
  orderLists,
  pickDefaultList,
  pickTargetList,
  planCopy,
  planDeviceMerge,
  reservedNameKeys,
  resolveListId,
  uniqueListName,
  validateListName,
  type DeviceLists,
  type ListSummary,
  type MergeTarget,
} from "./core";

type Tx = Prisma.TransactionClient;

/** The stored name of a default list (it is always shown as the localized "שמורים"). */
const DEFAULT_LIST_STORED_NAME = "שמורים";
/** All of a user's saved places (the same cap as before lists). */
export const MAX_SAVED_PLACES = 1000;

const LIST_SELECT = {
  id: true,
  name: true,
  isDefault: true,
  lastUsedAt: true,
  createdAt: true,
  shareToken: true,
  sharedAt: true,
} as const satisfies Prisma.SavedListSelect;

export type ListRow = Prisma.SavedListGetPayload<{ select: typeof LIST_SELECT }>;

export type { ListSummary };

export class ListError extends AppError {}

/** List names are public on a shared page: no phone numbers, emails, links or @usernames. */
export function listNameHasContactInfo(name: string): boolean {
  return hasContactInfo(detectContactInfo(name));
}

function checkedName(raw: unknown): string {
  const valid = validateListName(raw);
  if (!valid.ok) throw new ListError(valid.error);
  if (listNameHasContactInfo(valid.name)) throw new ListError("name_has_contact");
  return valid.name;
}

/**
 * The default list's name in every language ("שמורים", "Saved", …: messages/<locale>/lists.json
 * saving.defaultName, with admin overrides) and its stored name. A named list may not take one
 * (lists-alerts-10): the default list is shown under it, so there would be two tabs of one name.
 */
export async function reservedListNames(): Promise<string[]> {
  const names = await Promise.all(
    locales.map(async (locale) => {
      const lists = (await getMessages(locale)).lists as { saving?: { defaultName?: unknown } } | undefined;
      return typeof lists?.saving?.defaultName === "string" ? lists.saving.defaultName : null;
    }),
  );
  return [DEFAULT_LIST_STORED_NAME, ...names.filter((name): name is string => !!name)];
}

/**
 * checkedName, no payment details (SECURITY_REPORT 14.2.a: a shared list's name is public; the
 * account is flagged, src/lib/risk/text-guard.ts), and not one of the default list's names.
 */
async function checkedNewName(raw: unknown, userId: string): Promise<string> {
  const name = checkedName(raw);
  if (await refusePaymentDetails({ surface: "list_name", userId, texts: [name] })) throw new ListError("name_has_payment");
  if (reservedNameKeys(await reservedListNames()).has(listNameKey(name))) throw new ListError("name_taken");
  return name;
}

async function lockUser(tx: Tx, userId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`saved-lists:${userId}`}))`;
}

function transaction<T>(userId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.$transaction(async (tx) => {
    await lockUser(tx, userId);
    return fn(tx);
  });
}

/** The user's lists, with the default list created on first use (inside the caller's lock). */
async function listsWithDefault(tx: Tx, userId: string): Promise<{ lists: ListRow[]; fallback: ListRow }> {
  const lists = await tx.savedList.findMany({ where: { userId }, select: LIST_SELECT });
  const existing = pickDefaultList(lists);
  if (existing) return { lists, fallback: existing };
  const created = await tx.savedList.create({ data: { userId, name: DEFAULT_LIST_STORED_NAME, isDefault: true }, select: LIST_SELECT });
  return { lists: [...lists, created], fallback: created };
}

/** The listing as it may be saved: public now, with its headline price for alerts. */
async function saveableListing(tx: Tx | typeof db, listingId: string) {
  const settings = await getSettings();
  return tx.listing.findFirst({
    where: { AND: [{ id: listingId }, publicListingWhere({ demoVisible: settings.demoDataVisible })] },
    select: { id: true, ...ALERT_PRICE_SELECT },
  });
}

function alertFields(listing: Parameters<typeof headlineAlertPrice>[0]) {
  const price = headlineAlertPrice(listing);
  return price ? { alertPrice: price.amount, alertCurrency: price.currency } : { alertPrice: null, alertCurrency: null };
}

/** `isDefault` = THE default list (pickDefaultList), not just the stored flag. */
function summary(list: ListRow, count: number, isDefault = list.isDefault): ListSummary {
  return { id: list.id, name: list.name, isDefault, count, shared: !!(list.shareToken && list.sharedAt) };
}

// ─── Reading ──────────────────────────────────────────────────

/** Places per list id (the default list's id for Favorites without a list). */
async function countsByList(tx: Tx | typeof db, userId: string, lists: readonly ListRow[]): Promise<Map<string, number>> {
  const groups = await tx.favorite.groupBy({ by: ["listId"], where: { userId }, _count: { _all: true } });
  const counts = new Map<string, number>(lists.map((list) => [list.id, 0]));
  for (const group of groups) {
    const id = resolveListId(group.listId, lists);
    if (id) counts.set(id, (counts.get(id) ?? 0) + group._count._all);
  }
  return counts;
}

/**
 * The user's lists in tab order (default first), with their place counts, and the list the
 * heart saves to. Creates the default list when the user has none yet.
 */
export async function getAccountLists(userId: string): Promise<{ lists: ListSummary[]; targetId: string; rows: ListRow[] }> {
  return transaction(userId, async (tx) => {
    const { lists, fallback } = await listsWithDefault(tx, userId);
    const counts = await countsByList(tx, userId, lists);
    const ordered = orderLists(lists);
    const target = pickTargetList(lists)!;
    return {
      lists: ordered.map((list) => summary(list, counts.get(list.id) ?? 0, list.id === fallback.id)),
      targetId: target.id,
      rows: ordered,
    };
  });
}

/** The list a saved place is in (null when the user has not saved it). */
export async function listOfListing(userId: string, listingId: string, lists: readonly ListRow[]): Promise<string | null> {
  const favorite = await db.favorite.findUnique({ where: { userId_listingId: { userId, listingId } }, select: { listId: true } });
  return favorite ? resolveListId(favorite.listId, lists) : null;
}

// ─── Saving and moving ────────────────────────────────────────

export type SaveResult = { list: ListSummary; created: boolean; moved: boolean };

/**
 * Saves a place into a list, or MOVES it there when it is already saved in another one (one list
 * per place). `listId` null = the list the heart saves to (the last one used). The list becomes
 * the last one used. A new save keeps the listing's headline price for price-drop alerts; a move
 * keeps the price it was saved at. Only listings visitors can see may be newly saved.
 */
export async function saveToList(user: { id: string; isStaff?: boolean }, listingId: string, listId: string | null): Promise<SaveResult> {
  const result = await transaction(user.id, async (tx) => {
    const { lists } = await listsWithDefault(tx, user.id);
    const target = listId ? lists.find((list) => list.id === listId) : pickTargetList(lists);
    if (!target) throw new NotFoundError();
    return saveInto(tx, user.id, listingId, lists, target);
  });
  if (result.created) await recordSave(listingId, 1, user);
  return result;
}

/** saveToList's body, inside the caller's transaction (which holds the user's lock). */
async function saveInto(tx: Tx, userId: string, listingId: string, lists: readonly ListRow[], target: ListRow): Promise<SaveResult> {
  const existing = await tx.favorite.findUnique({ where: { userId_listingId: { userId, listingId } }, select: { id: true, listId: true } });
  let created = false;
  let moved = false;
  if (existing) {
    if (resolveListId(existing.listId, lists) !== target.id || existing.listId !== target.id) {
      moved = resolveListId(existing.listId, lists) !== target.id;
      await tx.favorite.update({ where: { id: existing.id }, data: { listId: target.id } });
    }
  } else {
    const listing = await saveableListing(tx, listingId);
    if (!listing) throw new NotFoundError();
    if ((await tx.favorite.count({ where: { userId } })) >= MAX_SAVED_PLACES) throw new ListError("too_many_saved");
    await tx.favorite.create({ data: { userId, listingId, listId: target.id, ...alertFields(listing) } });
    created = true;
  }
  const now = new Date();
  await tx.savedList.update({ where: { id: target.id }, data: { lastUsedAt: now } });
  const isTheDefault = target.id === pickDefaultList(lists)?.id;
  const count = await tx.favorite.count({
    where: target.isDefault && isTheDefault ? { userId, OR: [{ listId: target.id }, { listId: null }] } : { userId, listId: target.id },
  });
  return { list: summary({ ...target, lastUsedAt: now }, count, isTheDefault), created, moved };
}

/** Un-saves a place (from whichever list it is in). True when something was removed. */
export async function removeSaved(user: { id: string; isStaff?: boolean }, listingId: string): Promise<boolean> {
  const { count } = await db.favorite.deleteMany({ where: { userId: user.id, listingId } });
  if (count > 0) await recordSave(listingId, -1, user);
  return count > 0;
}

// ─── Managing lists ───────────────────────────────────────────

/** createList's checks and the new row, inside the caller's transaction. */
async function createIn(tx: Tx, userId: string, name: string): Promise<{ lists: ListRow[]; created: ListRow }> {
  const { lists, fallback } = await listsWithDefault(tx, userId);
  if (lists.length >= MAX_LISTS) throw new ListError("too_many_lists");
  const key = listNameKey(name);
  if (lists.some((list) => list !== fallback && listNameKey(list.name) === key)) throw new ListError("name_taken");
  const created = await tx.savedList.create({ data: { userId, name }, select: LIST_SELECT });
  return { lists: [...lists, created], created };
}

/** A new named list (unique name, not the default list's, no contact details, at most MAX_LISTS lists). */
export async function createList(userId: string, rawName: unknown): Promise<ListSummary> {
  const name = await checkedNewName(rawName, userId);
  return transaction(userId, async (tx) => summary((await createIn(tx, userId, name)).created, 0));
}

/**
 * "New list" in the list sheet (lists-alerts-11): the list and the save in ONE transaction, so a
 * save that fails (the listing went away, too many saved places) leaves no empty list behind and
 * a retry with the same name works.
 */
export async function createListAndSave(user: { id: string; isStaff?: boolean }, rawName: unknown, listingId: string): Promise<SaveResult> {
  const name = await checkedNewName(rawName, user.id);
  const result = await transaction(user.id, async (tx) => {
    const { lists, created } = await createIn(tx, user.id, name);
    return saveInto(tx, user.id, listingId, lists, created);
  });
  if (result.created) await recordSave(listingId, 1, user);
  return result;
}

/** Renames a named list (the default list keeps its name). */
export async function renameList(userId: string, listId: string, rawName: unknown): Promise<ListSummary> {
  const name = await checkedNewName(rawName, userId);
  return transaction(userId, async (tx) => {
    const { lists, fallback } = await listsWithDefault(tx, userId);
    const list = lists.find((l) => l.id === listId);
    if (!list) throw new NotFoundError();
    if (list === fallback) throw new ListError("default_list");
    const key = listNameKey(name);
    if (lists.some((l) => l !== fallback && l.id !== listId && listNameKey(l.name) === key)) throw new ListError("name_taken");
    const updated = await tx.savedList.update({ where: { id: listId }, data: { name }, select: LIST_SELECT });
    const counts = await countsByList(tx, userId, lists);
    return summary(updated, counts.get(listId) ?? 0);
  });
}

/**
 * Deletes a named list. Its places move to the default list (nothing is lost), and when the heart
 * saved to it, it saves to the default list again. Its share link stops working with it.
 */
export async function deleteList(userId: string, listId: string): Promise<{ movedPlaces: number; defaultListId: string }> {
  return transaction(userId, async (tx) => {
    const { lists, fallback } = await listsWithDefault(tx, userId);
    if (!lists.some((l) => l.id === listId)) throw new NotFoundError();
    const plan = deleteListPlan(lists, listId);
    if (!plan.allowed) throw new ListError("default_list");
    const { count } = await tx.favorite.updateMany({ where: { userId, listId }, data: { listId: fallback.id } });
    if (plan.touchDefault) await tx.savedList.update({ where: { id: fallback.id }, data: { lastUsedAt: new Date() } });
    await tx.savedList.delete({ where: { id: listId } });
    return { movedPlaces: count, defaultListId: fallback.id };
  });
}

/**
 * Sharing on or off. On: the live link stays the same; a list that is not shared gets a NEW token.
 * Off: the token is cleared, so the old link stops working (404) for good.
 */
export async function setListSharing(userId: string, listId: string, shared: boolean): Promise<{ token: string | null }> {
  return transaction(userId, async (tx) => {
    const list = await tx.savedList.findFirst({ where: { id: listId, userId }, select: LIST_SELECT });
    if (!list) throw new NotFoundError();
    const next = nextShareState(list, shared, () => randomToken(SHARE_TOKEN_BYTES), new Date());
    if (next.shareToken !== list.shareToken || next.sharedAt?.getTime() !== list.sharedAt?.getTime()) {
      await tx.savedList.update({ where: { id: listId }, data: next });
    }
    return { token: next.sharedAt ? next.shareToken : null };
  });
}

// ─── Shared lists (public, view only) ─────────────────────────

export type SharedList = {
  id: string;
  /** The stored name; for the default list, show the localized "שמורים" instead. */
  name: string;
  isDefault: boolean;
  ownerId: string;
  /** Places that are public NOW, newest saved first (at most SHARED_LIST_MAX_PLACES). */
  listingIds: string[];
};

/**
 * A shared list by its link token, or null (unknown token, sharing stopped, the owner's account
 * closed or suspended). Only places that are public now are listed; nothing about the owner but
 * their id (for "this is your list") leaves this function.
 */
export async function getSharedList(token: string): Promise<SharedList | null> {
  if (!isShareTokenFormat(token)) return null;
  const list = await db.savedList.findUnique({
    where: { shareToken: token },
    select: { ...LIST_SELECT, userId: true, user: { select: { deletedAt: true, status: true } } },
  });
  if (!list || !isSharedListOpen(list, token)) return null;
  if (list.user.deletedAt || (list.user.status !== "ACTIVE" && list.user.status !== "WARNED")) return null;

  const settings = await getSettings();
  // The default list also holds the owner's places saved before lists (listId null).
  const ownerLists = list.isDefault ? await db.savedList.findMany({ where: { userId: list.userId }, select: LIST_SELECT }) : [];
  const isTheDefault = list.isDefault && pickDefaultList(ownerLists)?.id === list.id;
  const rows = await db.favorite.findMany({
    where: {
      userId: list.userId,
      ...(isTheDefault ? { OR: [{ listId: list.id }, { listId: null }] } : { listId: list.id }),
      listing: publicListingWhere({ demoVisible: settings.demoDataVisible }),
    },
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    take: SHARED_LIST_MAX_PLACES,
    select: { listingId: true },
  });
  return { id: list.id, name: list.name, isDefault: isTheDefault, ownerId: list.userId, listingIds: rows.map((row) => row.listingId) };
}

/**
 * Copies a shared list into the viewer's account as a NEW list (named like the shared one, made
 * unique). Places the viewer already saved stay in their own list; the others go into the copy,
 * with today's headline price for alerts. The copy does not become the heart's list.
 */
export async function copySharedList(
  viewer: { id: string; isStaff?: boolean },
  token: string,
  defaultListName: string,
): Promise<{ listId: string; added: number; alreadySaved: number }> {
  const shared = await getSharedList(token);
  if (!shared) throw new NotFoundError();
  if (shared.ownerId === viewer.id) throw new ListError("own_list");

  const reserved = await reservedListNames();
  const result = await transaction(viewer.id, async (tx) => {
    const { lists, fallback } = await listsWithDefault(tx, viewer.id);
    if (lists.length >= MAX_LISTS) throw new ListError("too_many_lists");
    const saved = await tx.favorite.findMany({ where: { userId: viewer.id, listingId: { in: shared.listingIds } }, select: { listingId: true } });
    const plan = planCopy(shared.listingIds, new Set(saved.map((row) => row.listingId)));
    const total = await tx.favorite.count({ where: { userId: viewer.id } });
    const room = Math.max(0, MAX_SAVED_PLACES - total);
    // Never the default list's name in any language (a second "שמורים" tab).
    const name = uniqueListName(shared.isDefault ? defaultListName : shared.name, [...lists.filter((l) => l !== fallback).map((l) => l.name), ...reserved]);
    const list = await tx.savedList.create({ data: { userId: viewer.id, name }, select: { id: true } });
    const settings = await getSettings();
    const listings = await tx.listing.findMany({
      where: { AND: [{ id: { in: plan.add.slice(0, room) } }, publicListingWhere({ demoVisible: settings.demoDataVisible })] },
      select: { id: true, ...ALERT_PRICE_SELECT },
    });
    const byId = new Map(listings.map((l) => [l.id, l]));
    // Oldest first, so the shared list's newest place is also the newest in the copy.
    const base = Date.now() - plan.add.length;
    const data = plan.add
      .filter((id) => byId.has(id))
      .map((listingId, i, all) => ({
        userId: viewer.id,
        listingId,
        listId: list.id,
        createdAt: new Date(base + (all.length - i)),
        ...alertFields(byId.get(listingId)!),
      }));
    const created = data.length ? await tx.favorite.createMany({ data, skipDuplicates: true }) : { count: 0 };
    return { listId: list.id, added: created.count, alreadySaved: plan.alreadySaved.length, listingIds: data.map((d) => d.listingId) };
  });
  for (const listingId of result.listingIds) await recordSave(listingId, 1, viewer);
  return { listId: result.listId, added: result.added, alreadySaved: result.alreadySaved };
}

// ─── The device copy → the account ────────────────────────────

/**
 * Merges a signed-out visitor's device lists into their account at sign-in (planDeviceMerge):
 * no duplicates, the account wins on conflicts, only places that are public now. Returns what
 * happened; the browser then empties its copy.
 */
export async function mergeDeviceLists(
  user: { id: string; isStaff?: boolean },
  device: DeviceLists,
): Promise<{ added: number; kept: number; unavailable: number; listsCreated: number }> {
  const ids = [...new Set(device.items.map((item) => item.listingId))];
  const settings = await getSettings();
  const publicRows = ids.length
    ? await db.listing.findMany({
        where: { AND: [{ id: { in: ids } }, publicListingWhere({ demoVisible: settings.demoDataVisible })] },
        select: { id: true, ...ALERT_PRICE_SELECT },
      })
    : [];
  const byId = new Map(publicRows.map((row) => [row.id, row]));
  const reserved = reservedNameKeys(await reservedListNames());

  const result = await transaction(user.id, async (tx) => {
    const { lists, fallback } = await listsWithDefault(tx, user.id);
    const saved = ids.length ? await tx.favorite.findMany({ where: { userId: user.id, listingId: { in: ids } }, select: { listingId: true } }) : [];
    const total = await tx.favorite.count({ where: { userId: user.id } });
    const plan = planDeviceMerge(
      device,
      { lists, savedListingIds: new Set(saved.map((row) => row.listingId)), publicListingIds: new Set(byId.keys()), reservedNameKeys: reserved },
      (name) => !listNameHasContactInfo(name),
    );
    const createdIds = new Map<string, string>();
    for (const list of plan.create) {
      const row = await tx.savedList.create({ data: { userId: user.id, name: list.name }, select: { id: true } });
      createdIds.set(list.key, row.id);
    }
    const idFor = (target: MergeTarget): string =>
      target.kind === "list" ? target.id : target.kind === "create" ? (createdIds.get(target.key) ?? fallback.id) : fallback.id;

    const room = Math.max(0, MAX_SAVED_PLACES - total);
    // At the cap, the newest device saves win (the plan is oldest first).
    const fits = room > 0 ? plan.add.slice(Math.max(0, plan.add.length - room)) : [];
    const data = fits.map((item) => ({
      userId: user.id,
      listingId: item.listingId,
      listId: idFor(item.target),
      createdAt: new Date(Math.min(item.savedAt, Date.now())),
      ...alertFields(byId.get(item.listingId)!),
    }));
    const created = data.length ? await tx.favorite.createMany({ data, skipDuplicates: true }) : { count: 0 };
    if (plan.lastUsed) {
      await tx.savedList.update({ where: { id: idFor(plan.lastUsed.target) }, data: { lastUsedAt: new Date(Math.min(plan.lastUsed.at, Date.now())) } });
    }
    return {
      added: created.count,
      kept: plan.keptInAccount.length,
      unavailable: plan.unavailable.length,
      listsCreated: plan.create.length,
      listingIds: data.map((d) => d.listingId),
    };
  });
  for (const listingId of result.listingIds) await recordSave(listingId, 1, user);
  return { added: result.added, kept: result.kept, unavailable: result.unavailable, listsCreated: result.listsCreated };
}

/** The share image's photo: the first (newest) public place's card photo. */
export async function sharedListCoverUrl(listingIds: readonly string[]): Promise<string | null> {
  const first = listingIds[0];
  if (!first) return null;
  const photo = await db.listingPhoto.findFirst({
    where: { listingId: first },
    orderBy: [{ isCover: "desc" }, { sortOrder: "asc" }],
    select: { url: true, storageKey: true },
  });
  return photo ? photoUrl(photo, "og") : null;
}

/** A shared list's name as anyone may see it: the localized default name, or a neutral one. */
export function publicListName(list: { name: string; isDefault: boolean }, names: { defaultName: string; fallback: string }): string {
  if (list.isDefault) return names.defaultName;
  return listNameHasContactInfo(list.name) ? names.fallback : list.name;
}
