"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ExternalLinkIcon, LanguagesIcon } from "lucide-react";
import { BottomSheet } from "@/components/ds/bottom-sheet";
import type { AppLocale } from "@/config/site";
import { googleTranslateUrl } from "@/lib/listing-page/translate-link";
import type { LocalizedText } from "@/lib/listing-page/types";
import { cn } from "@/lib/utils";

/**
 * Title and description with the "Auto-translated · Show original" switch: one state for the
 * page, so the switch next to the title changes both texts in place. Without a translation in the
 * page's language (round 3 brief 2.4) the owner's text shows with lang/dir set, "Original in
 * Georgian" and a "Translate" link (Google Translate in a new tab).
 */
type TextState = {
  showOriginal: boolean;
  toggle: () => void;
  title: LocalizedText;
  description: LocalizedText;
  translated: boolean;
  /** The language the owner wrote in. */
  originalLocale: AppLocale;
  /** The listing's public address (for the Google Translate fallback). */
  pageUrl: string | null;
};

const TextContext = createContext<TextState | null>(null);

function useListingText(): TextState {
  const value = useContext(TextContext);
  if (!value) throw new Error("useListingText must be used inside <ListingTextProvider>");
  return value;
}

export function ListingTextProvider({
  title,
  description,
  translated,
  originalLocale,
  pageUrl = null,
  children,
}: {
  title: LocalizedText;
  description: LocalizedText;
  translated: boolean;
  originalLocale: AppLocale;
  pageUrl?: string | null;
  children: ReactNode;
}) {
  const [showOriginal, setShowOriginal] = useState(false);
  return (
    <TextContext.Provider value={{ showOriginal, toggle: () => setShowOriginal((v) => !v), title, description, translated, originalLocale, pageUrl }}>
      {children}
    </TextContext.Provider>
  );
}

/** The language of the text on screen: the owner's when the original shows, else the page's. */
function useTextLang(): string | undefined {
  const locale = useLocale();
  const { showOriginal, translated, originalLocale } = useListingText();
  const lang = translated && !showOriginal ? locale : originalLocale;
  return lang === locale ? undefined : lang;
}

export function ListingTitle({ className }: { className?: string }) {
  const { showOriginal, title, translated } = useListingText();
  const lang = useTextLang();
  const text = translated && showOriginal ? title.original : title.shown;
  // 22px / 600, at most 3 lines (brief 3.3). The whole title stays in the page for screen readers
  // and copying; the tooltip shows it to mouse users.
  return (
    <h1 dir="auto" lang={lang} title={text} className={cn("line-clamp-3 text-h1 text-foreground", className)}>
      {text}
    </h1>
  );
}

/**
 * "Original in Georgian · Translate" for a listing without a translation in the page's language
 * (nothing when there is one, or when the page is in the owner's language).
 */
export function OriginalLanguageNote({ className }: { className?: string }) {
  const t = useTranslations("listing.translation");
  const locale = useLocale() as AppLocale;
  const { translated, originalLocale, title, description, pageUrl } = useListingText();
  if (translated || originalLocale === locale) return null;
  const href = googleTranslateUrl({ title: title.original, description: description.original, from: originalLocale, to: locale, pageUrl });
  return (
    <p className={cn("flex flex-wrap items-center gap-x-2 gap-y-1 text-small text-muted-foreground", className)}>
      <LanguagesIcon className="size-4" aria-hidden />
      <span>{t(`originalIn.${originalLocale}`)}</span>
      <span aria-hidden>·</span>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex min-h-11 items-center gap-1 rounded font-semibold text-primary-text underline underline-offset-4 outline-none hover:decoration-2 focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        {t("translate")}
        <ExternalLinkIcon className="size-3.5 rtl:-scale-x-100" aria-hidden />
        <span className="sr-only">{t("translateHint")}</span>
      </a>
    </p>
  );
}

/** "Auto-translated · Show original" (or "Translated by the owner · Show original"). */
export function TranslationSwitch({ auto, originalLanguage }: { auto: boolean; originalLanguage: string }) {
  const t = useTranslations("listing.translation");
  const { showOriginal, toggle, translated } = useListingText();
  if (!translated) return <OriginalLanguageNote />;
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-small text-muted-foreground">
      <LanguagesIcon className="size-4" aria-hidden />
      <span>{showOriginal ? t("showingOriginal", { language: originalLanguage }) : auto ? t("auto") : t("byOwner")}</span>
      <span aria-hidden>·</span>
      <button
        type="button"
        onClick={toggle}
        aria-pressed={showOriginal}
        className="inline-flex min-h-11 items-center rounded font-semibold text-primary-text underline underline-offset-4 outline-none hover:decoration-2 focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        {showOriginal ? t("showTranslation") : t("showOriginal")}
      </button>
    </p>
  );
}

/**
 * The description: 5 lines, then "Read more" opens the whole text in a bottom sheet (the
 * translation switch inside it too). "Read more" appears only when the text is really cut.
 */
export function ListingDescription({ footer }: { footer?: ReactNode }) {
  const t = useTranslations("listing.description");
  const { showOriginal, description, translated } = useListingText();
  const lang = useTextLang();
  const text = translated && showOriginal ? description.original : description.shown;
  const [open, setOpen] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  // Depends on the screen width: measure, and again when the box is resized.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => setOverflows(el.scrollHeight > el.clientHeight + 2);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [text]);

  if (!text) return <p className="text-muted-foreground">{t("empty")}</p>;
  return (
    <div className="grid justify-items-start gap-1">
      <div ref={box} dir="auto" lang={lang} className="line-clamp-5 w-full text-body whitespace-pre-line text-foreground">
        {text}
      </div>
      {overflows ? (
        <button
          type="button"
          className="inline-flex min-h-11 items-center rounded font-semibold text-primary-text underline underline-offset-4 outline-none hover:decoration-2 focus-visible:ring-3 focus-visible:ring-ring/50"
          aria-haspopup="dialog"
          onClick={() => setOpen(true)}
        >
          {t("showMore")}
        </button>
      ) : null}
      <BottomSheet open={open} onOpenChange={setOpen} title={t("title")}>
        <div className="grid gap-3 px-4 pt-3 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))]">
          {footer}
          <div dir="auto" lang={lang} className="text-body whitespace-pre-line text-foreground">
            {text}
          </div>
        </div>
      </BottomSheet>
    </div>
  );
}
