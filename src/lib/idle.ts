/**
 * Runs `run` once the page has loaded and the browser is idle (at most ~2.5 s after load), for
 * code that is not needed for the first paint: menus, dialogs, sheets. Returns a cancel function,
 * so it can be returned from useEffect. Client-only.
 */
export function afterLoadIdle(run: () => void): () => void {
  let idle = 0;
  let timer = 0;
  const schedule = () => {
    if (typeof window.requestIdleCallback === "function") idle = window.requestIdleCallback(run, { timeout: 2500 });
    else timer = window.setTimeout(run, 1500);
  };
  if (document.readyState === "complete") schedule();
  else window.addEventListener("load", schedule, { once: true });
  return () => {
    window.removeEventListener("load", schedule);
    if (idle) window.cancelIdleCallback(idle);
    if (timer) window.clearTimeout(timer);
  };
}
