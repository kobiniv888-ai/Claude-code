/**
 * Browser side of the account sync (round 3, brief 4): once per tab after signing in, the device
 * list is merged into the account and the device copy becomes the account's list. Called by the
 * listing page's view tracker (when the view came back as signed in) and by the home page.
 */
import { syncRecentlyViewedAction } from "./actions";
import type { ViewedItem } from "./core";
import { deviceMergedThisSession, markDeviceMerged, recentlyViewedStore, setDeviceViews } from "./device";

let pending: Promise<ViewedItem[] | null> | null = null;

/**
 * Merges this device's list into the signed-in account, once per tab. Returns the account's list
 * after the merge, or null when there was nothing to merge (or it failed; the next page tries again).
 */
export function mergeDeviceIntoAccount(): Promise<ViewedItem[] | null> {
  if (typeof window === "undefined" || deviceMergedThisSession()) return Promise.resolve(null);
  const device = recentlyViewedStore.read();
  if (device.length === 0) return Promise.resolve(null);
  pending ??= syncRecentlyViewedAction(device.map(({ id, at }) => ({ id, at })))
    .then((result) => {
      if (!result.ok) return null;
      markDeviceMerged();
      setDeviceViews(result.data);
      return result.data;
    })
    .catch(() => null)
    .finally(() => {
      pending = null;
    });
  return pending;
}
