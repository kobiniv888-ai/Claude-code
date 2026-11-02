/** How long after load the non-critical code waits for a first interaction before loading anyway. */
const QUIET_START_MS = 6000;

/**
 * Runs `run` once the page has loaded, the visitor has started using it (the first touch, press,
 * key, wheel or scroll) or 6 s have passed, and then the browser is idle (at most ~2.5 s later):
 * for code that is not needed for the first paint, such as menus, dialogs and sheets. Returns a
 * cancel function, so it can be returned from useEffect. Client-only.
 *
 * Why not right after load: on a phone these preloads (menu, login sheet, bottom sheet, share menu)
 * each cost a 50–150 ms task, and they all landed in the first seconds, while the page was still
 * settling (they were a third of the home page's blocking time in Lighthouse). Waiting for the
 * first interaction keeps that window free; a visitor who taps something still finds its code on
 * the way, since each opener also loads its code at the tap (and replays it where needed).
 */
export function afterLoadIdle(run: () => void): () => void {
  let idle = 0;
  let timer = 0;
  let done = false;
  const events = ["pointerdown", "touchstart", "keydown", "wheel", "scroll"] as const;
  const stopListening = () => {
    window.clearTimeout(timer);
    for (const type of events) window.removeEventListener(type, schedule, true);
  };
  function schedule() {
    if (done) return;
    done = true;
    stopListening();
    if (typeof window.requestIdleCallback === "function") idle = window.requestIdleCallback(run, { timeout: 2500 });
    else timer = window.setTimeout(run, 1500);
  }
  const start = () => {
    for (const type of events) window.addEventListener(type, schedule, { capture: true, passive: true, once: true });
    timer = window.setTimeout(schedule, QUIET_START_MS);
  };
  if (document.readyState === "complete") start();
  else window.addEventListener("load", start, { once: true });
  return () => {
    done = true;
    window.removeEventListener("load", start);
    stopListening();
    if (idle) window.cancelIdleCallback(idle);
  };
}
