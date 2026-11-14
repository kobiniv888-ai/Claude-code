/**
 * The heart's tap (./heart.ts), lists-alerts-12: when the tap first moves the device's saved
 * places into the account, the outcome says so (`merged`), so the heart refreshes the page and
 * the other hearts, drawn from the now-empty device copy, show the account's places.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_DEVICE_LISTS, type DeviceLists } from "./core";

const state = vi.hoisted(() => ({ device: null as unknown, merge: "nothing" as string }));

vi.mock("./device", () => ({ readDeviceLists: () => state.device, writeDeviceLists: () => true }));
vi.mock("./merge-client", () => ({ mergeDeviceListsIntoAccount: vi.fn(async () => state.merge) }));
vi.mock("@/lib/listing/favorites", () => ({
  toggleFavorite: vi.fn(async () => ({ ok: true, data: { isFavorite: true, list: { id: "l", name: "שמורים", isDefault: true, count: 3, shared: false } } })),
}));

const { saveFromHeart } = await import("./heart");

const withPlaces: DeviceLists = { lists: [], items: [{ listingId: "a", listKey: "default", savedAt: 1 }], defaultUsedAt: null };

beforeEach(() => {
  state.device = EMPTY_DEVICE_LISTS;
  state.merge = "nothing";
});

describe("saveFromHeart", () => {
  it("says when it merged the device's places into the account first", async () => {
    state.device = withPlaces;
    state.merge = "merged";
    expect(await saveFromHeart("c", true)).toMatchObject({ kind: "account", isFavorite: true, merged: true });
  });

  it("does not, when the device held nothing", async () => {
    expect(await saveFromHeart("c", true)).toMatchObject({ kind: "account", merged: false });
  });

  it("saves on the device when signed out", async () => {
    state.device = withPlaces;
    state.merge = "signed_out";
    expect(await saveFromHeart("c", true)).toMatchObject({ kind: "device", isFavorite: true });
  });
});
