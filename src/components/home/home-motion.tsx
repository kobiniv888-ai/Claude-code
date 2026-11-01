/**
 * Home page motion (transform and opacity only), as global classes prefixed "bh-":
 *   bh-slide / bh-zoom[data-zoom]  the hero slideshow crossfade and slow zoom
 *   bh-rise (+ --rise-delay)       headline, sub and search card fade up in a stagger
 *   bh-press / bh-zoom-hover       photo tiles shrink a little when pressed; photo zooms on hover (mouse)
 * Everything is off with prefers-reduced-motion.
 *
 * Why not a CSS module: next.config's Turbopack rule sends every *.css file (modules too) through
 * the Tailwind loader as plain CSS, so `styles.x` is undefined in production. React 19 hoists this
 * <style> into <head> once (href + precedence), so it ships with the page and never repeats.
 */
export const HOME_MOTION_CSS = `
.bh-slide {
  opacity: 0;
  transition: opacity 1.5s var(--ease-standard);
}
.bh-slide[data-shown="true"] {
  opacity: 1;
}
.bh-slide[data-front="true"] {
  z-index: 1;
}

.bh-zoom[data-zoom="a"] {
  animation: bh-hero-zoom-a 8.5s var(--ease-standard) both;
}
.bh-zoom[data-zoom="b"] {
  animation: bh-hero-zoom-b 8.5s var(--ease-standard) both;
}
@keyframes bh-hero-zoom-a {
  from {
    transform: scale(1);
  }
  to {
    transform: scale(1.08);
  }
}
@keyframes bh-hero-zoom-b {
  from {
    transform: scale(1);
  }
  to {
    transform: scale(1.08);
  }
}

.bh-rise {
  animation: bh-rise 0.6s var(--ease-soft) both;
  animation-delay: var(--rise-delay, 0ms);
}
@keyframes bh-rise {
  from {
    opacity: 0;
    transform: translateY(14px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

.bh-press {
  transition: transform var(--motion-fast) var(--ease-standard);
}
.bh-press:active {
  transform: scale(0.98);
}
.bh-zoom-hover {
  transition: transform 0.6s var(--ease-soft);
}
@media (hover: hover) and (pointer: fine) {
  .bh-press:hover .bh-zoom-hover {
    transform: scale(1.06);
  }
}

@media (prefers-reduced-motion: reduce) {
  .bh-slide {
    transition: none;
  }
  .bh-zoom[data-zoom],
  .bh-rise {
    animation: none;
  }
  .bh-press:active,
  .bh-press:hover .bh-zoom-hover {
    transform: none;
  }
}
`;

/** Render once on the page (the hero does). */
export function HomeMotionStyles() {
  return (
    <style href="bayit-home-motion" precedence="medium">
      {HOME_MOTION_CSS}
    </style>
  );
}
