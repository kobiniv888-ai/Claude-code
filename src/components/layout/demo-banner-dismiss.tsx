"use client";

import { X } from "lucide-react";
import { dismissAlert } from "./dismissed-alerts";

/** The × of the demo bar: remembers the choice and hides the bar at once (CSS rule in the bar). */
export function DemoBannerDismiss({ alertKey, label }: { alertKey: string; label: string }) {
  return (
    <button
      type="button"
      onClick={() => dismissAlert(alertKey)}
      aria-label={label}
      className="-my-1 ms-auto inline-flex size-11 shrink-0 items-center justify-center rounded-full text-foreground/70 outline-none transition-colors hover:bg-foreground/5 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 sm:ms-1"
    >
      <X aria-hidden className="size-4" />
    </button>
  );
}
