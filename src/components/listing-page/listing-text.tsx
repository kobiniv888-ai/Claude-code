"use client";

import { createContext, useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { ChevronDownIcon, LanguagesIcon } from "lucide-react";
import type { LocalizedText } from "@/lib/listing-page/types";
import { cn } from "@/lib/utils";

/**
 * Title and description with the "Auto-translated · Show original" switch: one state for the
 * page, so the switch next to the title changes both texts in place.
 */
type TextState = { showOriginal: boolean; toggle: () => void; title: LocalizedText; description: LocalizedText; translated: boolean };

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
  children,
}: {
  title: LocalizedText;
  description: LocalizedText;
  translated: boolean;
  children: ReactNode;
}) {
  const [showOriginal, setShowOriginal] = useState(false);
  return (
    <TextContext.Provider value={{ showOriginal, toggle: () => setShowOriginal((v) => !v), title, description, translated }}>
      {children}
    </TextContext.Provider>
  );
}

export function ListingTitle({ className }: { className?: string }) {
  const { showOriginal, title, translated } = useListingText();
  return (
    <h1 dir="auto" className={cn("text-h1 text-balance text-foreground", className)}>
      {translated && showOriginal ? title.original : title.shown}
    </h1>
  );
}

/** "Auto-translated · Show original" (or "Translated by the owner · Show original"). */
export function TranslationSwitch({ auto, originalLanguage }: { auto: boolean; originalLanguage: string }) {
  const t = useTranslations("listing.translation");
  const { showOriginal, toggle, translated } = useListingText();
  if (!translated) return null;
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-small text-muted-foreground">
      <LanguagesIcon className="size-4" aria-hidden />
      <span>{showOriginal ? t("showingOriginal", { language: originalLanguage }) : auto ? t("auto") : t("byOwner")}</span>
      <span aria-hidden>·</span>
      <button
        type="button"
        onClick={toggle}
        aria-pressed={showOriginal}
        className="inline-flex min-h-11 items-center rounded font-semibold text-primary underline underline-offset-4 outline-none hover:decoration-2 focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        {showOriginal ? t("showTranslation") : t("showOriginal")}
      </button>
    </p>
  );
}

/** The description, clamped to a few lines with "Read more" when it is longer than that. */
export function ListingDescription() {
  const t = useTranslations("listing.description");
  const { showOriginal, description, translated } = useListingText();
  const text = translated && showOriginal ? description.original : description.shown;
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const id = useId();

  // "Read more" only when the clamped text is really cut (depends on the screen width).
  useEffect(() => {
    const el = box.current;
    if (!el || expanded) return;
    const measure = () => setOverflows(el.scrollHeight > el.clientHeight + 2);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [text, expanded]);

  if (!text) return <p className="text-muted-foreground">{t("empty")}</p>;
  const clamped = !expanded;
  return (
    <div className="grid justify-items-start gap-1">
      <div
        ref={box}
        id={id}
        dir="auto"
        className={cn(
          "w-full text-body leading-relaxed whitespace-pre-line text-foreground/90",
          clamped && "line-clamp-6",
          clamped && overflows && "mask-b-from-50%",
        )}
      >
        {text}
      </div>
      {overflows || expanded ? (
        <button
          type="button"
          className="inline-flex min-h-11 items-center gap-1 rounded font-bold text-primary underline underline-offset-4 outline-none hover:decoration-2 focus-visible:ring-3 focus-visible:ring-ring/50"
          aria-expanded={expanded}
          aria-controls={id}
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? t("showLess") : t("showMore")}
          <ChevronDownIcon className={cn("size-4 transition-transform duration-(--motion-fast) motion-reduce:transition-none", expanded && "rotate-180")} aria-hidden />
        </button>
      ) : null}
    </div>
  );
}
