"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Menu } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { afterLoadIdle } from "@/lib/idle";
import type { MenuView } from "./mobile-menu-sheet";

// The sheet (Radix Dialog, the rows and their icons, the language/currency/theme pickers) is not
// part of the first load: it loads when the page is idle, when a finger or pointer comes near a
// button, or at the first tap.
const loadSheet = () => import("./mobile-menu-sheet");
const MobileMenuSheet = dynamic(() => loadSheet().then((m) => m.MobileMenuSheet), { ssr: false });

/** White on the purple header (and on the dark one); a 44px touch area around each control. */
const control =
  "relative inline-flex items-center justify-center rounded-full text-header-fg outline-none transition-colors " +
  "before:absolute before:-inset-1.5 before:content-[''] hover:bg-white/10 focus-visible:ring-3 focus-visible:ring-ring/60";

/**
 * Phone header (round 2): a language pill ("HE", white outline) and the menu button, on the side
 * opposite the logo. The pill opens a short sheet with the five languages; the menu button the
 * side menu (./mobile-menu-sheet): Post and log in (or My account) on top, then grouped rows —
 * find a place, Jewish life, help & safety — the language, currency and theme pickers, and the
 * legal pages.
 */
// `postLabel` is kept for callers; the menu uses the short "Post" label next to "Log in".
export function MobileMenu({
  isSignedIn,
  adminLabel,
  languageLabel,
}: {
  isSignedIn: boolean;
  /** Staff only: the "Admin panel" label, from the server (so the menu shows that link). */
  adminLabel?: string;
  postLabel?: string;
  /** The language pill's accessible name, from the server ("שפה: עברית. החלפת שפה"), so the
   * site config with the native names stays out of the first-load script. */
  languageLabel: string;
}) {
  const t = useTranslations("nav");
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<MenuView>("menu");
  /** The sheet stays mounted once wanted, so it can animate closed and open again at once. */
  const [wanted, setWanted] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const languageButton = useRef<HTMLButtonElement>(null);

  useEffect(() => afterLoadIdle(() => void loadSheet()), []);
  const warm = () => void loadSheet();
  const openAs = (next: MenuView) => {
    setView(next);
    setWanted(true);
    setOpen(true);
  };
  const warmProps = { onPointerEnter: warm, onTouchStart: warm, onFocus: warm };
  const sheetOpen = (which: MenuView) => open && view === which;

  return (
    <div className="flex items-center gap-2">
      <button
        ref={languageButton}
        type="button"
        // The visible code is part of the name (WCAG 2.5.3 label in name).
        aria-label={`${locale.toUpperCase()} · ${languageLabel}`}
        aria-haspopup="dialog"
        aria-expanded={sheetOpen("language")}
        className={`${control} h-8 min-w-11 border border-white/75 px-3 text-xs font-medium tracking-wide`}
        onClick={() => openAs("language")}
        {...warmProps}
      >
        <span aria-hidden dir="ltr">
          {locale.toUpperCase()}
        </span>
      </button>
      <button
        ref={menuButton}
        type="button"
        aria-label={t("menu.open")}
        aria-haspopup="dialog"
        aria-expanded={sheetOpen("menu")}
        data-state={sheetOpen("menu") ? "open" : "closed"}
        data-slot="sheet-trigger"
        className={`${control} size-10`}
        onClick={() => openAs("menu")}
        {...warmProps}
      >
        <Menu aria-hidden className="size-6" strokeWidth={1.9} />
      </button>
      {wanted && (
        <MobileMenuSheet
          isSignedIn={isSignedIn}
          adminLabel={adminLabel}
          open={open}
          setOpen={setOpen}
          view={view}
          trigger={view === "language" ? languageButton : menuButton}
        />
      )}
    </div>
  );
}
