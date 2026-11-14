import type { toast as sonnerToast } from "sonner";

/**
 * Toasts without loading sonner on page load. Same calls as sonner's `toast` (`toast("…")`,
 * `toast.success(…)`, `toast.error(…)`…), but nothing is returned: the library loads with the
 * <AppToaster> once the page has settled (or at the first toast), and a toast is shown once that
 * is on the page (a toast created before sonner's <Toaster> mounts would be lost).
 *
 *   import { toast } from "@/lib/toast";
 *   toast.success(t("saved"));
 */
type Sonner = typeof sonnerToast;

let markReady: () => void = () => {};
const toasterReady = new Promise<void>((resolve) => {
  markReady = resolve;
});

/** Called by <AppToaster> once sonner's <Toaster> is mounted. */
export function toasterMounted(): void {
  markReady();
}

// <AppToaster> mounts sonner once the page has settled (src/lib/idle.ts), or at once when a toast
// is wanted earlier: sonner adds its stylesheet when it loads, and the page's styles are then
// recalculated (a 15–25 ms task on a phone, in the middle of the page load).
let toastWanted = false;
let onToastWanted: (() => void) | null = null;

/** For <AppToaster>: calls `listener` at the first toast (at once if one was already wanted). */
export function whenToastWanted(listener: () => void): () => void {
  if (toastWanted) {
    listener();
    return () => {};
  }
  onToastWanted = listener;
  return () => {
    if (onToastWanted === listener) onToastWanted = null;
  };
}

function show(run: (sonner: Sonner) => unknown): void {
  if (!toastWanted) {
    toastWanted = true;
    onToastWanted?.();
  }
  void Promise.all([import("sonner"), toasterReady]).then(([module]) => run(module.toast));
}

function base(...args: Parameters<Sonner>): void {
  show((sonner) => sonner(...args));
}

export const toast = Object.assign(base, {
  success: (...args: Parameters<Sonner["success"]>): void => show((sonner) => sonner.success(...args)),
  error: (...args: Parameters<Sonner["error"]>): void => show((sonner) => sonner.error(...args)),
  info: (...args: Parameters<Sonner["info"]>): void => show((sonner) => sonner.info(...args)),
  warning: (...args: Parameters<Sonner["warning"]>): void => show((sonner) => sonner.warning(...args)),
  message: (...args: Parameters<Sonner["message"]>): void => show((sonner) => sonner.message(...args)),
});
