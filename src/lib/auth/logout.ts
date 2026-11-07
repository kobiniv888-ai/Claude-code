import { clearPrivateCaches, clearPrivateDeviceData, markLoggedOut } from "./device-data";

/**
 * Logging out, the same everywhere (round 3, bug 2.9): the side menu, the desktop account menu,
 * the bottom of /account and "log out of all devices" in the settings. Call from the browser:
 *
 *   const result = await logOut({ homeHref: getPathname({ href: "/", locale }) });
 *   if (!result.ok) toast.error(t("logoutError"));
 *
 * 0. places saved on this device while signed out and not merged yet go into the account first
 *    (round 3, brief 7.2; lists-alerts-3): step 3 deletes the device copy. At most 1.5 s.
 * 1. everywhere: the server ends every session of the account (logOutEverywhere, audited for staff)
 * 2. the login library signs this browser out (its session cookie goes)
 * 3. this device's private data goes (./device-data.ts); theme, language, consent, currency stay
 * 4. a full page load of the home page, so no page kept in memory still shows the account, and the
 *    home page says "התנתקתם" once (<SonnerToaster> reads the flag)
 */
export type LogOutResult = { ok: true } | { ok: false; error: string };

/** Merges the device's saved lists into the account, waiting at most `maxMs`. Never throws. */
export async function keepDeviceLists(maxMs = 1500): Promise<void> {
  try {
    const { readDeviceRaw } = await import("@/lib/lists/device-store");
    if (!readDeviceRaw()) return;
    const { mergeDeviceListsIntoAccount } = await import("@/lib/lists/merge-client");
    await Promise.race([mergeDeviceListsIntoAccount(), new Promise((resolve) => setTimeout(resolve, maxMs))]);
  } catch {
    // Not merged: the places are lost with the device copy, as before; the logout goes on.
  }
}

export async function logOut({ homeHref, everywhere = false }: { homeHref: string; everywhere?: boolean }): Promise<LogOutResult> {
  // While the session still exists (step 0).
  await keepDeviceLists();
  if (everywhere) {
    const { logOutEverywhere } = await import("./logout-actions");
    const result = await logOutEverywhere().catch(() => null);
    if (!result) return { ok: false, error: "network" };
    if (!result.ok) return { ok: false, error: result.error };
  }
  try {
    // Loaded on demand: the login library is not needed to show the menus.
    const { signOut } = await import("./client");
    const result = await signOut();
    // After "everywhere" the session is already gone: the library still clears its cookie.
    if (result?.error && !everywhere) return { ok: false, error: "logout_failed" };
  } catch {
    if (!everywhere) return { ok: false, error: "network" };
  }
  clearPrivateDeviceData();
  // Trip pages saved for offline use (round 3, brief 7.1) are gone before the page is.
  await clearPrivateCaches();
  markLoggedOut();
  window.location.assign(homeHref);
  return { ok: true };
}
