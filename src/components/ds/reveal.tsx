"use client";

import { useEffect, useRef, type CSSProperties, type ElementType } from "react";
import { cn } from "@/lib/utils";

/**
 * Fades its content up (14px, 400ms) the first time it scrolls into view. Stagger siblings
 * with `index` (50ms apart, capped).
 *
 * Only content that starts BELOW the fold is hidden, and only by script, so: no JavaScript or
 * reduced motion = always visible; what is on screen at load never blinks. Don't wrap the LCP
 * element (hero image/headline) — use `animate-fade-up` there.
 *
 *   {cards.map((card, i) => <Reveal key={card.id} index={i}><ListingCard … /></Reveal>)}
 */
let observer: IntersectionObserver | null = null;

function sharedObserver(): IntersectionObserver {
  observer ??= new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const node = entry.target as HTMLElement;
        node.dataset.reveal = "shown";
        observer?.unobserve(node);
      }
    },
    { rootMargin: "0px 0px -8% 0px", threshold: 0.05 },
  );
  return observer;
}

export function Reveal({
  as: Tag = "div",
  index = 0,
  className,
  style,
  children,
  ...props
}: {
  as?: ElementType;
  /** Position among siblings that appear together (stagger). */
  index?: number;
  className?: string;
  style?: CSSProperties;
  children: React.ReactNode;
} & Omit<React.HTMLAttributes<HTMLElement>, "children" | "style" | "className">) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // Already on screen (or above it): leave it alone.
    if (node.getBoundingClientRect().top < window.innerHeight) return;
    node.dataset.reveal = "hidden";
    const io = sharedObserver();
    io.observe(node);
    return () => {
      io.unobserve(node);
      if (node.dataset.reveal === "hidden") delete node.dataset.reveal;
    };
  }, []);

  return (
    <Tag
      ref={ref}
      className={cn(className)}
      style={{ ...style, "--reveal-delay": `${Math.min(index, 8) * 50}ms` } as CSSProperties}
      {...props}
    >
      {children}
    </Tag>
  );
}
