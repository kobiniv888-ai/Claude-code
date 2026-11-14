import { clearPrivateCaches, clearPrivateDeviceData, markLoggedOut } from "./device-data";

/**
 * Logging out, the same everywhere (round 3, bug 2.9; SECURITY_REPORT 3.5.d): the side menu, the
 * desktop account menu, the bottom of /account, the admin panel, the /two-factor page, the login
 * panel and "log out of all devices" in the settings. Call from the browser:
 *
 *   const result = await logOut({ homeHref: getPathname({ href: "/", locale }) });
 *   if (!result.ok) toast.error(t("logoutError"));
 *
 * 0. places saved on this device while signed out and not merged yet go into the account first
 *    (round 3, brief 7.2; lists-alerts-3): step 3 deletes the device copy. At most 1.5 s.
 * 1. the server ends the session (logOutHere: fails unless the session row is really gone), or,
 *    with `everywhere`, every session of the account (logOutEverywhere, audited for staff). On a
 *    failure nothing else happens: the person stays signed in and sees an error, instead of
 *    believing a session is over that still works.
 * 2. the login library's browser state is reset (its cookie is already gone)
 * 3. this device's private data goes (./device-data.ts); theme, language, consent, currency stay
 * 4. a full page load of `homeHref`, so no page kept in memory still shows the account, and the
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

export async function logOut({
  homeHref,
  everywhere = false,
  keepLists = true,
}: {
  homeHref: string;
  everywhere?: boolean;
  /** False where no lists can exist yet (the /two-factor page, the admin panel). */
  keepLists?: boolean;
}): Promise<LogOutResult> {
  // While the session still exists (step 0).
  if (keepLists) await keepDeviceLists();
  const actions = await import("./logout-actions");
  const result = await (everywhere ? actions.logOutEverywhere() : actions.logOutHere()).catch(() => null);
  if (!result) return { ok: false, error: "network" };
  if (!result.ok) return { ok: false, error: result.error };
  try {
    // Loaded on demand: the login library is not needed to show the menus. The session is
    // already gone on the server; this resets the library's own state in the page.
    const { signOut } = await import("./client");
    await signOut();
  } catch {
    // The server already ended the session: nothing more to do here.
  }
  clearPrivateDeviceData();
  // Trip pages saved for offline use (round 3, brief 7.1) are gone before the page is.
  await clearPrivateCaches();
  markLoggedOut();
  window.location.assign(homeHref);
  return { ok: true };
}
