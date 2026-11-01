"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname } from "@/i18n/navigation";
import "./header-scroll.css";

/** Scrolled at least this far before the header may hide (it always shows near the top). */
const HIDE_AFTER_PX = 96;
/** Ignore tiny scroll jitters (momentum, address-bar resizes). */
const MIN_DELTA_PX = 6;

/**
 * The sticky header frame: solid at the top of the page, translucent with a soft shadow once
 * scrolled. On phones and tablets (< 1024px) it slides out of view while scrolling down and comes
 * back when scrolling up, near the top, on keyboard focus and on every new page. It stays put
 * while a sheet, dialog or the menu is open (the page is scroll-locked then) and with reduced
 * motion. Only `translate` and `opacity` animate.
 */
export function HeaderShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [hidden, setHidden] = useState(false);
  // A new page always starts with the header in view.
  const [shownFor, setShownFor] = useState(pathname);
  if (shownFor !== pathname) {
    setShownFor(pathname);
    setHidden(false);
  }

  useEffect(() => {
    const compact = window.matchMedia("(width < 64rem)");
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    let lastY = Math.max(0, window.scrollY);
    let frame = 0;

    const update = () => {
      frame = 0;
      const y = Math.max(0, window.scrollY);
      setScrolled(y > 4);
      // Radix/vaul lock the page while a dialog, sheet or the menu is open: freeze the header.
      if (document.body.hasAttribute("data-scroll-locked")) {
        lastY = y;
        return;
      }
      if (!compact.matches || reduce.matches || y < HIDE_AFTER_PX) {
        setHidden(false);
        lastY = y;
        return;
      }
      const delta = y - lastY;
      if (Math.abs(delta) < MIN_DELTA_PX) return;
      setHidden(delta > 0);
      lastY = y;
    };
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    const onMediaChange = () => update();

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    compact.addEventListener("change", onMediaChange);
    reduce.addEventListener("change", onMediaChange);
    return () => {
      window.removeEventListener("scroll", onScroll);
      compact.removeEventListener("change", onMediaChange);
      reduce.removeEventListener("change", onMediaChange);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);


  // Lets bars that stick under the header follow it (header-scroll.css).
  useEffect(() => {
    document.documentElement.toggleAttribute("data-header-hidden", hidden);
    return () => document.documentElement.removeAttribute("data-header-hidden");
  }, [hidden]);

  return (
    <header
      data-scrolled={scrolled || undefined}
      data-hidden={hidden || undefined}
      onFocus={() => setHidden(false)}
      className={
        "sticky top-0 z-(--z-header) border-b border-border/70 bg-background transition-[translate] duration-(--motion-base) ease-standard motion-reduce:transition-none " +
        "data-hidden:-translate-y-full " +
        "data-scrolled:border-border/50 data-scrolled:bg-background/85 data-scrolled:backdrop-blur-xl data-scrolled:backdrop-saturate-150 " +
        // The shadow fades in on its own layer (opacity only).
        "after:pointer-events-none after:absolute after:inset-0 after:-z-10 after:opacity-0 after:shadow-header after:transition-opacity after:duration-(--motion-slow) data-scrolled:after:opacity-100"
      }
    >
      {children}
    </header>
  );
}
