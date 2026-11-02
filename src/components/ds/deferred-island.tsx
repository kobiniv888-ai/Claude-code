"use client";

import { lazy, Suspense, useEffect, type ComponentType } from "react";
import { afterLoadIdle } from "@/lib/idle";

/**
 * A client component that is rendered on the server as usual but whose JavaScript loads later:
 * when `gate` resolves (idle, near the viewport, a wide screen…). Until then React keeps the
 * server HTML of the suspended boundary as it is, so nothing moves or changes; it hydrates once
 * the code has arrived. Use it for interactive parts that are hidden or far down on first paint.
 *
 *   const FooterPickers = deferredIsland(
 *     () => whenNearViewport("footer"),
 *     () => import("./footer-pickers").then((m) => m.FooterPickers),
 *   );
 *
 * The module passed to `load` must only be imported through `load` (a static import anywhere in
 * the page puts it back into the first load). Pick a gate that usually opens before people reach
 * the part; with `scope`, a tap that comes earlier still works (it is replayed once hydrated).
 */
export function deferredIsland<P extends object>(
  gate: () => Promise<void>,
  load: () => Promise<ComponentType<P>>,
  options: {
    /**
     * A selector for the element around the island's server HTML. A tap on one of its buttons
     * before the code has arrived starts loading at once and is replayed after hydration (React
     * does not replay it), so an early tap opens the menu instead of doing nothing.
     */
    scope?: string;
  } = {},
): ComponentType<P> {
  let pendingButton: number | null = null;
  let stopListening: (() => void) | null = null;

  const opened = () =>
    new Promise<void>((resolve) => {
      const { scope } = options;
      if (!scope) return;
      const onClick = (event: Event) => {
        const root = document.querySelector(scope);
        const button = event.target instanceof Element ? event.target.closest("button") : null;
        if (!root || !button || !root.contains(button)) return;
        pendingButton = [...root.querySelectorAll("button")].indexOf(button);
        resolve();
      };
      document.addEventListener("click", onClick, true);
      stopListening = () => document.removeEventListener("click", onClick, true);
    });

  // Listen from the moment this module runs (before the page hydrates), not from when React first
  // renders the island: React hydrates suspended boundaries only after the rest of the page, so a
  // tap in between would otherwise be missed — and a navigation it started would wait for this
  // island forever (hardening C1).
  const early = typeof window === "undefined" ? null : opened();

  const Lazy = lazy(() =>
    (early ? Promise.race([gate(), early, firstInteraction()]) : Promise.resolve())
      .then(load)
      .then((component) => ({ default: component })),
  );

  /** Mounted with the island once it has hydrated: replays a tap that came too early. */
  function ReplayEarlyTap() {
    useEffect(() => {
      stopListening?.();
      stopListening = null;
      if (pendingButton === null || !options.scope) return;
      const button = document.querySelector(options.scope)?.querySelectorAll("button")[pendingButton];
      pendingButton = null;
      if (!button) return;
      // This effect can run a frame before React has attached the island's own event handlers to
      // the button (a replay then does nothing), so wait for them: React keeps a node's props under
      // a "__reactProps$…" key. Give up waiting after about a second and replay anyway.
      // No cleanup: a one-off that must survive React's development double effect run.
      let tries = 0;
      const replay = () => {
        const ready = Object.keys(button).some((key) => key.startsWith("__reactProps$"));
        if (!ready && ++tries < 60) {
          requestAnimationFrame(replay);
          return;
        }
        // React may already have opened the menu or dialog for that very tap: replaying would close it.
        if (!button.isConnected || button.getAttribute("aria-expanded") === "true" || button.dataset.state === "open") return;
        // Radix menus open on pointerdown, plain buttons on click.
        button.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true, button: 0, pointerType: "mouse" }));
        button.click();
      };
      replay();
    }, []);
    return null;
  }

  function DeferredIsland(props: P) {
    return (
      <Suspense fallback={null}>
        <Lazy {...props} />
        <ReplayEarlyTap />
      </Suspense>
    );
  }
  return DeferredIsland;
}

let interaction: Promise<void> | null = null;
let wake: (() => void) | null = null;

/**
 * Resolves at the first click, key press, form submit or back/forward in the page (shared by all
 * islands). Why every island waits for it too: until an island hydrates, its server HTML is a
 * dehydrated Suspense boundary, and every client-side navigation changes contexts above it
 * (pathname, search params). React must hydrate such a boundary before it can commit the
 * navigation, so with a closed gate (the desktop header tools on a phone, the footer pickers far
 * below) every link, filter chip and "Map" tap would wait forever. Navigations start from one of
 * these events, so the code is already on its way when React needs it. Navigations started from
 * code (a map moved with a finger) call wakeDeferredIslands() instead.
 */
function firstInteraction(): Promise<void> {
  interaction ??= new Promise<void>((resolve) => {
    const events = ["click", "keydown", "submit"] as const;
    const done = () => {
      for (const type of events) document.removeEventListener(type, done, true);
      window.removeEventListener("popstate", done, true);
      wake = null;
      resolve();
    };
    wake = done;
    for (const type of events) document.addEventListener(type, done, true);
    window.addEventListener("popstate", done, true);
  });
  return interaction;
}

// Listen as soon as this module runs: it is part of the root layout's code, which runs before the
// page hydrates, so even the very first tap that React handles is seen (hardening C1).
if (typeof window !== "undefined") void firstInteraction();

/**
 * Loads every waiting island now. Call it before a client-side navigation that no click, key or
 * submit started (e.g. a search after the map was dragged or pinched): the navigation cannot
 * finish until the islands above it have hydrated (hardening C2).
 */
export function wakeDeferredIslands(): void {
  if (typeof window === "undefined") return;
  void firstInteraction();
  wake?.();
}

/** Resolves once `selector` is within `margin` of the viewport, or something in it gets focus. */
export function whenNearViewport(selector: string, margin = "800px"): Promise<void> {
  return new Promise((resolve) => {
    const element = document.querySelector(selector);
    if (!element || typeof IntersectionObserver === "undefined") return resolve();
    // A `display: contents` wrapper has no box of its own: watch what it shows instead.
    const target = getComputedStyle(element).display === "contents" ? (element.firstElementChild ?? element) : element;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          observer.disconnect();
          resolve();
        }
      },
      { rootMargin: margin },
    );
    observer.observe(target);
    element.addEventListener("focusin", () => resolve(), { once: true });
  });
}

/** Resolves when the media query matches (now or later), then once the page is idle or `selector` is pointed at or focused. */
export function whenWideAndIdle(query: string, selector: string): Promise<void> {
  return new Promise((resolve) => {
    const media = window.matchMedia(query);
    const start = () => {
      media.removeEventListener("change", onChange);
      afterLoadIdle(resolve);
      const element = document.querySelector(selector);
      element?.addEventListener("pointerover", () => resolve(), { once: true });
      element?.addEventListener("focusin", () => resolve(), { once: true });
    };
    const onChange = () => {
      if (media.matches) start();
    };
    if (media.matches) start();
    else media.addEventListener("change", onChange);
  });
}
