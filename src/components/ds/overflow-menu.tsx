"use client";

import { lazy, Suspense, useState, type ReactNode } from "react";
import { EllipsisIcon, EllipsisVerticalIcon } from "lucide-react";
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
      /** "destructive": shown in the danger color (Delete). */
      tone?: "destructive";
    }
  | "separator";

export type OverflowMenuProps = {
  /** The button's accessible name ("More options"). */
  label: string;
  items: OverflowMenuItem[];
  /** Extra classes for the menu panel (e.g. its min width). */
  contentClassName?: string;
  /** The button's look: "outline" (default, a sticky bar) or "ghost" (a title row). */
  variant?: "outline" | "ghost";
  /** The dots: "horizontal" (default) or "vertical". */
  icon?: "horizontal" | "vertical";
  /** Where the menu opens: "top" (default, above a bottom bar) or "bottom". */
  side?: "top" | "bottom";
};

const loadImpl = () => import("./overflow-menu-impl");
const Impl = lazy(() => loadImpl().then((m) => ({ default: m.OverflowMenuImpl })));

/**
 * The round "…" button of a sticky bar (or a title row: variant, icon, side) and its menu, which
 * opens above it (or below) at the end side.
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
      variant={props.variant ?? "outline"}
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
      <OverflowMenuIcon icon={props.icon} />
    </Button>
  );
  if (!wanted) return placeholder;
  return (
    <Suspense fallback={placeholder}>
      <Impl {...props} open={open} onOpenChange={setOpen} />
    </Suspense>
  );
}

/** The button's dots (shared with ./overflow-menu-impl.tsx). */
export function OverflowMenuIcon({ icon }: { icon?: OverflowMenuProps["icon"] }) {
  return icon === "vertical" ? <EllipsisVerticalIcon aria-hidden="true" /> : <EllipsisIcon aria-hidden="true" />;
}
