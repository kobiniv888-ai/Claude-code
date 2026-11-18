"use client";

import { scrollBehavior } from "@/lib/motion";

/** Things a keyboard can land on, in a highlighted field. */
const FOCUSABLE =
  'input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable="true"]';

/** A highlighted field: a Field / FieldGroup / custom block (map, photos) marked by the step. */
const INVALID = '[data-invalid], [aria-invalid="true"], [role="alert"]';

/**
 * After "Some details need your attention" (bug 2.2): scrolls the first highlighted field of the
 * step to the middle of the screen (clear of the sticky bars) and focuses it — its first input,
 * radio or button, or the block itself. Without one, the message itself.
 */
export function focusFirstInvalid(root: HTMLElement | null, fallback: HTMLElement | null): void {
  const target = root?.querySelector<HTMLElement>(INVALID) ?? null;
  const element = target ?? fallback;
  if (!element) return;
  const focusable = element.matches(FOCUSABLE) ? element : element.querySelector<HTMLElement>(FOCUSABLE);
  const focusTarget = focusable ?? element;
  if (!focusable && !focusTarget.hasAttribute("tabindex")) focusTarget.setAttribute("tabindex", "-1");
  element.scrollIntoView({ block: "center", behavior: scrollBehavior() });
  focusTarget.focus({ preventScroll: true });
}
