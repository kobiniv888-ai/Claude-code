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

/**
 * `merged`: this tap first moved the device's saved places into the account (lists-alerts-12).
 * The page's other hearts were drawn from the device copy, which is now empty: the caller
 * refreshes the page so they show the account's places instead of turning empty.
 */
export type HeartOutcome =
  | { kind: "account"; isFavorite: boolean; list: ListSummary | null; merged: boolean }
  | { kind: "device"; isFavorite: boolean; listName: string | null }
  | { kind: "error"; code: string; merged?: boolean };

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
  let merged = false;
  if (!isDeviceListsEmpty(readDeviceLists())) {
    const outcome = await mergeDeviceListsIntoAccount();
    if (outcome === "signed_out") return onDevice(listingId, want);
    merged = outcome === "merged";
  }
  const result = await toggleFavorite(listingId, want);
  if (result.ok) return { kind: "account", isFavorite: result.data.isFavorite, list: result.data.list, merged };
  if (result.error === "auth_required") return onDevice(listingId, want);
  return { kind: "error", code: result.error, merged };
}
