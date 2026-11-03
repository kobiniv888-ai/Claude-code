import { clearPrivateDeviceData, markLoggedOut } from "./device-data";

/**
 * Logging out, the same everywhere (round 3, bug 2.9): the side menu, the desktop account menu,
 * the bottom of /account and "log out of all devices" in the settings. Call from the browser:
 *
 *   const result = await logOut({ homeHref: getPathname({ href: "/", locale }) });
 *   if (!result.ok) toast.error(t("logoutError"));
 *
 * 1. everywhere: the server ends every session of the account (logOutEverywhere, audited for staff)
 * 2. the login library signs this browser out (its session cookie goes)
 * 3. this device's private data goes (./device-data.ts); theme, language, consent, currency stay
 * 4. a full page load of the home page, so no page kept in memory still shows the account, and the
 *    home page says "התנתקתם" once (<SonnerToaster> reads the flag)
 */
export type LogOutResult = { ok: true } | { ok: false; error: string };

export async function logOut({ homeHref, everywhere = false }: { homeHref: string; everywhere?: boolean }): Promise<LogOutResult> {
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
  markLoggedOut();
  window.location.assign(homeHref);
  return { ok: true };
}
