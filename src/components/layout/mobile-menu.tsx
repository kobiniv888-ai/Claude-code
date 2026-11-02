"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Menu } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { afterLoadIdle } from "@/lib/idle";

// The sheet (Radix Dialog, the rows and their icons, the language/currency/theme pickers) is not
// part of the first load: it loads when the page is idle, when a finger or pointer comes near the
// button, or at the first tap.
const loadSheet = () => import("./mobile-menu-sheet");
const MobileMenuSheet = dynamic(() => loadSheet().then((m) => m.MobileMenuSheet), { ssr: false });

/**
 * Phone header: the menu button and its side sheet (./mobile-menu-sheet). Post and log in (or My
 * account) on top, then grouped rows — find a place, Jewish life, help & safety — the language,
 * currency and theme pickers, and the legal pages.
 */
// `postLabel` is kept for callers; the menu uses the short "Post" label next to "Log in".
export function MobileMenu({ isSignedIn }: { isSignedIn: boolean; postLabel?: string }) {
  const t = useTranslations("nav");
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  /** The sheet stays mounted once wanted, so it can animate closed and open again at once. */
  const [wanted, setWanted] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => afterLoadIdle(() => void loadSheet()), []);
  const warm = () => void loadSheet();

  return (
    <>
      <Button
        ref={trigger}
        type="button"
        variant="outline"
        className="h-10 gap-2 rounded-full border-border bg-card ps-3 pe-2.5 shadow-xs"
        // The visible language code is part of the name (WCAG 2.5.3 label in name).
        aria-label={`${t("menu.open")} · ${locale.toUpperCase()}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        data-state={open ? "open" : "closed"}
        data-slot="sheet-trigger"
        onPointerEnter={warm}
        onTouchStart={warm}
        onFocus={warm}
        onClick={() => {
          setWanted(true);
          setOpen(true);
        }}
      >
        <span aria-hidden className="text-xs font-semibold text-muted-foreground" dir="ltr">
          {locale.toUpperCase()}
        </span>
        <span aria-hidden className="h-4 w-px bg-border" />
        <Menu aria-hidden className="size-5" />
      </Button>
      {wanted && <MobileMenuSheet isSignedIn={isSignedIn} open={open} setOpen={setOpen} trigger={trigger} />}
    </>
  );
}
