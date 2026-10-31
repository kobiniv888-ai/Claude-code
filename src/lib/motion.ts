/**
 * Reduced motion for JavaScript-driven movement. CSS animations are calmed in globals.css, but
 * `scrollIntoView({ behavior: "smooth" })` and map fly-to animations ignore that rule.
 * Client-safe; on the server it answers "no preference".
 */

/** True when the visitor asked their system for less motion (prefers-reduced-motion: reduce). */
export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

/** "smooth" scrolling, or an instant jump for people who asked for less motion. */
export function scrollBehavior(): ScrollBehavior {
  return prefersReducedMotion() ? "auto" : "smooth";
}
