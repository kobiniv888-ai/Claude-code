/**
 * Browser side of the device → account merge (round 3, brief 7.2): the lists a visitor saved on
 * this device while signed out go into their account once they are signed in, and the device copy
 * is emptied. Called by the saved page (signed in), by the heart and by the list sheet before they
 * touch the account. Idempotent on the server (no duplicates, the account wins), so a retry is safe.
 */
import { mergeDeviceListsAction } from "./actions";
import { isDeviceListsEmpty } from "./core";
import { clearDeviceLists, readDeviceLists } from "./device";

export type MergeOutcome = "nothing" | "merged" | "signed_out" | "failed";

let pending: Promise<MergeOutcome> | null = null;

export function mergeDeviceListsIntoAccount(): Promise<MergeOutcome> {
  if (typeof window === "undefined") return Promise.resolve("nothing");
  const device = readDeviceLists();
  if (isDeviceListsEmpty(device)) return Promise.resolve("nothing");
  pending ??= mergeDeviceListsAction(device)
    .then((result): MergeOutcome => {
      if (result.ok) {
        clearDeviceLists();
        return "merged";
      }
      return result.error === "auth_required" ? "signed_out" : "failed";
    })
    .catch((): MergeOutcome => "failed")
    .finally(() => {
      pending = null;
    });
  return pending;
}
