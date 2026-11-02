"use client";

import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { afterLoadIdle } from "@/lib/idle";
import { useIsDesktop } from "./use-is-desktop";

// The screen-size hook has its own module (no Radix/vaul); re-exported for existing imports.
export { useIsDesktop };

export type BottomSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Optional element that opens the sheet (rendered as is, e.g. a Chip). */
  trigger?: React.ReactElement;
  /** Shows a "Clear" text button in the header. */
  onClear?: () => void;
  clearLabel?: string;
  /** Pinned under the scrolling body (e.g. "Clear all" + "Show 24 places"). */
  footer?: React.ReactNode;
  /** auto = as tall as the content (up to 90%); full = almost the whole screen (filters). */
  size?: "auto" | "full";
  /** Desktop: a centered dialog (default) or a panel on the end side. */
  desktop?: "dialog" | "side";
  className?: string;
  children: React.ReactNode;
};

const loadImpl = () => import("./bottom-sheet-impl");
const BottomSheetImpl = lazy(() => loadImpl().then((m) => ({ default: m.BottomSheetImpl })));

let preloading: Promise<unknown> | null = null;
/** Fetches the sheet's code ahead of the first opening (shared by every sheet on the page). */
function preloadImpl() {
  preloading ??= loadImpl().catch(() => {
    preloading = null;
  });
}

/** Mounted next to the sheet once its code has arrived: lets it open one commit later. */
function Mounted({ onMount }: { onMount: () => void }) {
  useEffect(onMount, [onMount]);
  return null;
}

/**
 * A bottom sheet on phones (slides up in 250ms over a dimmed page, drag handle, swipe down to close) and
 * a centered dialog — or an end-side panel — from 768px. Header: ×, title, optional "Clear";
 * a scrolling body; an optional pinned footer. Focus moves in and returns to the opener.
 *
 *   <BottomSheet open={open} onOpenChange={setOpen} title="סינון" onClear={reset}
 *     footer={<Button block onClick={apply}>הצגת 24 נכסים</Button>}>…</BottomSheet>
 *
 * Speed: the sheet's code (vaul + Radix Dialog, ./bottom-sheet-impl) is not part of the page's
 * first load. It is fetched once the page is idle or at the first touch, and at the latest when
 * the sheet first opens;
 * until then a closed sheet renders nothing (as before: closed sheets have no markup). The sheet
 * mounts closed and opens one commit later, so the slide-up still plays. With `trigger`, the
 * trigger shows at once and the code loads right away.
 */
export function BottomSheet(props: BottomSheetProps) {
  const { open, trigger } = props;
  const [used, setUsed] = useState(open || !!trigger);
  const [mounted, setMounted] = useState(false);
  const onMount = useCallback(() => setMounted(true), []);
  // Opened for the first time: from now on the sheet stays mounted (so it can slide away).
  if (open && !used) setUsed(true);

  // Fetch the code once the page is idle, or at the first touch/press anywhere (a tap on the
  // sheet's opener then finds it already on its way).
  useEffect(() => {
    if (used) return;
    const cancelIdle = afterLoadIdle(preloadImpl);
    document.addEventListener("pointerdown", preloadImpl, { capture: true, once: true, passive: true });
    return () => {
      cancelIdle();
      document.removeEventListener("pointerdown", preloadImpl, { capture: true });
    };
  }, [used]);

  if (!used) return null;
  return (
    <Suspense fallback={trigger ?? null}>
      <BottomSheetImpl {...props} open={open && mounted} />
      <Mounted onMount={onMount} />
    </Suspense>
  );
}
