"use client";

import { lazy, Suspense, useState, type ReactNode } from "react";
import { EllipsisIcon } from "lucide-react";
import { Button } from "@/components/ds/button";

export type OverflowMenuItem =
  | {
      key: string;
      icon: ReactNode;
      label: ReactNode;
      /** A grey second line (e.g. the app name under "Ask the host"). */
      hint?: ReactNode;
      onSelect: () => void;
      disabled?: boolean;
    }
  | "separator";

export type OverflowMenuProps = {
  /** The button's accessible name ("More options"). */
  label: string;
  items: OverflowMenuItem[];
  /** Extra classes for the menu panel (e.g. its min width). */
  contentClassName?: string;
};

const loadImpl = () => import("./overflow-menu-impl");
const Impl = lazy(() => loadImpl().then((m) => ({ default: m.OverflowMenuImpl })));

/**
 * The round "…" button of a sticky bar and its menu, which opens above it at the end side.
 *
 * The menu (Radix dropdown menu and its positioning code, ~35 KB) is not part of the page's first
 * load: until the first tap this is a plain button. The code starts loading when the pointer
 * reaches the button or it gets focus, and the tap that asked for the menu opens it once the
 * code is in (the button stays in place meanwhile), so no tap is lost.
 */
export function OverflowMenu(props: OverflowMenuProps) {
  const [open, setOpen] = useState(false);
  const [wanted, setWanted] = useState(false);
  const placeholder = (
    <Button
      variant="outline"
      size="icon"
      aria-label={props.label}
      aria-haspopup="menu"
      aria-expanded={false}
      onPointerEnter={() => void loadImpl()}
      onPointerDown={() => void loadImpl()}
      onFocus={() => void loadImpl()}
      onClick={() => {
        setWanted(true);
        setOpen(true);
      }}
    >
      <EllipsisIcon aria-hidden="true" />
    </Button>
  );
  if (!wanted) return placeholder;
  return (
    <Suspense fallback={placeholder}>
      <Impl {...props} open={open} onOpenChange={setOpen} />
    </Suspense>
  );
}
