"use client";

import { useEffect } from "react";

/**
 * Marks the jump-nav chip of the section in view (aria-current="location") and keeps that chip
 * visible in the sideways-scrolling row. Renders nothing; the links work without it.
 */
export function JumpNavSpy({ navId, ids }: { navId: string; ids: string[] }) {
  const key = ids.join(",");
  useEffect(() => {
    const nav = document.getElementById(navId);
    const sectionIds = key.split(",");
    const sections = sectionIds.map((id) => document.getElementById(id)).filter((el): el is HTMLElement => el !== null);
    if (!nav || sections.length === 0) return;

    // Scroll only the chip row (never the page: that would stop a smooth jump in progress).
    const reveal = (link: HTMLElement) => {
      const row = link.closest("ul");
      if (!row) return;
      const chip = link.getBoundingClientRect();
      const box = row.getBoundingClientRect();
      const gap = 16;
      if (chip.left < box.left + gap) row.scrollBy({ left: chip.left - box.left - gap });
      else if (chip.right > box.right - gap) row.scrollBy({ left: chip.right - box.right + gap });
    };

    let current: string | null = null;
    const mark = (id: string | null) => {
      if (id === current) return;
      current = id;
      for (const link of nav.querySelectorAll<HTMLAnchorElement>("a[href^='#']")) {
        if (link.getAttribute("href") === `#${id}`) {
          link.setAttribute("aria-current", "location");
          reveal(link);
        } else link.removeAttribute("aria-current");
      }
    };

    // The current section is the last one whose top has passed a line just under the sticky nav,
    // or under the point a jump lands it (its scroll-margin), whichever is lower. Both are measured
    // each time: the header's height differs between phones and desktops, and on phones the header
    // (and the nav with it) hides while scrolling down. So the chip that was tapped is the one
    // marked. At the very bottom of the page, the last section that shows counts.
    let frame = 0;
    const update = () => {
      frame = 0;
      const navBottom = nav.getBoundingClientRect().bottom;
      const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
      let id: string | null = null;
      for (const section of sections) {
        const box = section.getBoundingClientRect();
        const line = Math.max(navBottom, parseFloat(getComputedStyle(section).scrollMarginTop) || 0) + 12;
        if (box.top <= line || (atBottom && box.top < window.innerHeight)) id = section.id;
      }
      mark(id);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule, { passive: true });
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [navId, key]);
  return null;
}
