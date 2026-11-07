/**
 * Saved lists (round 3, brief 7.2; founder's answer 7): the pure rules, shared by the server
 * (./server.ts, ./actions.ts), the heart and the device copy (./device.ts). No database, no
 * browser APIs: every rule here is unit-tested in core.test.ts.
 *
 * - "שמורים" is the user's DEFAULT list (SavedList.isDefault). It cannot be renamed or deleted, and
 *   a Favorite whose listId is null (saved before round 3, or its list was deleted) belongs to it.
 * - Named lists ("בטומי באוגוסט") hold the rest. ONE LIST PER PLACE: Favorite stays unique per
 *   (userId, listingId), so choosing another list MOVES the place.
 * - Tapping the heart saves to the LAST LIST USED: the list with the latest lastUsedAt (every save
 *   or move into a list sets it), the default list when none was used.
 * - Sharing: a private link with an unguessable token, view only. Stopping clears the token, so
 *   the old link stops working; sharing again makes a new token.
 * - Signed-out visitors keep their lists on the device (localStorage) in the same shape; they are
 *   merged into the account at sign-in, without duplicates, and the account wins on conflicts.
 */

/** The longest list name (code points). */
export const LIST_NAME_MAX = 60;
/** Lists per account, the default list included. */
export const MAX_LISTS = 50;
/** Lists and places a signed-out visitor can keep on the device. */
export const DEVICE_MAX_LISTS = 20;
export const DEVICE_MAX_ITEMS = 200;
/** Places shown on a shared list's page (and copied from it). */
export const SHARED_LIST_MAX_PLACES = 100;
/** The share token: 32 random bytes in base64url (43 characters). */
export const SHARE_TOKEN_BYTES = 32;
/** The device copy's key for its default list. */
export const DEVICE_DEFAULT_KEY = "default";

export type ListNameError = "name_required" | "name_too_long";

/** Bidi controls, zero-width characters and the BOM: invisible, and a way to disguise text. */
const INVISIBLE = /[\u061C\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF\u00AD]/g;
// Control characters (tabs and line breaks become spaces first).
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;

/** "  בטומי \n באוגוסט‏ " → "בטומי באוגוסט" (NFC, one space between words, no hidden characters). */
export function normalizeListName(raw: string): string {
  return raw
    .normalize("NFC")
    .replace(/[\t\r\n\u2028\u2029]+/g, " ")
    .replace(CONTROL, "")
    .replace(INVISIBLE, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** The key two names are compared by (merging device lists, copies): case and spacing do not count. */
export function listNameKey(name: string): string {
  return normalizeListName(name).toLocaleLowerCase("en-US");
}

/**
 * The default list's names a named list may not take (lists-alerts-10): "שמורים", "Saved"… — the
 * default list is shown under its localized name, so a named list called that would give two tabs
 * with one name. Pass the names (every language's `lists.saving.defaultName` on the server, the
 * reader's own in the browser); compared by listNameKey.
 */
export function reservedNameKeys(names: Iterable<string>): Set<string> {
  const keys = new Set<string>();
  for (const name of names) {
    const key = listNameKey(name);
    if (key) keys.add(key);
  }
  return keys;
}

const NO_RESERVED: ReadonlySet<string> = new Set();

export function validateListName(raw: unknown): { ok: true; name: string } | { ok: false; error: ListNameError } {
  if (typeof raw !== "string") return { ok: false, error: "name_required" };
  const name = normalizeListName(raw);
  if (name.length === 0) return { ok: false, error: "name_required" };
  if ([...name].length > LIST_NAME_MAX) return { ok: false, error: "name_too_long" };
  return { ok: true, name };
}

/** Cuts a name to LIST_NAME_MAX code points (for copies and suffixes). */
function clip(name: string, max = LIST_NAME_MAX): string {
  const chars = [...name];
  return chars.length > max ? chars.slice(0, max).join("").trim() : name;
}

/**
 * A name that no other list of the user has yet: "בטומי", then "בטומי (2)", "בטומי (3)"… The
 * suffix always fits within LIST_NAME_MAX.
 */
export function uniqueListName(name: string, existing: readonly string[]): string {
  const taken = new Set(existing.map(listNameKey));
  const base = clip(normalizeListName(name));
  if (!taken.has(listNameKey(base))) return base;
  for (let n = 2; n < 1000; n++) {
    const suffix = ` (${n})`;
    const candidate = `${clip(base, LIST_NAME_MAX - suffix.length)}${suffix}`;
    if (!taken.has(listNameKey(candidate))) return candidate;
  }
  return base;
}

// ─── Account lists ────────────────────────────────────────────

/** What the heart, the sheet and the saved page get about a list (never its share token). */
export type ListSummary = { id: string; name: string; isDefault: boolean; count: number; shared: boolean };

export type ListLike = { id: string; isDefault: boolean; lastUsedAt: Date | null; createdAt: Date };

const time = (date: Date | null | undefined) => (date ? date.getTime() : Number.NEGATIVE_INFINITY);

/**
 * THE default list: the oldest list marked isDefault (one per user is kept in code; should a race
 * ever make two, the older one stays the default and the other behaves like a named list).
 */
export function pickDefaultList<L extends ListLike>(lists: readonly L[]): L | null {
  let found: L | null = null;
  for (const list of lists) {
    if (!list.isDefault) continue;
    if (!found || list.createdAt.getTime() < found.createdAt.getTime() || (list.createdAt.getTime() === found.createdAt.getTime() && list.id < found.id)) found = list;
  }
  return found;
}

/** Where the heart saves: the list used last; the default list when none was used (or on a tie). */
export function pickTargetList<L extends ListLike>(lists: readonly L[]): L | null {
  const fallback = pickDefaultList(lists);
  let best: L | null = null;
  for (const list of lists) {
    if (!list.lastUsedAt) continue;
    if (!best || time(list.lastUsedAt) > time(best.lastUsedAt)) best = list;
  }
  if (!best) return fallback;
  if (fallback && fallback !== best && time(fallback.lastUsedAt) === time(best.lastUsedAt)) return fallback;
  return best;
}

/** The list a Favorite is in: its listId when that list exists, otherwise the default list. */
export function resolveListId<L extends ListLike>(listId: string | null | undefined, lists: readonly L[]): string | null {
  if (listId && lists.some((list) => list.id === listId)) return listId;
  return pickDefaultList(lists)?.id ?? null;
}

/** Tabs order: the default list first, then the others from oldest to newest. */
export function orderLists<L extends ListLike>(lists: readonly L[]): L[] {
  const fallback = pickDefaultList(lists);
  return [...lists].sort((a, b) => {
    if (a === fallback) return -1;
    if (b === fallback) return 1;
    return a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id);
  });
}

/**
 * Deleting a list: its places go to the default list (nothing is lost), and when it was the list
 * the heart saved to, the heart goes back to the default list (not to some older list).
 */
export function deleteListPlan<L extends ListLike>(lists: readonly L[], deletedId: string): { allowed: boolean; touchDefault: boolean } {
  const target = lists.find((list) => list.id === deletedId);
  const fallback = pickDefaultList(lists);
  if (!target || target === fallback) return { allowed: false, touchDefault: false };
  return { allowed: true, touchDefault: pickTargetList(lists)?.id === deletedId };
}

// ─── Sharing ──────────────────────────────────────────────────

/** A token as randomToken(SHARE_TOKEN_BYTES) makes it (anything else is not looked up at all). */
export function isShareTokenFormat(token: unknown): token is string {
  return typeof token === "string" && /^[A-Za-z0-9_-]{32,64}$/.test(token);
}

export type ShareState = { shareToken: string | null; sharedAt: Date | null };

/**
 * Sharing on: keeps a live link as it is (sharing twice gives the same link); otherwise a NEW
 * token. Sharing off: clears both, so the old link can never work again.
 */
export function nextShareState(current: ShareState, shared: boolean, newToken: () => string, now: Date): ShareState {
  if (!shared) return { shareToken: null, sharedAt: null };
  if (current.shareToken && current.sharedAt) return current;
  return { shareToken: newToken(), sharedAt: now };
}

/** The link opens only while the list is shared, and only with its own token. */
export function isSharedListOpen(list: ShareState | null | undefined, token: string): boolean {
  return !!list && !!list.sharedAt && !!list.shareToken && list.shareToken === token;
}

/**
 * Copying a shared list: the places the viewer has not saved yet go into the new list; places
 * they already saved STAY in their own list (a copy never reorganizes the viewer's lists).
 */
export function planCopy(sourceListingIds: readonly string[], viewerSaved: ReadonlySet<string>): { add: string[]; alreadySaved: string[] } {
  const add: string[] = [];
  const alreadySaved: string[] = [];
  const seen = new Set<string>();
  for (const id of sourceListingIds.slice(0, SHARED_LIST_MAX_PLACES)) {
    if (seen.has(id)) continue;
    seen.add(id);
    (viewerSaved.has(id) ? alreadySaved : add).push(id);
  }
  return { add, alreadySaved };
}

// ─── The device copy (signed-out visitors) ────────────────────

export type DeviceList = { key: string; name: string; usedAt: number | null; createdAt: number };
export type DeviceItem = { listingId: string; listKey: string; savedAt: number };
/** The default list is implicit (DEVICE_DEFAULT_KEY): `lists` holds the named ones. */
export type DeviceLists = { lists: DeviceList[]; items: DeviceItem[]; defaultUsedAt: number | null };

export const EMPTY_DEVICE_LISTS: DeviceLists = Object.freeze({ lists: [], items: [], defaultUsedAt: null }) as DeviceLists;

const LISTING_ID = /^[A-Za-z0-9_-]{1,64}$/;
const LIST_KEY = /^d_[A-Za-z0-9_-]{4,40}$/;

function finiteTime(value: unknown, now: number): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 && value <= now + 86_400_000 ? Math.floor(value) : null;
}

/**
 * What localStorage holds, made safe: unknown shapes are dropped, names are normalized, each
 * place appears once (the newest save wins), places of an unknown list go to the default list,
 * and the caps apply. Never throws.
 */
export function sanitizeDeviceLists(value: unknown, now = Date.now()): DeviceLists {
  if (!value || typeof value !== "object") return EMPTY_DEVICE_LISTS;
  const raw = value as { lists?: unknown; items?: unknown; defaultUsedAt?: unknown };
  const lists: DeviceList[] = [];
  const keys = new Set<string>();
  const names = new Set<string>();
  for (const entry of Array.isArray(raw.lists) ? raw.lists : []) {
    if (lists.length >= DEVICE_MAX_LISTS) break;
    if (!entry || typeof entry !== "object") continue;
    const { key, name, usedAt, createdAt } = entry as Record<string, unknown>;
    if (typeof key !== "string" || !LIST_KEY.test(key) || keys.has(key)) continue;
    const valid = validateListName(name);
    if (!valid.ok || names.has(listNameKey(valid.name))) continue;
    keys.add(key);
    names.add(listNameKey(valid.name));
    lists.push({ key, name: valid.name, usedAt: finiteTime(usedAt, now), createdAt: finiteTime(createdAt, now) ?? now });
  }
  const byListing = new Map<string, DeviceItem>();
  for (const entry of Array.isArray(raw.items) ? raw.items : []) {
    if (!entry || typeof entry !== "object") continue;
    const { listingId, listKey, savedAt } = entry as Record<string, unknown>;
    if (typeof listingId !== "string" || !LISTING_ID.test(listingId)) continue;
    const key = typeof listKey === "string" && keys.has(listKey) ? listKey : DEVICE_DEFAULT_KEY;
    const at = finiteTime(savedAt, now) ?? now;
    const prev = byListing.get(listingId);
    if (!prev || at > prev.savedAt) byListing.set(listingId, { listingId, listKey: key, savedAt: at });
  }
  const items = [...byListing.values()].sort((a, b) => b.savedAt - a.savedAt).slice(0, DEVICE_MAX_ITEMS);
  return { lists, items, defaultUsedAt: finiteTime(raw.defaultUsedAt, now) };
}

export function isDeviceListsEmpty(state: DeviceLists): boolean {
  return state.items.length === 0 && state.lists.length === 0;
}

/** The device list the heart saves to: the one used last, the default list otherwise (and on a tie). */
export function deviceTargetKey(state: DeviceLists): string {
  let key = DEVICE_DEFAULT_KEY;
  let at = state.defaultUsedAt ?? Number.NEGATIVE_INFINITY;
  for (const list of state.lists) {
    if (list.usedAt !== null && list.usedAt > at) {
      key = list.key;
      at = list.usedAt;
    }
  }
  return key;
}

export function deviceListOf(state: DeviceLists, listingId: string): string | null {
  return state.items.find((item) => item.listingId === listingId)?.listKey ?? null;
}

function touch(state: DeviceLists, key: string, now: number): Pick<DeviceLists, "lists" | "defaultUsedAt"> {
  if (key === DEVICE_DEFAULT_KEY) return { lists: state.lists, defaultUsedAt: now };
  return { lists: state.lists.map((list) => (list.key === key ? { ...list, usedAt: now } : list)), defaultUsedAt: state.defaultUsedAt };
}

/**
 * Saves a place on the device: into `listKey` (moving it there when it is in another list), or
 * into the last list used. The list becomes the last one used. Null when the device is full.
 */
export function deviceSave(state: DeviceLists, listingId: string, listKey: string | null, now = Date.now()): DeviceLists | null {
  if (!LISTING_ID.test(listingId)) return null;
  const key = listKey && (listKey === DEVICE_DEFAULT_KEY || state.lists.some((list) => list.key === listKey)) ? listKey : deviceTargetKey(state);
  const others = state.items.filter((item) => item.listingId !== listingId);
  const existing = state.items.find((item) => item.listingId === listingId);
  if (!existing && others.length >= DEVICE_MAX_ITEMS) return null;
  const item: DeviceItem = { listingId, listKey: key, savedAt: existing?.savedAt ?? now };
  return { ...touch(state, key, now), items: [item, ...others] };
}

export function deviceRemove(state: DeviceLists, listingId: string): DeviceLists {
  return { ...state, items: state.items.filter((item) => item.listingId !== listingId) };
}

export type DeviceListError = ListNameError | "too_many_lists" | "name_taken" | "not_found";

/** A new named list on the device (`key` from the caller, e.g. "d_" + random). */
export function deviceCreateList(
  state: DeviceLists,
  rawName: string,
  key: string,
  now = Date.now(),
  /** reservedNameKeys(): the default list's names. */
  reserved: ReadonlySet<string> = NO_RESERVED,
): { ok: true; state: DeviceLists; key: string } | { ok: false; error: DeviceListError } {
  const valid = validateListName(rawName);
  if (!valid.ok) return valid;
  const nameKey = listNameKey(valid.name);
  if (reserved.has(nameKey)) return { ok: false, error: "name_taken" };
  if (state.lists.length >= DEVICE_MAX_LISTS) return { ok: false, error: "too_many_lists" };
  if (!LIST_KEY.test(key)) return { ok: false, error: "not_found" };
  const same = state.lists.find((list) => listNameKey(list.name) === nameKey);
  if (same) return { ok: true, state, key: same.key };
  return { ok: true, state: { ...state, lists: [...state.lists, { key, name: valid.name, usedAt: null, createdAt: now }] }, key };
}

export function deviceRenameList(
  state: DeviceLists,
  key: string,
  rawName: string,
  /** reservedNameKeys(): the default list's names. */
  reserved: ReadonlySet<string> = NO_RESERVED,
): { ok: true; state: DeviceLists } | { ok: false; error: DeviceListError } {
  const valid = validateListName(rawName);
  if (!valid.ok) return valid;
  if (!state.lists.some((list) => list.key === key)) return { ok: false, error: "not_found" };
  const nameKey = listNameKey(valid.name);
  if (reserved.has(nameKey)) return { ok: false, error: "name_taken" };
  if (state.lists.some((list) => list.key !== key && listNameKey(list.name) === nameKey)) return { ok: false, error: "name_taken" };
  return { ok: true, state: { ...state, lists: state.lists.map((list) => (list.key === key ? { ...list, name: valid.name } : list)) } };
}

/** Deletes a named device list: its places go to the default list (and so does the heart, when it saved there). */
export function deviceDeleteList(state: DeviceLists, key: string, now = Date.now()): DeviceLists {
  if (!state.lists.some((list) => list.key === key)) return state;
  const wasTarget = deviceTargetKey(state) === key;
  return {
    lists: state.lists.filter((list) => list.key !== key),
    items: state.items.map((item) => (item.listKey === key ? { ...item, listKey: DEVICE_DEFAULT_KEY } : item)),
    defaultUsedAt: wasTarget ? now : state.defaultUsedAt,
  };
}

/** Places per device list key (the default list under DEVICE_DEFAULT_KEY). */
export function deviceCounts(state: DeviceLists): Record<string, number> {
  const counts: Record<string, number> = { [DEVICE_DEFAULT_KEY]: 0 };
  for (const list of state.lists) counts[list.key] = 0;
  for (const item of state.items) counts[item.listKey] = (counts[item.listKey] ?? 0) + 1;
  return counts;
}

// ─── Merging the device copy into the account ─────────────────

/** Where a device list's places go: an existing account list, a list to create, or the default. */
export type MergeTarget = { kind: "list"; id: string } | { kind: "create"; key: string } | { kind: "default" };

export type MergePlan = {
  /** Named device lists the account does not have yet (by name), in device order. */
  create: { key: string; name: string; usedAt: number | null }[];
  /** Every device list key (and DEVICE_DEFAULT_KEY) → its target. */
  targets: Record<string, MergeTarget>;
  /** Places to save, oldest first (so the newest ends up newest). */
  add: { listingId: string; target: MergeTarget; savedAt: number }[];
  /** Places the account already has: the account wins, they stay where they are. */
  keptInAccount: string[];
  /** Places that are not public any more (or unknown): not saved. */
  unavailable: string[];
  /** The list the heart should save to next, when the device used it more recently than the account. */
  lastUsed: { target: MergeTarget; at: number } | null;
};

/**
 * Plans the merge (pure; ./server.ts carries it out in one transaction).
 * - The device's default list → the account's default list.
 * - A named device list → the account list with the same name (case and spacing ignored), or a
 *   new list; when the account is at MAX_LISTS, or the name is refused (`nameAllowed`), its
 *   places go to the default list. A device list named like the default list in any language
 *   (`reservedNameKeys`, "Saved", "שמורים") IS the default list.
 * - No duplicates, and the account wins: a place the account already saved keeps its list.
 * - Only places that are public now are saved.
 * - Last list used: the device's, when it is more recent than any use on the account.
 */
export function planDeviceMerge(
  device: DeviceLists,
  account: {
    lists: readonly { id: string; name: string; isDefault: boolean; lastUsedAt: Date | null; createdAt: Date }[];
    savedListingIds: ReadonlySet<string>;
    publicListingIds: ReadonlySet<string>;
    /** reservedNameKeys(): the default list's names in every language. */
    reservedNameKeys?: ReadonlySet<string>;
  },
  nameAllowed: (name: string) => boolean = () => true,
): MergePlan {
  const reserved = account.reservedNameKeys ?? NO_RESERVED;
  const fallback = pickDefaultList(account.lists);
  const byName = new Map<string, string>();
  for (const list of account.lists) {
    if (list === fallback) continue;
    const key = listNameKey(list.name);
    if (!byName.has(key)) byName.set(key, list.id);
  }
  const targets: Record<string, MergeTarget> = { [DEVICE_DEFAULT_KEY]: { kind: "default" } };
  const create: MergePlan["create"] = [];
  let room = Math.max(0, MAX_LISTS - account.lists.length - (fallback ? 0 : 1));
  const createdByName = new Map<string, string>();
  for (const list of device.lists) {
    const nameKey = listNameKey(list.name);
    const existing = byName.get(nameKey);
    if (reserved.has(nameKey)) {
      targets[list.key] = { kind: "default" };
    } else if (existing) {
      targets[list.key] = { kind: "list", id: existing };
    } else if (createdByName.has(nameKey)) {
      targets[list.key] = { kind: "create", key: createdByName.get(nameKey)! };
    } else if (room > 0 && nameAllowed(list.name)) {
      room -= 1;
      createdByName.set(nameKey, list.key);
      create.push({ key: list.key, name: list.name, usedAt: list.usedAt });
      targets[list.key] = { kind: "create", key: list.key };
    } else {
      targets[list.key] = { kind: "default" };
    }
  }

  const add: MergePlan["add"] = [];
  const keptInAccount: string[] = [];
  const unavailable: string[] = [];
  for (const item of [...device.items].sort((a, b) => a.savedAt - b.savedAt)) {
    if (account.savedListingIds.has(item.listingId)) keptInAccount.push(item.listingId);
    else if (!account.publicListingIds.has(item.listingId)) unavailable.push(item.listingId);
    else add.push({ listingId: item.listingId, target: targets[item.listKey] ?? { kind: "default" }, savedAt: item.savedAt });
  }

  const accountLatest = Math.max(Number.NEGATIVE_INFINITY, ...account.lists.map((list) => time(list.lastUsedAt)));
  const deviceKey = deviceTargetKey(device);
  const deviceAt = deviceKey === DEVICE_DEFAULT_KEY ? device.defaultUsedAt : (device.lists.find((list) => list.key === deviceKey)?.usedAt ?? null);
  const lastUsed = deviceAt !== null && deviceAt > accountLatest ? { target: targets[deviceKey] ?? { kind: "default" as const }, at: deviceAt } : null;

  return { create, targets, add, keptInAccount, unavailable, lastUsed };
}
