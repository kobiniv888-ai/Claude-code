"use client";

import { useEffect, useState, type ReactNode } from "react";

/** The sticky header frame: solid at the top of the page, translucent with a soft shadow once scrolled. */
export function HeaderShell({ children }: { children: ReactNode }) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      setScrolled(window.scrollY > 4);
    };
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <header
      data-scrolled={scrolled || undefined}
      className="sticky top-0 z-40 border-b border-border/70 bg-background transition-[background-color,box-shadow,border-color] duration-300 data-scrolled:border-border/50 data-scrolled:bg-background/80 data-scrolled:shadow-header data-scrolled:backdrop-blur-xl data-scrolled:backdrop-saturate-150"
    >
      {children}
    </header>
  );
}
