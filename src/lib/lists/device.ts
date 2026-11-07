/**
 * The device copy of saved lists (round 3, brief 7.2): a signed-out visitor's hearts save here,
 * in localStorage "bayit:saved-lists" (a private key: logging out clears it, see
 * src/lib/auth/device-data.ts). At sign-in it is merged into the account (./merge-client.ts) and
 * emptied.
 *
 * Saving is something the visitor asks for with a tap, so it does not wait for cookie consent
 * (unlike "recently viewed"). Browser only: on the server every read is empty. The rules live in
 * ./core.ts; this file reads (sanitized), writes and announces changes. The heart itself only
 * needs ./device-store.ts.
 */
import { useSyncExternalStore } from "react";
import { EMPTY_DEVICE_LISTS, isDeviceListsEmpty, sanitizeDeviceLists, type DeviceLists } from "./core";
import { DEVICE_LISTS_KEY, deviceStorage, notifyDeviceLists, readDeviceRaw, subscribeDeviceLists } from "./device-store";

export { DEVICE_LISTS_KEY, useDeviceSaved } from "./device-store";

let cache: { raw: string | null; state: DeviceLists } = { raw: null, state: EMPTY_DEVICE_LISTS };

/** The device's lists (empty on the server, when storage is blocked or holds nothing valid). */
export function readDeviceLists(): DeviceLists {
  const raw = readDeviceRaw();
  if (raw === cache.raw) return cache.state;
  let state = EMPTY_DEVICE_LISTS;
  if (raw) {
    try {
      state = sanitizeDeviceLists(JSON.parse(raw));
    } catch {
      state = EMPTY_DEVICE_LISTS;
    }
  }
  cache = { raw, state };
  return state;
}

/** Saves the device's lists (removes the key when nothing is left). False when storage is blocked. */
export function writeDeviceLists(state: DeviceLists): boolean {
  const store = deviceStorage();
  if (!store) return false;
  try {
    if (isDeviceListsEmpty(state)) store.removeItem(DEVICE_LISTS_KEY);
    else store.setItem(DEVICE_LISTS_KEY, JSON.stringify(state));
  } catch {
    return false; // full or blocked
  }
  notifyDeviceLists();
  return true;
}

export function clearDeviceLists(): void {
  writeDeviceLists(EMPTY_DEVICE_LISTS);
}

const serverEmpty = () => EMPTY_DEVICE_LISTS;

/** The device's lists, kept up to date (also across tabs). Empty during server rendering and hydration. */
export function useDeviceLists(): DeviceLists {
  return useSyncExternalStore(subscribeDeviceLists, readDeviceLists, serverEmpty);
}

/** A key for a new device list ("d_" + 12 random URL-safe characters). */
export function newDeviceListKey(): string {
  const bytes = new Uint8Array(9);
  crypto.getRandomValues(bytes);
  return `d_${btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")}`;
}
