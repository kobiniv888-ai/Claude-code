/**
 * Code that loads on demand, at most once at a time, and is then read synchronously:
 *
 *   const skeletons = loadOnce(() => import("./skeletons"));
 *   void skeletons.preload().catch(() => {});   // when idle
 *   const loaded = skeletons.get();             // null until it has arrived
 *
 * Unlike React.lazy, a component read from get() renders in the same frame (no Suspense fallback),
 * and a failed load is never reported as loaded: get() stays null and the next preload() tries
 * again. preload() rejects when the load fails, so callers can tell success from failure.
 */
export type LoadOnce<T> = {
  /** The loaded value, or null while it has not arrived (or the last try failed). */
  get(): T | null;
  /** Starts the load (or joins the one in flight); resolves with the value, rejects on failure. */
  preload(): Promise<T>;
};

export function loadOnce<T>(load: () => Promise<T>): LoadOnce<T> {
  let value: { current: T } | null = null;
  let inFlight: Promise<T> | null = null;
  return {
    get: () => (value ? value.current : null),
    preload() {
      if (value) return Promise.resolve(value.current);
      inFlight ??= load().then(
        (result) => {
          value = { current: result };
          inFlight = null;
          return result;
        },
        (error: unknown) => {
          inFlight = null; // try again next time
          throw error;
        },
      );
      return inFlight;
    },
  };
}
