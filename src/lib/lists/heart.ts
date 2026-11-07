/**
 * What a tap on the heart does (loaded at the first tap, so it is not part of any page's first
 * load). Signed in: saves into the list used last, or un-saves (src/lib/listing/favorites.ts).
 * Signed out ("auth_required"): the same on the device copy. Lists this device kept while signed
 * out are merged into the account first, once the visitor is signed in.
 */
import { toggleFavorite } from "@/lib/listing/favorites";
import { DEVICE_DEFAULT_KEY, deviceListOf, deviceRemove, deviceSave, isDeviceListsEmpty, type ListSummary } from "./core";
import { readDeviceLists, writeDeviceLists } from "./device";
import { mergeDeviceListsIntoAccount } from "./merge-client";

export type HeartOutcome =
  | { kind: "account"; isFavorite: boolean; list: ListSummary | null }
  | { kind: "device"; isFavorite: boolean; listName: string | null }
  | { kind: "error"; code: string };

function onDevice(listingId: string, want: boolean): HeartOutcome {
  const state = readDeviceLists();
  if (!want) {
    return writeDeviceLists(deviceRemove(state, listingId)) ? { kind: "device", isFavorite: false, listName: null } : { kind: "error", code: "storage_blocked" };
  }
  const next = deviceSave(state, listingId, deviceListOf(state, listingId));
  if (!next) return { kind: "error", code: "device_full" };
  if (!writeDeviceLists(next)) return { kind: "error", code: "storage_blocked" };
  const key = deviceListOf(next, listingId);
  return { kind: "device", isFavorite: true, listName: key && key !== DEVICE_DEFAULT_KEY ? (next.lists.find((l) => l.key === key)?.name ?? null) : null };
}

export async function saveFromHeart(listingId: string, want: boolean): Promise<HeartOutcome> {
  if (!isDeviceListsEmpty(readDeviceLists())) {
    const merged = await mergeDeviceListsIntoAccount();
    if (merged === "signed_out") return onDevice(listingId, want);
  }
  const result = await toggleFavorite(listingId, want);
  if (result.ok) return { kind: "account", isFavorite: result.data.isFavorite, list: result.data.list };
  if (result.error === "auth_required") return onDevice(listingId, want);
  return { kind: "error", code: result.error };
}
