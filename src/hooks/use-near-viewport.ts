"use client";

import { useEffect, useState, type RefObject } from "react";

/**
 * True once the element comes within `rootMargin` of the viewport, and from then on. Use it to
 * start heavy below-the-fold widgets (maps, carousels) only when the visitor scrolls near them.
 */
export function useNearViewport(ref: RefObject<Element | null>, rootMargin = "400px"): boolean {
  const [near, setNear] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (near || !node) return;
    if (typeof IntersectionObserver === "undefined") {
      const id = window.setTimeout(() => setNear(true), 0);
      return () => window.clearTimeout(id);
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          observer.disconnect();
          setNear(true);
        }
      },
      { rootMargin },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [near, ref, rootMargin]);

  return near;
}
