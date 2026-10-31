/**
 * Remembers which site-wide scam alerts a visitor closed (localStorage, this device only).
 * The root layout runs DISMISSED_ALERTS_SCRIPT before the page paints: it copies the list to
 * <html data-dismissed-alerts="…">, and each banner hides itself with a CSS rule, so a closed
 * alert never flashes on the next visit.
 */

export const DISMISSED_ALERTS_KEY = "bayit_dismissed_alerts";
export const DISMISSED_ALERTS_ATTR = "data-dismissed-alerts";
const MAX_REMEMBERED = 20;

/** A banner key: alert id + last edit, so an edited alert shows again. Only [a-z0-9-]. */
export function alertKey(id: string, updatedAt: Date): string | null {
  const key = `${id}-${updatedAt.getTime().toString(36)}`.toLowerCase();
  return /^[a-z0-9-]{1,80}$/.test(key) ? key : null;
}

export const DISMISSED_ALERTS_SCRIPT = `(function(){try{var d=localStorage.getItem(${JSON.stringify(
  DISMISSED_ALERTS_KEY,
)});if(d)document.documentElement.setAttribute(${JSON.stringify(DISMISSED_ALERTS_ATTR)},d)}catch(e){}})();`;

/** Adds a key to a space-separated list, newest last, at most 20 kept. */
export function addDismissed(list: string | null, key: string): string {
  const keys = (list ?? "").split(/\s+/).filter((k) => k && k !== key);
  keys.push(key);
  return keys.slice(-MAX_REMEMBERED).join(" ");
}

/** Browser only: remember the dismissal and hide the banner at once. */
export function dismissAlert(key: string): void {
  try {
    const next = addDismissed(window.localStorage.getItem(DISMISSED_ALERTS_KEY), key);
    window.localStorage.setItem(DISMISSED_ALERTS_KEY, next);
    document.documentElement.setAttribute(DISMISSED_ALERTS_ATTR, next);
  } catch {
    // Storage blocked (private mode): the banner still closes for this page view.
  }
}
