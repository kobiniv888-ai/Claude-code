"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname } from "@/i18n/navigation";
import { headerScrollStep } from "./header-scroll";
import "./header-scroll.css";

/**
 * The sticky header frame: a solid purple bar (dark mode: near-black). On phones and tablets (< 1024px) it slides out of view while scrolling down and comes
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
      setScrolled(window.scrollY > 4);
      const step = headerScrollStep({
        y: window.scrollY,
        lastY,
        compact: compact.matches,
        reducedMotion: reduce.matches,
        // Radix/vaul lock the page while a dialog, sheet or the menu is open.
        locked: document.body.hasAttribute("data-scroll-locked"),
      });
      lastY = step.lastY;
      if (step.hidden !== null) setHidden(step.hidden);
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
        // Round 2: purple (--header-bg) with white text in light mode, #0F0D14 in dark mode. Solid,
        // no shadow; in dark mode a hairline appears once the page scrolls under it.
        "sticky top-0 z-(--z-header) border-b border-transparent bg-header text-header-fg [--ring:var(--header-fg)] transition-[translate] duration-(--motion-base) ease-standard motion-reduce:transition-none " +
        "data-hidden:-translate-y-full dark:data-scrolled:border-border"
      }
    >
      {children}
    </header>
  );
}
