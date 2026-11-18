"use client";

import { useState, type ReactNode } from "react";
import { BottomSheet } from "@/components/ds/bottom-sheet";
import { buttonStyles } from "@/components/ds/button";
import { cn } from "@/lib/utils";

/**
 * "Show all 18" / "Show all": an outline button that opens the full list in a bottom sheet (a
 * dialog on desktop). The list itself is rendered on the server and passed as children.
 */
export function MoreSheet({ label, title, children, className }: { label: ReactNode; title: ReactNode; children: ReactNode; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={cn(buttonStyles({ variant: "secondary" }), "h-11 justify-self-start", className)}>
        {label}
      </button>
      <BottomSheet open={open} onOpenChange={setOpen} title={title}>
        <div className="px-4 pt-2 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))]">{children}</div>
      </BottomSheet>
    </>
  );
}
