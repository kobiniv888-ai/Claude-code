import { describe, expect, it } from "vitest";
import {
  DEVICE_DEFAULT_KEY,
  DEVICE_MAX_ITEMS,
  DEVICE_MAX_LISTS,
  EMPTY_DEVICE_LISTS,
  LIST_NAME_MAX,
  MAX_LISTS,
  SHARED_LIST_MAX_PLACES,
  deleteListPlan,
  deviceCounts,
  deviceCreateList,
  deviceDeleteList,
  deviceListOf,
  deviceRemove,
  deviceRenameList,
  deviceSave,
  deviceTargetKey,
  isDeviceListsEmpty,
  isShareTokenFormat,
  isSharedListOpen,
  listNameKey,
  nextShareState,
  normalizeListName,
  orderLists,
  pickDefaultList,
  pickTargetList,
  planCopy,
  planDeviceMerge,
  reservedNameKeys,
  resolveListId,
  sanitizeDeviceLists,
  uniqueListName,
  validateListName,
  type DeviceLists,
  type ListLike,
} from "./core";

const at = (iso: string) => new Date(`${iso}T12:00:00.000Z`);
const list = (id: string, extra: Partial<ListLike & { name: string }> = {}) => ({
  id,
  name: id,
  isDefault: false,
  lastUsedAt: null,
  createdAt: at("2026-01-01"),
  ...extra,
});

describe("list names", () => {
  it("normalizes spacing, line breaks and hidden characters", () => {
    expect(normalizeListName("  בטומי \n\t באוגוסט\u200F ")).toBe("בטומי באוגוסט");
    expect(normalizeListName("a\u202Eb\u0000c")).toBe("abc");
    expect(listNameKey(" Batumi  August ")).toBe(listNameKey("batumi august"));
  });

  it("needs a name of at most LIST_NAME_MAX characters", () => {
    expect(validateListName("   ")).toEqual({ ok: false, error: "name_required" });
    expect(validateListName(42)).toEqual({ ok: false, error: "name_required" });
    expect(validateListName("א".repeat(LIST_NAME_MAX))).toEqual({ ok: true, name: "א".repeat(LIST_NAME_MAX) });
    expect(validateListName("א".repeat(LIST_NAME_MAX + 1))).toEqual({ ok: false, error: "name_too_long" });
    // Code points, not UTF-16 units: 60 emoji-free Georgian letters fit.
    expect(validateListName("ბ".repeat(LIST_NAME_MAX)).ok).toBe(true);
  });

  it("makes a copy's name unique, within the length limit", () => {
    expect(uniqueListName("בטומי", ["תל אביב"])).toBe("בטומי");
    expect(uniqueListName("בטומי", ["בטומי"])).toBe("בטומי (2)");
    expect(uniqueListName("Batumi", ["batumi", "Batumi (2)"])).toBe("Batumi (3)");
    const long = "x".repeat(LIST_NAME_MAX);
    const copy = uniqueListName(long, [long]);
    expect(copy.endsWith(" (2)")).toBe(true);
    expect([...copy].length).toBeLessThanOrEqual(LIST_NAME_MAX);
  });
});

describe("default list and the last list used", () => {
  it("picks the oldest default list (should a race ever make two)", () => {
    const a = list("a", { isDefault: true, createdAt: at("2026-03-01") });
    const b = list("b", { isDefault: true, createdAt: at("2026-02-01") });
    expect(pickDefaultList([a, b])).toBe(b);
    expect(pickDefaultList([list("c")])).toBeNull();
  });

  it("the heart saves to the list used last, the default list when none was used", () => {
    const fallback = list("default", { isDefault: true });
    const batumi = list("batumi", { lastUsedAt: at("2026-08-01") });
    const tbilisi = list("tbilisi", { lastUsedAt: at("2026-07-01") });
    expect(pickTargetList([fallback, list("x")])).toBe(fallback);
    expect(pickTargetList([fallback, batumi, tbilisi])).toBe(batumi);
    // A tie goes to the default list.
    expect(pickTargetList([{ ...fallback, lastUsedAt: at("2026-08-01") }, batumi])?.id).toBe("default");
  });

  it("a place without a list (or with a deleted one) is in the default list", () => {
    const lists = [list("default", { isDefault: true }), list("batumi")];
    expect(resolveListId(null, lists)).toBe("default");
    expect(resolveListId("gone", lists)).toBe("default");
    expect(resolveListId("batumi", lists)).toBe("batumi");
  });

  it("orders the tabs: default first, then oldest to newest", () => {
    const lists = [list("new", { createdAt: at("2026-05-01") }), list("old", { createdAt: at("2026-02-01") }), list("default", { isDefault: true, createdAt: at("2026-04-01") })];
    expect(orderLists(lists).map((l) => l.id)).toEqual(["default", "old", "new"]);
  });

  it("deleting a list: never the default; the heart goes back to the default list", () => {
    const fallback = list("default", { isDefault: true });
    const batumi = list("batumi", { lastUsedAt: at("2026-08-01") });
    const tbilisi = list("tbilisi", { lastUsedAt: at("2026-07-01") });
    expect(deleteListPlan([fallback, batumi, tbilisi], "default")).toEqual({ allowed: false, touchDefault: false });
    expect(deleteListPlan([fallback, batumi, tbilisi], "missing").allowed).toBe(false);
    expect(deleteListPlan([fallback, batumi, tbilisi], "batumi")).toEqual({ allowed: true, touchDefault: true });
    expect(deleteListPlan([fallback, batumi, tbilisi], "tbilisi")).toEqual({ allowed: true, touchDefault: false });
  });
});

describe("sharing", () => {
  const now = at("2026-11-07");
  let n = 0;
  const token = () => `token-${++n}-${"x".repeat(40)}`;

  it("accepts only tokens in the generated format", () => {
    expect(isShareTokenFormat("a".repeat(43))).toBe(true);
    expect(isShareTokenFormat("short")).toBe(false);
    expect(isShareTokenFormat("a".repeat(42) + "/")).toBe(false);
    expect(isShareTokenFormat(undefined)).toBe(false);
  });

  it("on: a new token; on again: the same link; off: cleared; on again: a NEW token", () => {
    const first = nextShareState({ shareToken: null, sharedAt: null }, true, token, now);
    expect(first.shareToken).toMatch(/^token-1-/);
    expect(first.sharedAt).toEqual(now);
    expect(nextShareState(first, true, token, now)).toBe(first);
    const off = nextShareState(first, false, token, now);
    expect(off).toEqual({ shareToken: null, sharedAt: null });
    const again = nextShareState(off, true, token, now);
    expect(again.shareToken).not.toBe(first.shareToken);
    // A token left over without sharedAt is never reused.
    expect(nextShareState({ shareToken: "old", sharedAt: null }, true, token, now).shareToken).not.toBe("old");
  });

  it("the link opens only while shared, with its own token", () => {
    const shared = { shareToken: "abc", sharedAt: now };
    expect(isSharedListOpen(shared, "abc")).toBe(true);
    expect(isSharedListOpen(shared, "abd")).toBe(false);
    expect(isSharedListOpen({ shareToken: "abc", sharedAt: null }, "abc")).toBe(false);
    expect(isSharedListOpen({ shareToken: null, sharedAt: now }, "abc")).toBe(false);
    expect(isSharedListOpen(null, "abc")).toBe(false);
  });

  it("copy: places already saved stay where they are, the rest go into the copy", () => {
    const plan = planCopy(["a", "b", "c", "b"], new Set(["b"]));
    expect(plan).toEqual({ add: ["a", "c"], alreadySaved: ["b"] });
    const many = Array.from({ length: SHARED_LIST_MAX_PLACES + 5 }, (_, i) => `l${i}`);
    expect(planCopy(many, new Set()).add).toHaveLength(SHARED_LIST_MAX_PLACES);
  });
});

describe("device lists", () => {
  const T0 = Date.UTC(2026, 10, 1);

  it("sanitizes what localStorage holds", () => {
    expect(sanitizeDeviceLists(null)).toBe(EMPTY_DEVICE_LISTS);
    expect(sanitizeDeviceLists("x")).toBe(EMPTY_DEVICE_LISTS);
    const state = sanitizeDeviceLists(
      {
        lists: [
          { key: "d_abcd1234", name: "  Batumi ", usedAt: T0, createdAt: T0 },
          { key: "d_abcd1234", name: "Dup key", usedAt: null, createdAt: T0 },
          { key: "d_efgh5678", name: "batumi", usedAt: null, createdAt: T0 },
          { key: "bad key", name: "Bad", usedAt: null, createdAt: T0 },
          { key: "d_ijkl9012", name: "", usedAt: null, createdAt: T0 },
        ],
        items: [
          { listingId: "l1", listKey: "d_abcd1234", savedAt: T0 },
          { listingId: "l1", listKey: DEVICE_DEFAULT_KEY, savedAt: T0 + 5 },
          { listingId: "l2", listKey: "d_gone0000", savedAt: T0 },
          { listingId: "bad id!", listKey: DEVICE_DEFAULT_KEY, savedAt: T0 },
          { listingId: "l3", listKey: DEVICE_DEFAULT_KEY, savedAt: "yesterday" },
        ],
        defaultUsedAt: "never",
      },
      T0 + 1000,
    );
    expect(state.lists.map((l) => [l.key, l.name])).toEqual([["d_abcd1234", "Batumi"]]);
    expect(state.items).toEqual([
      { listingId: "l3", listKey: DEVICE_DEFAULT_KEY, savedAt: T0 + 1000 },
      { listingId: "l1", listKey: DEVICE_DEFAULT_KEY, savedAt: T0 + 5 },
      { listingId: "l2", listKey: DEVICE_DEFAULT_KEY, savedAt: T0 },
    ]);
    expect(state.defaultUsedAt).toBeNull();
  });

  it("caps lists and places", () => {
    const lists = Array.from({ length: DEVICE_MAX_LISTS + 3 }, (_, i) => ({ key: `d_key${String(i).padStart(4, "0")}`, name: `List ${i}`, usedAt: null, createdAt: T0 }));
    const items = Array.from({ length: DEVICE_MAX_ITEMS + 3 }, (_, i) => ({ listingId: `l${i}`, listKey: DEVICE_DEFAULT_KEY, savedAt: T0 + i }));
    const state = sanitizeDeviceLists({ lists, items }, T0 + 10_000);
    expect(state.lists).toHaveLength(DEVICE_MAX_LISTS);
    expect(state.items).toHaveLength(DEVICE_MAX_ITEMS);
    expect(state.items[0].listingId).toBe(`l${DEVICE_MAX_ITEMS + 2}`);
  });

  it("saves to the last list used, moves between lists (one list per place), removes", () => {
    let state: DeviceLists = EMPTY_DEVICE_LISTS;
    expect(isDeviceListsEmpty(state)).toBe(true);
    state = deviceSave(state, "l1", null, T0)!;
    expect(deviceListOf(state, "l1")).toBe(DEVICE_DEFAULT_KEY);
    const created = deviceCreateList(state, "בטומי באוגוסט", "d_batumi01", T0 + 1);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    state = deviceSave(created.state, "l2", created.key, T0 + 2)!;
    expect(deviceTargetKey(state)).toBe("d_batumi01");
    // The heart now saves to the list used last.
    state = deviceSave(state, "l3", null, T0 + 3)!;
    expect(deviceListOf(state, "l3")).toBe("d_batumi01");
    // Choosing another list moves the place.
    state = deviceSave(state, "l1", "d_batumi01", T0 + 4)!;
    expect(state.items.filter((i) => i.listingId === "l1")).toHaveLength(1);
    expect(deviceListOf(state, "l1")).toBe("d_batumi01");
    expect(deviceCounts(state)).toEqual({ [DEVICE_DEFAULT_KEY]: 0, d_batumi01: 3 });
    state = deviceRemove(state, "l1");
    expect(deviceListOf(state, "l1")).toBeNull();
  });

  it("refuses a save when the device is full, and duplicate or bad list names", () => {
    const items = Array.from({ length: DEVICE_MAX_ITEMS }, (_, i) => ({ listingId: `l${i}`, listKey: DEVICE_DEFAULT_KEY, savedAt: T0 }));
    const full: DeviceLists = { lists: [], items, defaultUsedAt: null };
    expect(deviceSave(full, "new", null, T0)).toBeNull();
    // Moving one that is already there still works.
    expect(deviceSave(full, "l0", DEVICE_DEFAULT_KEY, T0)).not.toBeNull();

    const one = deviceCreateList(EMPTY_DEVICE_LISTS, "Batumi", "d_batumi01", T0);
    if (!one.ok) throw new Error("expected ok");
    const same = deviceCreateList(one.state, " batumi ", "d_other001", T0);
    expect(same).toMatchObject({ ok: true, key: "d_batumi01" });
    expect(deviceCreateList(one.state, "  ", "d_other001", T0)).toEqual({ ok: false, error: "name_required" });
    const two = deviceCreateList(one.state, "Kobuleti", "d_kobu0001", T0);
    if (!two.ok) throw new Error("expected ok");
    expect(deviceRenameList(two.state, "d_kobu0001", "BATUMI")).toEqual({ ok: false, error: "name_taken" });
    expect(deviceRenameList(two.state, "d_kobu0001", "Kobuleti 2026").ok).toBe(true);
    const tooMany: DeviceLists = { lists: Array.from({ length: DEVICE_MAX_LISTS }, (_, i) => ({ key: `d_k${String(i).padStart(5, "0")}`, name: `L${i}`, usedAt: null, createdAt: T0 })), items: [], defaultUsedAt: null };
    expect(deviceCreateList(tooMany, "One more", "d_onemore1", T0)).toEqual({ ok: false, error: "too_many_lists" });
  });

  it("a device list can never take the default list's name (lists-alerts-10)", () => {
    const reserved = reservedNameKeys(["שמורים", "Saved"]);
    expect(deviceCreateList(EMPTY_DEVICE_LISTS, " saved ", "d_saved0001", T0, reserved)).toEqual({ ok: false, error: "name_taken" });
    expect(deviceCreateList(EMPTY_DEVICE_LISTS, "שמורים", "d_saved0001", T0, reserved)).toEqual({ ok: false, error: "name_taken" });
    const made = deviceCreateList(EMPTY_DEVICE_LISTS, "Batumi", "d_batumi01", T0, reserved);
    if (!made.ok) throw new Error("expected ok");
    expect(deviceRenameList(made.state, "d_batumi01", "SAVED", reserved)).toEqual({ ok: false, error: "name_taken" });
    expect(deviceRenameList(made.state, "d_batumi01", "Batumi 2027", reserved).ok).toBe(true);
  });

  it("deleting a device list moves its places to the default list, and the heart too", () => {
    const created = deviceCreateList(EMPTY_DEVICE_LISTS, "Batumi", "d_batumi01", T0);
    if (!created.ok) throw new Error("expected ok");
    let state = deviceSave(created.state, "l1", "d_batumi01", T0 + 1)!;
    expect(deviceTargetKey(state)).toBe("d_batumi01");
    state = deviceDeleteList(state, "d_batumi01", T0 + 2);
    expect(state.lists).toEqual([]);
    expect(deviceListOf(state, "l1")).toBe(DEVICE_DEFAULT_KEY);
    expect(deviceTargetKey(state)).toBe(DEVICE_DEFAULT_KEY);
  });
});

describe("merging the device copy into the account", () => {
  const T0 = Date.UTC(2026, 10, 1);
  const accountLists = [
    { id: "acc-default", name: "שמורים", isDefault: true, lastUsedAt: at("2026-10-01"), createdAt: at("2026-01-01") },
    { id: "acc-batumi", name: "Batumi", isDefault: false, lastUsedAt: null, createdAt: at("2026-02-01") },
  ];
  const device: DeviceLists = {
    lists: [
      { key: "d_batumi01", name: "batumi", usedAt: T0 + 3, createdAt: T0 },
      { key: "d_kobu0001", name: "Kobuleti", usedAt: null, createdAt: T0 },
      { key: "d_phone001", name: "Call 555 123 456", usedAt: null, createdAt: T0 },
    ],
    items: [
      { listingId: "in-account", listKey: "d_kobu0001", savedAt: T0 + 1 },
      { listingId: "to-batumi", listKey: "d_batumi01", savedAt: T0 + 2 },
      { listingId: "to-kobuleti", listKey: "d_kobu0001", savedAt: T0 + 3 },
      { listingId: "to-default", listKey: DEVICE_DEFAULT_KEY, savedAt: T0 },
      { listingId: "hidden-now", listKey: DEVICE_DEFAULT_KEY, savedAt: T0 },
      { listingId: "phone-list", listKey: "d_phone001", savedAt: T0 + 4 },
    ],
    defaultUsedAt: null,
  };
  const plan = planDeviceMerge(
    device,
    {
      lists: accountLists,
      savedListingIds: new Set(["in-account"]),
      publicListingIds: new Set(["in-account", "to-batumi", "to-kobuleti", "to-default", "phone-list"]),
    },
    (name) => !/\d{3}/.test(name),
  );

  it("maps lists by name (the default to the default), creating only the missing ones", () => {
    expect(plan.targets).toEqual({
      [DEVICE_DEFAULT_KEY]: { kind: "default" },
      d_batumi01: { kind: "list", id: "acc-batumi" },
      d_kobu0001: { kind: "create", key: "d_kobu0001" },
      d_phone001: { kind: "default" },
    });
    expect(plan.create).toEqual([{ key: "d_kobu0001", name: "Kobuleti", usedAt: null }]);
  });

  it("no duplicates, the account wins, only public places, oldest first", () => {
    expect(plan.keptInAccount).toEqual(["in-account"]);
    expect(plan.unavailable).toEqual(["hidden-now"]);
    expect(plan.add.map((a) => a.listingId)).toEqual(["to-default", "to-batumi", "to-kobuleti", "phone-list"]);
    expect(plan.add.find((a) => a.listingId === "phone-list")?.target).toEqual({ kind: "default" });
  });

  it("keeps the device's last list used when it is more recent than the account's", () => {
    expect(plan.lastUsed).toEqual({ target: { kind: "list", id: "acc-batumi" }, at: T0 + 3 });
    const older = planDeviceMerge(
      { ...device, lists: device.lists.map((l) => ({ ...l, usedAt: Date.UTC(2025, 0, 1) })) },
      { lists: accountLists, savedListingIds: new Set(), publicListingIds: new Set() },
    );
    expect(older.lastUsed).toBeNull();
  });

  it("puts the places of lists beyond MAX_LISTS into the default list", () => {
    const full = Array.from({ length: MAX_LISTS }, (_, i) => ({ id: `l${i}`, name: `List ${i}`, isDefault: i === 0, lastUsedAt: null, createdAt: at("2026-01-01") }));
    const result = planDeviceMerge(device, { lists: full, savedListingIds: new Set(), publicListingIds: new Set(["to-kobuleti"]) });
    expect(result.create).toEqual([]);
    expect(result.targets.d_kobu0001).toEqual({ kind: "default" });
  });

  it("a device list named like the default list in any language is the default list (lists-alerts-10)", () => {
    const result = planDeviceMerge(
      { lists: [{ key: "d_saved0001", name: "Saved", usedAt: null, createdAt: T0 }], items: [{ listingId: "x", listKey: "d_saved0001", savedAt: T0 }], defaultUsedAt: null },
      { lists: accountLists, savedListingIds: new Set(), publicListingIds: new Set(["x"]), reservedNameKeys: reservedNameKeys(["שמורים", "Saved"]) },
    );
    expect(result.targets.d_saved0001).toEqual({ kind: "default" });
    expect(result.create).toEqual([]);
    expect(result.add).toEqual([{ listingId: "x", target: { kind: "default" }, savedAt: T0 }]);
  });

  it("an account without a default list yet keeps room for it", () => {
    const named = Array.from({ length: MAX_LISTS - 1 }, (_, i) => ({ id: `l${i}`, name: `List ${i}`, isDefault: false, lastUsedAt: null, createdAt: at("2026-01-01") }));
    const result = planDeviceMerge(device, { lists: named, savedListingIds: new Set(), publicListingIds: new Set() });
    expect(result.create).toEqual([]);
  });
});
